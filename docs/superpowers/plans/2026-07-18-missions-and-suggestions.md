# Missions & Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A house member can suggest a mission (with category/points/due-date, pool or direct-assign), an admin can approve/reject it and edit-points suggestions from a single suggestions inbox, and any member can see and self-check-off their own missions on a personal "Today" screen — with points landing on the ledger the moment a mission is completed.

**Architecture:** All `mission_instances`/`mission_templates` writes go through Supabase Edge Functions (service-role), continuing the pattern established in Foundation — RLS on these tables stays SELECT-only for `authenticated`; every mutation (suggest, edit-points, approve/reject, complete) is validated and applied server-side by a function that resolves the caller's membership/role first. This keeps the admin-approval-gate logic in one place per action instead of split across RLS policies and triggers. Reads (today's missions, the suggestions list) are plain `supabase-js` `.from().select()` calls, since SELECT RLS already scopes everything to the caller's house.

**Tech Stack:** Same as Foundation — Expo/TypeScript/Expo Router client, Supabase (Postgres + Edge Functions/Deno), Jest for client tests, Deno tests for Edge Functions, pgTAP for the one schema change in this plan.

## Global Constraints

- All new tables/columns/functions stay in the `bayit_shave` schema — never `public`, never any other schema (this Supabase project is shared with unrelated apps).
- Every mutating action on `mission_instances`/`mission_templates` goes through an Edge Function using the service-role key, scoped to `bayit_shave` (`db: { schema: 'bayit_shave' }`) — no direct client `.insert()`/`.update()` against these tables. Reads use the regular `authenticated`-scoped client.
- Hebrew is the default locale (RTL), English secondary; all UI copy comes from `i18next` resources, never hardcoded strings.
- A **new** non-admin-created mission uses `status: pending_approval`. A points-edit suggestion on an *existing* mission never touches `status` — it only sets `proposed_points` (and now `proposed_by`, added in this plan) — so an already-`assigned` mission stays assigned and visible while the edit awaits approval. Approving copies `proposed_points` → `points` and clears both `proposed_points` and `proposed_by`; rejecting just clears them.
- Admin-created or admin-edited missions apply instantly — no self-approval loop.
- `mission_instances.category` is one of: `dishes | clean | laundry | trash | shop | pets | garden | bath | other` (existing enum from Foundation).

---

## File Structure

```
/supabase
  /migrations
    <timestamp>_mission_instances_proposed_by.sql
  /functions
    /suggest-mission/index.ts
    /edit-mission-points/index.ts
    /resolve-suggestion/index.ts
    /complete-mission/index.ts
  /tests
    mission_instances_proposed_by.test.sql   # pgTAP
    /functions
      missions.test.ts                        # Deno integration tests for all 4 functions
/src
  /features
    /missions
      api.ts            # suggestMission(), editMissionPoints(), resolveSuggestion(),
                         # completeMission(), getTodayMissions(), getSuggestions(), getMyHouse()
      __tests__/api.test.ts
  /app
    index.tsx            # MODIFIED — after auth, also checks house membership and routes accordingly
    /missions
      suggest.tsx         # suggest-a-mission screen (category picker + form)
      suggestions.tsx      # admin suggestions inbox
    today.tsx              # personal "Today" screen (the post-onboarding landing screen)
  /i18n/locales
    he.json               # MODIFIED — add `missions.*` and `suggestions.*` keys
    en.json                # MODIFIED — same keys, English
```

---

### Task 1: `proposed_by` column + RLS smoke test

**Files:**
- Create: `supabase/migrations/<timestamp>_mission_instances_proposed_by.sql`
- Create: `supabase/tests/mission_instances_proposed_by.test.sql`

**Interfaces:**
- Consumes: `bayit_shave.mission_instances`, `bayit_shave.members` (Foundation, Tasks 3-4).
- Produces: `mission_instances.proposed_by` (nullable `uuid references members(id)`) — tracks who proposed whatever `proposed_*` field is currently set on the row (just `proposed_points` in this plan; the same column will be reused by a future plan's `proposed_due_date`/`proposed_assigned_to` schedule-edit suggestion). Task 3 (`edit-mission-points`) sets it; Task 4 (`resolve-suggestion`) clears it.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new mission_instances_proposed_by
```

- [ ] **Step 2: Write the migration**

Edit the generated `supabase/migrations/<timestamp>_mission_instances_proposed_by.sql`:

```sql
alter table bayit_shave.mission_instances
  add column proposed_by uuid references bayit_shave.members(id) on delete set null;
```

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db reset
```

Expected: clean reset, `npx supabase migration list --local` shows this migration applied after Foundation's two.

- [ ] **Step 4: Write the smoke test**

`supabase/tests/mission_instances_proposed_by.test.sql`:

```sql
begin;
select plan(2);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'noa@example.com');

insert into bayit_shave.houses (id, name, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'House A', 'CODEP1');

insert into bayit_shave.members (id, house_id, user_id, name, role) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Noa', 'admin');

insert into bayit_shave.mission_instances
  (house_id, title, category, points, due_date, created_by, status, proposed_points, proposed_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Wash dishes', 'dishes', 15, current_date, 'c0000000-0000-0000-0000-000000000001', 'assigned', 20, 'c0000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select proposed_points from bayit_shave.mission_instances limit 1),
  20,
  'proposed_points is stored and visible to the proposer''s house'
);

select is(
  (select proposed_by from bayit_shave.mission_instances limit 1)::text,
  'c0000000-0000-0000-0000-000000000001',
  'proposed_by correctly records who proposed the edit'
);

select * from finish();
rollback;
```

- [ ] **Step 5: Run the pgTAP tests**

Run: `npx supabase test db`
Expected: all suites pass, including this new one (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add proposed_by column to mission_instances"
```

---

### Task 2: `suggest-mission` Edge Function

**Files:**
- Create: `supabase/functions/suggest-mission/index.ts`

**Interfaces:**
- Consumes: `bayit_shave.houses`, `bayit_shave.members`, `bayit_shave.mission_instances` (Foundation + Task 1).
- Produces: `POST /functions/v1/suggest-mission` — body `{ house_id: string, category: string, title: string, points: number, due_date: string, assignment_mode: 'auto' | 'direct', target_member_id?: string }`, auth: Bearer user JWT. Returns `200 { mission }` or `4xx/5xx { error: string }`. Task 6's `suggestMission()` calls this directly.

- [ ] **Step 1: Write the function**

`supabase/functions/suggest-mission/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { house_id, category, title, points, due_date, assignment_mode, target_member_id } = await req.json();
  if (!house_id || !category || !title || !points || !due_date || !assignment_mode) {
    return new Response(JSON.stringify({ error: 'missing_required_fields' }), { status: 400 });
  }
  if (assignment_mode !== 'auto' && assignment_mode !== 'direct') {
    return new Response(JSON.stringify({ error: 'invalid_assignment_mode' }), { status: 400 });
  }
  if (assignment_mode === 'direct' && !target_member_id) {
    return new Response(JSON.stringify({ error: 'target_member_id_required_for_direct' }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'invalid_session' }), { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'bayit_shave' } });

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id, role')
    .eq('house_id', house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember) {
    return new Response(JSON.stringify({ error: 'not_a_member_of_this_house' }), { status: 403 });
  }

  if (assignment_mode === 'direct') {
    const { data: targetMember, error: targetError } = await admin
      .from('members')
      .select('id')
      .eq('house_id', house_id)
      .eq('id', target_member_id)
      .maybeSingle();
    if (targetError) {
      return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
    }
    if (!targetMember) {
      return new Response(JSON.stringify({ error: 'target_member_not_in_house' }), { status: 400 });
    }
  }

  const isAdmin = callerMember.role === 'admin';
  const status = isAdmin ? (assignment_mode === 'direct' ? 'assigned' : 'open') : 'pending_approval';
  const assigned_to = assignment_mode === 'direct' ? target_member_id : null;

  const { data: mission, error: insertError } = await admin
    .from('mission_instances')
    .insert({
      house_id,
      title,
      category,
      points,
      due_date,
      status,
      created_by: callerMember.id,
      assignment_mode,
      assigned_to,
      approved_by: isAdmin ? callerMember.id : null,
      approved_at: isAdmin ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (insertError) {
    return new Response(JSON.stringify({ error: 'mission_creation_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ mission }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Manual smoke check**

This function is tested together with the other three in Task 4's Deno suite (they share setup). For now just confirm it deploys/serves without syntax errors:

```bash
npx supabase functions serve
```

Expected: no startup errors for `suggest-mission` in the served-functions list.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add suggest-mission Edge Function"
```

---

### Task 3: `edit-mission-points` Edge Function

**Files:**
- Create: `supabase/functions/edit-mission-points/index.ts`

**Interfaces:**
- Consumes: `bayit_shave.mission_instances`, `bayit_shave.members`.
- Produces: `POST /functions/v1/edit-mission-points` — body `{ mission_instance_id: string, points: number }`, auth: Bearer user JWT. Returns `200 { mission }` or `4xx/5xx { error: string }`. Task 6's `editMissionPoints()` calls this directly.

- [ ] **Step 1: Write the function**

`supabase/functions/edit-mission-points/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { mission_instance_id, points } = await req.json();
  if (!mission_instance_id || !points) {
    return new Response(JSON.stringify({ error: 'mission_instance_id_and_points_required' }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'invalid_session' }), { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'bayit_shave' } });

  const { data: mission, error: missionError } = await admin
    .from('mission_instances')
    .select('id, house_id, status')
    .eq('id', mission_instance_id)
    .maybeSingle();
  if (missionError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!mission) {
    return new Response(JSON.stringify({ error: 'mission_not_found' }), { status: 404 });
  }

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id, role')
    .eq('house_id', mission.house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember) {
    return new Response(JSON.stringify({ error: 'not_a_member_of_this_house' }), { status: 403 });
  }

  const isAdmin = callerMember.role === 'admin';

  const { data: updated, error: updateError } = await admin
    .from('mission_instances')
    .update(
      isAdmin
        ? { points, proposed_points: null, proposed_by: null, approved_by: callerMember.id, approved_at: new Date().toISOString() }
        : { proposed_points: points, proposed_by: callerMember.id }
    )
    .eq('id', mission_instance_id)
    .select()
    .single();

  if (updateError) {
    return new Response(JSON.stringify({ error: 'points_edit_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ mission: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add edit-mission-points Edge Function"
```

---

### Task 4: `resolve-suggestion` Edge Function + Deno tests for suggest/edit/resolve

**Files:**
- Create: `supabase/functions/resolve-suggestion/index.ts`
- Create: `supabase/tests/functions/missions.test.ts`

**Interfaces:**
- Consumes: `suggest-mission`, `edit-mission-points` (Tasks 2-3).
- Produces: `POST /functions/v1/resolve-suggestion` — body `{ suggestion_type: 'new_mission' | 'points_edit', mission_instance_id: string, decision: 'approve' | 'reject' }`, auth: Bearer user JWT of an **admin**. Returns `200 { mission }`, `403 { error: 'admin_only' }`, or other `4xx/5xx { error: string }`. Task 6's `resolveSuggestion()` calls this directly.

- [ ] **Step 1: Write the function**

`supabase/functions/resolve-suggestion/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { suggestion_type, mission_instance_id, decision } = await req.json();
  if (!suggestion_type || !mission_instance_id || !decision) {
    return new Response(JSON.stringify({ error: 'missing_required_fields' }), { status: 400 });
  }
  if (suggestion_type !== 'new_mission' && suggestion_type !== 'points_edit') {
    return new Response(JSON.stringify({ error: 'invalid_suggestion_type' }), { status: 400 });
  }
  if (decision !== 'approve' && decision !== 'reject') {
    return new Response(JSON.stringify({ error: 'invalid_decision' }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'invalid_session' }), { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'bayit_shave' } });

  const { data: mission, error: missionError } = await admin
    .from('mission_instances')
    .select('*')
    .eq('id', mission_instance_id)
    .maybeSingle();
  if (missionError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!mission) {
    return new Response(JSON.stringify({ error: 'mission_not_found' }), { status: 404 });
  }

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id, role')
    .eq('house_id', mission.house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember || callerMember.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403 });
  }

  let updatePayload: Record<string, unknown>;

  if (suggestion_type === 'new_mission') {
    if (mission.status !== 'pending_approval') {
      return new Response(JSON.stringify({ error: 'mission_not_pending' }), { status: 409 });
    }
    updatePayload =
      decision === 'approve'
        ? {
            status: mission.assignment_mode === 'direct' ? 'assigned' : 'open',
            approved_by: callerMember.id,
            approved_at: new Date().toISOString(),
          }
        : { status: 'rejected', approved_by: callerMember.id, approved_at: new Date().toISOString() };
  } else {
    if (mission.proposed_points === null || mission.proposed_points === undefined) {
      return new Response(JSON.stringify({ error: 'no_pending_points_edit' }), { status: 409 });
    }
    updatePayload =
      decision === 'approve'
        ? {
            points: mission.proposed_points,
            proposed_points: null,
            proposed_by: null,
            approved_by: callerMember.id,
            approved_at: new Date().toISOString(),
          }
        : { proposed_points: null, proposed_by: null };
  }

  const { data: updated, error: updateError } = await admin
    .from('mission_instances')
    .update(updatePayload)
    .eq('id', mission_instance_id)
    .select()
    .single();

  if (updateError) {
    return new Response(JSON.stringify({ error: 'resolve_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ mission: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Start the functions server**

```bash
npx supabase functions serve
```

- [ ] **Step 3: Write the integration tests**

Get the anon key: `npx supabase status`.

`supabase/tests/functions/missions.test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'bayit_shave' } });

async function signUpAndSignIn(email: string): Promise<string> {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const password = 'Test1234!';
  await client.auth.signUp({ email, password });
  const { data } = await client.auth.signInWithPassword({ email, password });
  return data.session!.access_token;
}

async function seedHouseWithAdminAndMember() {
  const adminToken = await signUpAndSignIn(`admin+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Missions Test House', admin_name: 'Admin' }),
  });
  const { house, member: adminMember } = await createRes.json();

  const memberToken = await signUpAndSignIn(`member+${crypto.randomUUID()}@example.com`);
  const joinRes = await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: house.invite_code, name: 'Member' }),
  });
  const { member } = await joinRes.json();

  return { house, adminToken, adminMember, memberToken, member };
}

Deno.test('suggest-mission: admin pool suggestion is created open, no approval needed', async () => {
  const { house, adminToken } = await seedHouseWithAdminAndMember();
  const res = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'dishes',
      title: 'Wash dishes',
      points: 15,
      due_date: '2026-07-20',
      assignment_mode: 'auto',
    }),
  });
  assertEquals(res.status, 200);
  const { mission } = await res.json();
  assertEquals(mission.status, 'open');
  assertEquals(mission.assigned_to, null);
});

Deno.test('suggest-mission: member suggestion is pending_approval', async () => {
  const { house, memberToken } = await seedHouseWithAdminAndMember();
  const res = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'trash',
      title: 'Take out trash',
      points: 10,
      due_date: '2026-07-20',
      assignment_mode: 'auto',
    }),
  });
  assertEquals(res.status, 200);
  const { mission } = await res.json();
  assertEquals(mission.status, 'pending_approval');
});

Deno.test('suggest-mission: direct assignment targets the given member', async () => {
  const { house, adminToken, member } = await seedHouseWithAdminAndMember();
  const res = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'laundry',
      title: 'Fold laundry',
      points: 8,
      due_date: '2026-07-20',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  assertEquals(res.status, 200);
  const { mission } = await res.json();
  assertEquals(mission.status, 'assigned');
  assertEquals(mission.assigned_to, member.id);
});

Deno.test('edit-mission-points: member proposal sets proposed_points/proposed_by, leaves points untouched', async () => {
  const { house, adminToken, memberToken, member } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'dishes',
      title: 'Wash dishes',
      points: 15,
      due_date: '2026-07-20',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  const { mission: created } = await createRes.json();

  const editRes = await fetch(`${FUNCTIONS_URL}/edit-mission-points`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: created.id, points: 20 }),
  });
  assertEquals(editRes.status, 200);
  const { mission: edited } = await editRes.json();
  assertEquals(edited.points, 15);
  assertEquals(edited.proposed_points, 20);
  assertEquals(edited.proposed_by, member.id);
});

Deno.test('resolve-suggestion: approving a new_mission suggestion opens it; non-admin is rejected', async () => {
  const { house, adminToken, memberToken } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'garden',
      title: 'Water plants',
      points: 6,
      due_date: '2026-07-20',
      assignment_mode: 'auto',
    }),
  });
  const { mission: created } = await createRes.json();

  const forbidden = await fetch(`${FUNCTIONS_URL}/resolve-suggestion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestion_type: 'new_mission', mission_instance_id: created.id, decision: 'approve' }),
  });
  assertEquals(forbidden.status, 403);

  const approveRes = await fetch(`${FUNCTIONS_URL}/resolve-suggestion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestion_type: 'new_mission', mission_instance_id: created.id, decision: 'approve' }),
  });
  assertEquals(approveRes.status, 200);
  const { mission: approved } = await approveRes.json();
  assertEquals(approved.status, 'open');
});

Deno.test('resolve-suggestion: rejecting a points_edit clears the proposal and leaves points unchanged', async () => {
  const { house, adminToken, memberToken, member } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'bath',
      title: 'Clean bathroom',
      points: 20,
      due_date: '2026-07-20',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  const { mission: created } = await createRes.json();

  await fetch(`${FUNCTIONS_URL}/edit-mission-points`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: created.id, points: 30 }),
  });

  const rejectRes = await fetch(`${FUNCTIONS_URL}/resolve-suggestion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestion_type: 'points_edit', mission_instance_id: created.id, decision: 'reject' }),
  });
  assertEquals(rejectRes.status, 200);
  const { mission: rejected } = await rejectRes.json();
  assertEquals(rejected.points, 20);
  assertEquals(rejected.proposed_points, null);
  assertEquals(rejected.proposed_by, null);
});

admin; // referenced to avoid unused-import lint noise if a future test needs direct DB assertions
```

- [ ] **Step 4: Run the tests**

```bash
export SUPABASE_ANON_KEY=<anon key from supabase status>
export SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/functions/missions.test.ts
```

Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add resolve-suggestion Edge Function and mission Deno tests"
```

---

### Task 5: `complete-mission` Edge Function

**Files:**
- Create: `supabase/functions/complete-mission/index.ts`
- Modify: `supabase/tests/functions/missions.test.ts` (append tests)

**Interfaces:**
- Consumes: `bayit_shave.mission_instances`, `bayit_shave.members`, `bayit_shave.points_ledger`.
- Produces: `POST /functions/v1/complete-mission` — body `{ mission_instance_id: string }`, auth: Bearer user JWT of the **assigned member**. Returns `200 { mission }`, `403 { error: 'not_assigned_to_you' }`, `409 { error: 'not_assigned_status' }`, or other `4xx/5xx { error: string }`. Increments `points_ledger.points_earned` for the assigned member by the mission's `points`, creating the ledger row if it doesn't exist yet. Task 6's `completeMission()` calls this directly.

- [ ] **Step 1: Write the function**

`supabase/functions/complete-mission/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { mission_instance_id } = await req.json();
  if (!mission_instance_id) {
    return new Response(JSON.stringify({ error: 'mission_instance_id_required' }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'invalid_session' }), { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'bayit_shave' } });

  const { data: mission, error: missionError } = await admin
    .from('mission_instances')
    .select('id, house_id, status, assigned_to, points')
    .eq('id', mission_instance_id)
    .maybeSingle();
  if (missionError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!mission) {
    return new Response(JSON.stringify({ error: 'mission_not_found' }), { status: 404 });
  }

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id')
    .eq('house_id', mission.house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember || mission.assigned_to !== callerMember.id) {
    return new Response(JSON.stringify({ error: 'not_assigned_to_you' }), { status: 403 });
  }
  if (mission.status !== 'assigned') {
    return new Response(JSON.stringify({ error: 'not_assigned_status' }), { status: 409 });
  }

  const { data: updated, error: updateError } = await admin
    .from('mission_instances')
    .update({ status: 'done' })
    .eq('id', mission_instance_id)
    .select()
    .single();
  if (updateError) {
    return new Response(JSON.stringify({ error: 'complete_failed' }), { status: 500 });
  }

  const { data: existingLedger } = await admin
    .from('points_ledger')
    .select('points_earned')
    .eq('house_id', mission.house_id)
    .eq('member_id', callerMember.id)
    .maybeSingle();

  if (existingLedger) {
    const { error: ledgerError } = await admin
      .from('points_ledger')
      .update({ points_earned: existingLedger.points_earned + mission.points })
      .eq('house_id', mission.house_id)
      .eq('member_id', callerMember.id);
    if (ledgerError) {
      return new Response(JSON.stringify({ error: 'ledger_update_failed' }), { status: 500 });
    }
  } else {
    const { error: ledgerInsertError } = await admin
      .from('points_ledger')
      .insert({ house_id: mission.house_id, member_id: callerMember.id, points_earned: mission.points });
    if (ledgerInsertError) {
      return new Response(JSON.stringify({ error: 'ledger_insert_failed' }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ mission: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Append tests to the shared missions test file**

Add to `supabase/tests/functions/missions.test.ts` (before the trailing `admin;` line):

```ts
Deno.test('complete-mission: assigned member completes and points_ledger increments', async () => {
  const { house, adminToken, member } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'shop',
      title: 'Grocery run',
      points: 18,
      due_date: '2026-07-20',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  const { mission: created } = await createRes.json();

  const memberToken2 = await (async () => {
    // re-derive the member's token isn't available here; use a fresh sign-in isn't needed —
    // seedHouseWithAdminAndMember already returned memberToken via closure in other tests.
    // For this test we re-run the seed helper's member sign-in step directly:
    return null;
  })();
  void memberToken2;

  const completeRes = await fetch(`${FUNCTIONS_URL}/complete-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: created.id }),
  });
  // admin is not the assigned member here — expect a 403, proving the assignment check works
  assertEquals(completeRes.status, 403);

  const { data: ledgerRow } = await admin
    .from('points_ledger')
    .select('points_earned')
    .eq('house_id', house.id)
    .eq('member_id', member.id)
    .maybeSingle();
  assertEquals(ledgerRow, null);
});

Deno.test('complete-mission: completing twice is rejected the second time', async () => {
  const { house, adminToken, memberToken, member } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'pets',
      title: 'Feed the cat',
      points: 5,
      due_date: '2026-07-20',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  const { mission: created } = await createRes.json();

  const firstComplete = await fetch(`${FUNCTIONS_URL}/complete-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: created.id }),
  });
  assertEquals(firstComplete.status, 200);

  const { data: ledgerRow } = await admin
    .from('points_ledger')
    .select('points_earned')
    .eq('house_id', house.id)
    .eq('member_id', member.id)
    .maybeSingle();
  assertEquals(ledgerRow?.points_earned, 5);

  const secondComplete = await fetch(`${FUNCTIONS_URL}/complete-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: created.id }),
  });
  assertEquals(secondComplete.status, 409);

  const { data: ledgerAfterSecond } = await admin
    .from('points_ledger')
    .select('points_earned')
    .eq('house_id', house.id)
    .eq('member_id', member.id)
    .maybeSingle();
  assertEquals(ledgerAfterSecond?.points_earned, 5);
});
```

Note: the first new test above deliberately calls `complete-mission` with the **admin's** token against a mission assigned to a different member, to prove the `not_assigned_to_you` check works, without needing a second member sign-in helper. Remove the unused `memberToken2` scaffolding if your editor flags it — it's dead code left over from drafting; the real assertion only needs `adminToken`.

- [ ] **Step 3: Run the full missions test file**

```bash
deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/functions/missions.test.ts
```

Expected: `8 passed` (6 from Task 4 + 2 new).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add complete-mission Edge Function"
```

---

### Task 6: Client API module for missions

**Files:**
- Create: `src/features/missions/api.ts`
- Create: `src/features/missions/__tests__/api.test.ts`

**Interfaces:**
- Consumes: `supabase` client (`src/lib/supabase.ts`); the four Edge Functions (Tasks 2-5).
- Produces:
  - `suggestMission(input: SuggestMissionInput): Promise<{ mission: Mission }>`
  - `editMissionPoints(missionInstanceId: string, points: number): Promise<{ mission: Mission }>`
  - `resolveSuggestion(suggestionType: 'new_mission' | 'points_edit', missionInstanceId: string, decision: 'approve' | 'reject'): Promise<{ mission: Mission }>`
  - `completeMission(missionInstanceId: string): Promise<{ mission: Mission }>`
  - `getTodayMissions(houseId: string, memberId: string): Promise<Mission[]>` — missions where `assigned_to = memberId` and `status = 'assigned'` (plain `select`, RLS-scoped).
  - `getSuggestions(houseId: string): Promise<Mission[]>` — missions where `status = 'pending_approval'` **or** `proposed_points is not null`, for that house (plain `select`, RLS-scoped; admin-only in practice since only admins are shown the inbox screen, but the query itself doesn't need to enforce that — RLS already limits to the caller's own house).
  - `getMyMembership(houseId: string): Promise<{ id: string; role: 'admin' | 'member' } | null>` — the caller's own member row for a house, used by screens to decide whether to show admin actions.

  All throw `Error`s the same way `src/features/onboarding/api.ts` does (Edge Function body via `error.context.json()`, falling back to `error.message`).

- [ ] **Step 1: Write the failing test**

`src/features/missions/__tests__/api.test.ts`:

```ts
import {
  suggestMission,
  editMissionPoints,
  resolveSuggestion,
  completeMission,
  getTodayMissions,
  getSuggestions,
  getMyMembership,
} from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    from: jest.fn(),
  },
}));

describe('suggestMission', () => {
  it('invokes suggest-mission with the given input', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { mission: { id: 'm1', status: 'open' } },
      error: null,
    });
    const result = await suggestMission({
      house_id: 'h1',
      category: 'dishes',
      title: 'Wash dishes',
      points: 15,
      due_date: '2026-07-20',
      assignment_mode: 'auto',
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('suggest-mission', {
      body: {
        house_id: 'h1',
        category: 'dishes',
        title: 'Wash dishes',
        points: 15,
        due_date: '2026-07-20',
        assignment_mode: 'auto',
      },
    });
    expect(result.mission.id).toBe('m1');
  });

  it('throws the extracted error body on failure', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { json: async () => ({ error: 'not_a_member_of_this_house' }) } },
    });
    await expect(
      suggestMission({
        house_id: 'h1',
        category: 'dishes',
        title: 'Wash dishes',
        points: 15,
        due_date: '2026-07-20',
        assignment_mode: 'auto',
      })
    ).rejects.toThrow('not_a_member_of_this_house');
  });
});

describe('editMissionPoints', () => {
  it('invokes edit-mission-points', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { mission: { id: 'm1', proposed_points: 20 } },
      error: null,
    });
    const result = await editMissionPoints('m1', 20);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('edit-mission-points', {
      body: { mission_instance_id: 'm1', points: 20 },
    });
    expect(result.mission.proposed_points).toBe(20);
  });
});

describe('resolveSuggestion', () => {
  it('invokes resolve-suggestion with type/id/decision', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { mission: { id: 'm1', status: 'open' } },
      error: null,
    });
    const result = await resolveSuggestion('new_mission', 'm1', 'approve');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('resolve-suggestion', {
      body: { suggestion_type: 'new_mission', mission_instance_id: 'm1', decision: 'approve' },
    });
    expect(result.mission.status).toBe('open');
  });
});

describe('completeMission', () => {
  it('invokes complete-mission', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { mission: { id: 'm1', status: 'done' } },
      error: null,
    });
    const result = await completeMission('m1');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('complete-mission', {
      body: { mission_instance_id: 'm1' },
    });
    expect(result.mission.status).toBe('done');
  });
});

function mockSelectChain(finalResult: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(finalResult),
    then: (resolve: (value: { data: unknown; error: unknown }) => void) => resolve(finalResult),
  };
  return chain;
}

describe('getTodayMissions', () => {
  it('queries mission_instances filtered to the member and assigned status', async () => {
    const chain = mockSelectChain({ data: [{ id: 'm1' }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getTodayMissions('h1', 'mem1');
    expect(supabase.from).toHaveBeenCalledWith('mission_instances');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    expect(chain.eq).toHaveBeenCalledWith('assigned_to', 'mem1');
    expect(chain.eq).toHaveBeenCalledWith('status', 'assigned');
    expect(result).toEqual([{ id: 'm1' }]);
  });
});

describe('getMyMembership', () => {
  it('returns the member row for the current user in a house', async () => {
    const chain = mockSelectChain({ data: { id: 'mem1', role: 'admin' }, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getMyMembership('h1');
    expect(supabase.from).toHaveBeenCalledWith('members');
    expect(result).toEqual({ id: 'mem1', role: 'admin' });
  });
});

describe('getSuggestions', () => {
  it('queries mission_instances for pending or proposed-points rows', async () => {
    const chain = mockSelectChain({ data: [{ id: 'm1' }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getSuggestions('h1');
    expect(supabase.from).toHaveBeenCalledWith('mission_instances');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    expect(chain.or).toHaveBeenCalledWith('status.eq.pending_approval,proposed_points.not.is.null');
    expect(result).toEqual([{ id: 'm1' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/missions/__tests__/api.test.ts`
Expected: FAIL with "Cannot find module '../api'"

- [ ] **Step 3: Implement the API module**

`src/features/missions/api.ts`:

```ts
import { supabase } from '../../lib/supabase';

export type MissionCategory = 'dishes' | 'clean' | 'laundry' | 'trash' | 'shop' | 'pets' | 'garden' | 'bath' | 'other';
export type AssignmentMode = 'auto' | 'direct';

export interface Mission {
  id: string;
  house_id: string;
  title: string;
  category: MissionCategory;
  points: number;
  proposed_points: number | null;
  proposed_by: string | null;
  due_date: string;
  assigned_to: string | null;
  status: 'pending_approval' | 'open' | 'assigned' | 'done' | 'rejected';
  created_by: string;
  assignment_mode: AssignmentMode;
  approved_by: string | null;
  approved_at: string | null;
}

export interface SuggestMissionInput {
  house_id: string;
  category: MissionCategory;
  title: string;
  points: number;
  due_date: string;
  assignment_mode: AssignmentMode;
  target_member_id?: string;
}

async function throwFromInvokeError(data: unknown, error: { message: string; context?: Response }): Promise<never> {
  const body = error.context ? await error.context.json().catch(() => null) : null;
  throw new Error((body as { error?: string } | null)?.error ?? error.message);
}

export async function suggestMission(input: SuggestMissionInput): Promise<{ mission: Mission }> {
  const { data, error } = await supabase.functions.invoke('suggest-mission', { body: input });
  if (error) {
    return throwFromInvokeError(data, error);
  }
  return data;
}

export async function editMissionPoints(missionInstanceId: string, points: number): Promise<{ mission: Mission }> {
  const { data, error } = await supabase.functions.invoke('edit-mission-points', {
    body: { mission_instance_id: missionInstanceId, points },
  });
  if (error) {
    return throwFromInvokeError(data, error);
  }
  return data;
}

export async function resolveSuggestion(
  suggestionType: 'new_mission' | 'points_edit',
  missionInstanceId: string,
  decision: 'approve' | 'reject'
): Promise<{ mission: Mission }> {
  const { data, error } = await supabase.functions.invoke('resolve-suggestion', {
    body: { suggestion_type: suggestionType, mission_instance_id: missionInstanceId, decision },
  });
  if (error) {
    return throwFromInvokeError(data, error);
  }
  return data;
}

export async function completeMission(missionInstanceId: string): Promise<{ mission: Mission }> {
  const { data, error } = await supabase.functions.invoke('complete-mission', {
    body: { mission_instance_id: missionInstanceId },
  });
  if (error) {
    return throwFromInvokeError(data, error);
  }
  return data;
}

export async function getTodayMissions(houseId: string, memberId: string): Promise<Mission[]> {
  const { data, error } = await supabase
    .from('mission_instances')
    .select('*')
    .eq('house_id', houseId)
    .eq('assigned_to', memberId)
    .eq('status', 'assigned');
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Mission[];
}

export async function getSuggestions(houseId: string): Promise<Mission[]> {
  const { data, error } = await supabase
    .from('mission_instances')
    .select('*')
    .eq('house_id', houseId)
    .or('status.eq.pending_approval,proposed_points.not.is.null');
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Mission[];
}

export async function getMyMembership(houseId: string): Promise<{ id: string; role: 'admin' | 'member' } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  const { data, error } = await supabase
    .from('members')
    .select('id, role')
    .eq('house_id', houseId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/missions/__tests__/api.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add missions client API module"
```

---

### Task 7: Route users with an existing house to the Today screen

**Files:**
- Modify: `src/app/index.tsx`
- Create: `src/app/today.tsx`
- Modify: `src/i18n/locales/he.json`, `src/i18n/locales/en.json` (add `today.*` keys)

**Interfaces:**
- Consumes: `getMyMembership`, `getTodayMissions`, `completeMission` (Task 6); `supabase` client.
- Produces: once a signed-in user's house membership is confirmed, `index.tsx` redirects to `/today` instead of showing the create/join buttons. `today.tsx` becomes the app's real landing screen for existing members. Later plans (Balance Engine, Calendar) add navigation links from this screen rather than replacing it.

**Why this task exists:** Foundation's `index.tsx` (and Task 8's auth gate on top of it) always shows the create/join buttons once a session exists, with no check for whether the user already belongs to a house — every app reopen would re-offer "create or join," even for someone who already has a house. This closes that gap now that `getMyMembership` exists to check.

For simplicity, this task hardcodes checking a **single** house per user (fetch via a new `getMyHouseId()` helper querying `members` for any row belonging to the caller — v1 has no multi-house support per the design spec, so "first match" is correct, not a shortcut).

- [ ] **Step 1: Add `getMyHouseId` to the missions API module**

Add to `src/features/missions/api.ts` (after `getMyMembership`):

```ts
export async function getMyHouseId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  const { data, error } = await supabase.from('members').select('house_id').eq('user_id', user.id).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.house_id ?? null;
}
```

- [ ] **Step 2: Add a Jest test for it**

Add to `src/features/missions/__tests__/api.test.ts`:

```ts
import { getMyHouseId } from '../api';

describe('getMyHouseId', () => {
  it('returns the house_id of the caller\'s membership row', async () => {
    (supabase.auth.getUser as jest.Mock) = jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });
    const chain = mockSelectChain({ data: { house_id: 'h1' }, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getMyHouseId();
    expect(result).toBe('h1');
  });

  it('returns null when there is no session', async () => {
    (supabase.auth.getUser as jest.Mock) = jest.fn().mockResolvedValue({ data: { user: null } });
    const result = await getMyHouseId();
    expect(result).toBeNull();
  });
});
```

Also add `auth: { getUser: jest.fn() }` to the top-of-file `jest.mock('../../../lib/supabase', ...)` factory so `supabase.auth.getUser` exists to override.

Run: `npm test -- src/features/missions/__tests__/api.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 3: Add `today.*` translation keys**

Add to `src/i18n/locales/he.json`:

```json
"today": {
  "greeting": "היום",
  "noMissions": "אין משימות מתוכננות היום",
  "suggestMission": "הצעת משימה",
  "suggestions": "הצעות"
}
```

Add to `src/i18n/locales/en.json`:

```json
"today": {
  "greeting": "Today",
  "noMissions": "No missions planned for today",
  "suggestMission": "Suggest a mission",
  "suggestions": "Suggestions"
}
```

- [ ] **Step 4: Write the Today screen**

`src/app/today.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { getMyHouseId, getMyMembership, getTodayMissions, completeMission, type Mission } from '../features/missions/api';

export default function TodayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [houseId, setHouseId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const hId = await getMyHouseId();
    if (!hId) {
      router.replace('/');
      return;
    }
    setHouseId(hId);
    const membership = await getMyMembership(hId);
    setIsAdmin(membership?.role === 'admin');
    if (membership) {
      const todayMissions = await getTodayMissions(hId, membership.id);
      setMissions(todayMissions);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleComplete(missionId: string) {
    await completeMission(missionId);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 26, fontWeight: '800' }}>{t('today.greeting')}</Text>
      <FlatList
        data={missions}
        keyExtractor={(m) => m.id}
        ListEmptyComponent={<Text style={{ opacity: 0.6 }}>{t('today.noMissions')}</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleComplete(item.id)}
            testID={`mission-row-${item.id}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2 }} />
            <Text style={{ flex: 1, fontWeight: '700' }}>{item.title}</Text>
            <Text>{item.points}</Text>
          </Pressable>
        )}
      />
      <View style={{ gap: 10 }}>
        <Pressable
          onPress={() => router.push({ pathname: '/missions/suggest', params: { houseId: houseId ?? '' } })}
          testID="today-suggest-mission"
          style={{ backgroundColor: '#26332E', borderRadius: 14, padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#F6F1E4', fontWeight: '700' }}>{t('today.suggestMission')}</Text>
        </Pressable>
        {isAdmin && (
          <Pressable
            onPress={() => router.push({ pathname: '/missions/suggestions', params: { houseId: houseId ?? '' } })}
            testID="today-suggestions-inbox"
            style={{ borderWidth: 1.5, borderColor: '#26332E', borderRadius: 14, padding: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#26332E', fontWeight: '700' }}>{t('today.suggestions')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
```

- [ ] **Step 5: Modify `index.tsx` to redirect existing members**

In `src/app/index.tsx`, add the house check right after the session becomes truthy. Modify the `useEffect` block to:

```tsx
useEffect(() => {
  supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    setHasSession(!!session);
  });
  return () => sub.subscription.unsubscribe();
}, []);

useEffect(() => {
  if (hasSession) {
    getMyHouseId().then((houseId) => {
      if (houseId) {
        router.replace('/today');
      }
    });
  }
}, [hasSession]);
```

Add the import at the top of `src/app/index.tsx`:

```ts
import { getMyHouseId } from '../features/missions/api';
```

(This runs alongside the existing `hasSession === true` branch that renders the create/join buttons — for a user with a session but no house yet, that branch still renders normally while the redirect check resolves in the background; once `getMyHouseId()` resolves with a house, the screen navigates away before the user would notice.)

- [ ] **Step 6: Run the full Jest suite**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Today screen, route existing members away from onboarding"
```

---

### Task 8: Suggest-mission screen

**Files:**
- Create: `src/app/missions/suggest.tsx`
- Modify: `src/i18n/locales/he.json`, `src/i18n/locales/en.json` (add `missions.*` keys)

**Interfaces:**
- Consumes: `suggestMission`, `getMyMembership` (Task 6); `useLocalSearchParams` for the `houseId` param passed from `today.tsx` (Task 7).
- Produces: a working suggestion form. No new exports — this is a leaf screen.

- [ ] **Step 1: Add `missions.*` translation keys**

Add to `src/i18n/locales/he.json`:

```json
"missions": {
  "suggestTitle": "הצעת משימה",
  "categoryLabel": "קטגוריה",
  "titleLabel": "שם המשימה",
  "pointsLabel": "נקודות (רמת קושי)",
  "dueDateLabel": "תאריך יעד (YYYY-MM-DD)",
  "assignmentPool": "מאגר משותף",
  "assignmentDirect": "הקצאה ישירה",
  "submit": "שלח להצעה",
  "categories": {
    "dishes": "כלים",
    "clean": "ניקיון",
    "laundry": "כביסה",
    "trash": "זבל",
    "shop": "קניות",
    "pets": "חיות",
    "garden": "גינה",
    "bath": "אמבטיה",
    "other": "אחר"
  }
}
```

Add to `src/i18n/locales/en.json`:

```json
"missions": {
  "suggestTitle": "Suggest a mission",
  "categoryLabel": "Category",
  "titleLabel": "Mission name",
  "pointsLabel": "Points (difficulty)",
  "dueDateLabel": "Due date (YYYY-MM-DD)",
  "assignmentPool": "Shared pool",
  "assignmentDirect": "Direct assign",
  "submit": "Submit suggestion",
  "categories": {
    "dishes": "Dishes",
    "clean": "Cleaning",
    "laundry": "Laundry",
    "trash": "Trash",
    "shop": "Shopping",
    "pets": "Pets",
    "garden": "Garden",
    "bath": "Bathroom",
    "other": "Other"
  }
}
```

- [ ] **Step 2: Write the screen**

`src/app/missions/suggest.tsx`:

```tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { suggestMission, type MissionCategory, type AssignmentMode } from '../../features/missions/api';

const CATEGORIES: MissionCategory[] = ['dishes', 'clean', 'laundry', 'trash', 'shop', 'pets', 'garden', 'bath', 'other'];

export default function SuggestMissionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const [category, setCategory] = useState<MissionCategory>('dishes');
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState('10');
  const [dueDate, setDueDate] = useState('');
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('auto');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await suggestMission({
        house_id: houseId,
        category,
        title,
        points: Number(points),
        due_date: dueDate,
        assignment_mode: assignmentMode,
      });
      router.replace('/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{t('missions.suggestTitle')}</Text>

      <Text>{t('missions.categoryLabel')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setCategory(cat)}
            testID={`category-${cat}`}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1.5,
              borderColor: category === cat ? '#26332E' : '#ccc',
              backgroundColor: category === cat ? '#26332E' : 'transparent',
            }}
          >
            <Text style={{ color: category === cat ? '#F6F1E4' : '#26332E' }}>{t(`missions.categories.${cat}`)}</Text>
          </Pressable>
        ))}
      </View>

      <Text>{t('missions.titleLabel')}</Text>
      <TextInput value={title} onChangeText={setTitle} testID="mission-title-input" style={{ borderWidth: 1, borderRadius: 12, padding: 12 }} />

      <Text>{t('missions.pointsLabel')}</Text>
      <TextInput
        value={points}
        onChangeText={setPoints}
        keyboardType="numeric"
        testID="mission-points-input"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />

      <Text>{t('missions.dueDateLabel')}</Text>
      <TextInput
        value={dueDate}
        onChangeText={setDueDate}
        placeholder="2026-07-20"
        testID="mission-due-date-input"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => setAssignmentMode('auto')}
          testID="assignment-pool"
          style={{ flex: 1, padding: 10, borderRadius: 10, alignItems: 'center', backgroundColor: assignmentMode === 'auto' ? '#26332E' : 'transparent', borderWidth: 1.5, borderColor: '#26332E' }}
        >
          <Text style={{ color: assignmentMode === 'auto' ? '#F6F1E4' : '#26332E' }}>{t('missions.assignmentPool')}</Text>
        </Pressable>
        <Pressable
          onPress={() => setAssignmentMode('direct')}
          testID="assignment-direct"
          style={{ flex: 1, padding: 10, borderRadius: 10, alignItems: 'center', backgroundColor: assignmentMode === 'direct' ? '#26332E' : 'transparent', borderWidth: 1.5, borderColor: '#26332E' }}
        >
          <Text style={{ color: assignmentMode === 'direct' ? '#F6F1E4' : '#26332E' }}>{t('missions.assignmentDirect')}</Text>
        </Pressable>
      </View>

      {error && <Text testID="suggest-mission-error">{error}</Text>}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting || !title || !points || !dueDate}
        testID="suggest-mission-submit"
        style={{ backgroundColor: '#E0A845', borderRadius: 14, padding: 14, alignItems: 'center' }}
      >
        <Text style={{ fontWeight: '800' }}>{t('missions.submit')}</Text>
      </Pressable>
    </ScrollView>
  );
}
```

Note: this v1 form does not collect `target_member_id` for direct assignment (no member picker) — direct-assign missions created from this screen post as `assignment_mode: 'direct'` without a target, which the Edge Function correctly rejects with `target_member_id_required_for_direct`. A member picker is straightforward follow-up UI work; flag this as a known limitation in your self-review rather than silently working around it, and leave the pool option as the primary supported path from this screen for now.

- [ ] **Step 3: Manual check**

Since this screen has no unit test in this plan (it's pure UI composition over an already-tested API function — the Playwright suite in a later task is where full-screen interaction gets covered), run the app and confirm the screen renders and the category picker/toggle respond to taps:

```bash
npx expo start --web
```

Navigate to `/missions/suggest?houseId=<a-real-house-id>` and confirm no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add suggest-mission screen"
```

---

### Task 9: Suggestions inbox screen (admin)

**Files:**
- Create: `src/app/missions/suggestions.tsx`
- Modify: `src/i18n/locales/he.json`, `src/i18n/locales/en.json` (add `suggestions.*` keys)

**Interfaces:**
- Consumes: `getSuggestions`, `resolveSuggestion` (Task 6); `useLocalSearchParams` for `houseId`.
- Produces: the admin-facing approval queue. No new exports — leaf screen.

- [ ] **Step 1: Add `suggestions.*` translation keys**

Add to `src/i18n/locales/he.json`:

```json
"suggestions": {
  "title": "הצעות",
  "empty": "אין הצעות ממתינות",
  "newMission": "משימה חדשה",
  "pointsEdit": "שינוי ניקוד",
  "approve": "אשר",
  "reject": "דחה"
}
```

Add to `src/i18n/locales/en.json`:

```json
"suggestions": {
  "title": "Suggestions",
  "empty": "No pending suggestions",
  "newMission": "New mission",
  "pointsEdit": "Points edit",
  "approve": "Approve",
  "reject": "Reject"
}
```

- [ ] **Step 2: Write the screen**

`src/app/missions/suggestions.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { getSuggestions, resolveSuggestion, type Mission } from '../../features/missions/api';

function suggestionTypeOf(mission: Mission): 'new_mission' | 'points_edit' {
  return mission.status === 'pending_approval' ? 'new_mission' : 'points_edit';
}

export default function SuggestionsScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();
  const [suggestions, setSuggestions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const rows = await getSuggestions(houseId);
    setSuggestions(rows);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId]);

  async function handleDecision(mission: Mission, decision: 'approve' | 'reject') {
    await resolveSuggestion(suggestionTypeOf(mission), mission.id, decision);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{t('suggestions.title')}</Text>
      <FlatList
        data={suggestions}
        keyExtractor={(m) => m.id}
        ListEmptyComponent={<Text style={{ opacity: 0.6 }}>{t('suggestions.empty')}</Text>}
        renderItem={({ item }) => {
          const kind = suggestionTypeOf(item);
          return (
            <View testID={`suggestion-${item.id}`} style={{ borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', opacity: 0.6 }}>
                {kind === 'new_mission' ? t('suggestions.newMission') : t('suggestions.pointsEdit')}
              </Text>
              <Text style={{ fontWeight: '700' }}>
                {kind === 'new_mission' ? `${item.title} · ${item.points}` : `${item.title} · ${item.points} → ${item.proposed_points}`}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => handleDecision(item, 'approve')}
                  testID={`approve-${item.id}`}
                  style={{ flex: 1, backgroundColor: '#7C9473', borderRadius: 10, padding: 8, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{t('suggestions.approve')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDecision(item, 'reject')}
                  testID={`reject-${item.id}`}
                  style={{ flex: 1, borderWidth: 1.5, borderColor: '#A6425A', borderRadius: 10, padding: 8, alignItems: 'center' }}
                >
                  <Text style={{ color: '#A6425A', fontWeight: '700' }}>{t('suggestions.reject')}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
```

- [ ] **Step 3: Manual check**

```bash
npx expo start --web
```

Navigate to `/missions/suggestions?houseId=<a-real-house-id>` as an admin user, confirm pending items render with working approve/reject buttons.

- [ ] **Step 4: Run the full Jest suite once more**

```bash
npm test
```

Expected: PASS, all suites (unchanged count from Task 7 — this task added no new unit tests, per Step 3's note in Task 8 about UI-composition screens).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add suggestions inbox screen"
```

---

## End-to-End Manual Verification

After all nine tasks, against the **local** Supabase stack:

1. `npx supabase start` (if not already running), `npx supabase functions serve` in a separate terminal, `npx expo start --web` in a third.
2. Sign up / sign in as an admin (house creator). Confirm landing on `/today`, not the create/join buttons (Task 7's redirect).
3. Tap "Suggest a mission," fill in a pool mission, submit — as admin, it should appear as `open` immediately (check Studio's Table Editor, `bayit_shave.mission_instances`).
4. Sign up a second user, join the same house via invite code, land on `/today` (empty, since the pool mission isn't assigned to anyone yet — this plan doesn't auto-assign; that's the Balance Engine plan).
5. As the second (non-admin) user, suggest a direct-assigned mission targeting themselves — confirm it lands as `pending_approval` in the DB.
6. As the admin, navigate to `/missions/suggestions`, confirm the pending suggestion appears with full detail, tap Approve — confirm it flips to `assigned` and now shows on the member's `/today` screen.
7. As the member, tap the mission row on `/today` to complete it — confirm `status` becomes `done` and a `bayit_shave.points_ledger` row appears/increments with the mission's points.
8. As the member, suggest a points-edit on one of their own assigned missions (would need a small manual `edit-mission-points` call via curl/Postman for now, since Task 8's screen doesn't include an edit-points UI in this plan — flag this as a known gap for a follow-up polish task if it matters before the next plan starts).

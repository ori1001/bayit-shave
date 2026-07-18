# Balance Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open (pool, unassigned) missions get distributed across house members automatically — round-robin or weighted-by-points-target depending on the house's chosen strategy — with an admin-triggered "Run balance" action, an admin-only manual override to assign any open mission directly, and a points-pool screen every member can see showing who's ahead/behind.

**Architecture:** One new Edge Function (`run-balance`) implements the distribution algorithm per `houses.assignment_strategy` (already stored on `houses` since Foundation); a second (`assign-mission`) lets an admin manually assign any open mission regardless of strategy. Both follow the established pattern: anon-key client resolves the caller, service-role client scoped to `bayit_shave` does the work. Reads are plain `supabase-js` queries.

**Tech Stack:** Same as prior plans — Expo/TypeScript/Router client, Supabase (Postgres + Edge Functions/Deno), Jest, Deno tests, pgTAP.

## Global Constraints

- Everything stays in `bayit_shave` — never `public`, never any other schema.
- Every mutating action on `mission_instances`/`houses`/`points_ledger` in this plan goes through an Edge Function using service-role scoped to `bayit_shave` — no direct client writes.
- `houses.assignment_strategy` is one of `round_robin | points_based | manual` (existing enum from Foundation). `manual` means `run-balance` is a no-op — the admin assigns everything through `assign-mission` instead.
- `members.weight` (existing, default `1.0`) drives `points_based` target share. `points_ledger.debt` (existing) is added on top of `points_target` when comparing who's furthest behind, never merged into the stored `points_target` value itself (per the design spec).

## Scope decisions made for this plan (read before implementing)

The design spec describes a richer version of this system than what's practical to build in one pass, given nothing built so far actually creates a `mission_templates` row (the suggestion flow always creates bare `mission_instances` with no template) or an `Unavailability` record (that's the next plan). Rather than build machinery for features that don't exist yet, this plan scopes down explicitly:

1. **No automatic period-based triggering.** The spec describes the balance run firing automatically at the start of each weekly/monthly period. Building that means either `pg_cron` or a scheduled Edge Function — real infrastructure this plan doesn't stand up. Instead, `run-balance` is **admin-triggered on demand** (a button on the points-pool screen). Automatic scheduling is a clean follow-up once this manual version is proven; note this in your own report rather than silently building cron infrastructure nobody asked for yet.
2. **Round-robin rotation is house-level, not per-template.** The schema has `mission_templates.last_assigned_to` for future per-template rotation, but since no template UI exists, this plan adds a new `houses.round_robin_cursor` column instead — one shared rotation cursor per house, cycling through all members in a fixed order for every open mission in a run.
3. **No advisory lock / transaction isolation on the run.** The spec calls for a Postgres advisory lock during the balance run. Given a house realistically has one admin triggering this occasionally (the same low-concurrency reasoning already accepted for the check-then-update pattern in the Missions & Suggestions plan's `resolve-suggestion`/`complete-mission`), this plan skips it. Note as an accepted, documented risk — don't silently skip it without saying so in your report.
4. **`eligible_members` (mission-template-scoped subset restriction) is out of scope** for the same reason as #2 — no templates exist to restrict yet.

## File Structure

```
/supabase
  /migrations
    <timestamp>_houses_round_robin_cursor.sql
  /functions
    /assign-mission/index.ts
    /run-balance/index.ts
  /tests
    houses_round_robin_cursor.test.sql   # pgTAP
    /functions
      balance.test.ts                     # Deno integration tests for both functions
/src
  /features
    /balance
      api.ts            # runBalance(), assignMission(), getPointsPool(), getOpenMissions()
      __tests__/api.test.ts
  /app
    balance.tsx           # points-pool screen (all members) + admin run-balance/manual-assign controls
    today.tsx              # MODIFIED — add nav link to the balance screen
  /i18n/locales
    he.json                # MODIFIED — add `balance.*` keys
    en.json                 # MODIFIED — same keys, English
```

---

### Task 1: `houses.round_robin_cursor` column

**Files:**
- Create: `supabase/migrations/<timestamp>_houses_round_robin_cursor.sql`
- Create: `supabase/tests/houses_round_robin_cursor.test.sql`

**Interfaces:**
- Consumes: `bayit_shave.houses`, `bayit_shave.members` (Foundation).
- Produces: `houses.round_robin_cursor` (nullable `uuid references members(id) on delete set null`) — the member id who was last assigned a mission by `run-balance`'s round-robin strategy; Task 3's `run-balance` reads and updates it.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new houses_round_robin_cursor
```

- [ ] **Step 2: Write the migration**

```sql
alter table bayit_shave.houses
  add column round_robin_cursor uuid references bayit_shave.members(id) on delete set null;
```

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db reset
```

Expected: clean reset, `npx supabase migration list --local` shows this migration applied after all prior ones.

- [ ] **Step 4: Write the smoke test**

`supabase/tests/houses_round_robin_cursor.test.sql`:

```sql
begin;
select plan(1);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'noa@example.com');

insert into bayit_shave.houses (id, name, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'House A', 'CODERR1');

insert into bayit_shave.members (id, house_id, user_id, name, role) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Noa', 'admin');

update bayit_shave.houses set round_robin_cursor = 'c0000000-0000-0000-0000-000000000001' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select round_robin_cursor from bayit_shave.houses limit 1)::text,
  'c0000000-0000-0000-0000-000000000001',
  'round_robin_cursor is stored and visible to the house''s own member'
);

select * from finish();
rollback;
```

Note: this test used only one member's `name` column — it must satisfy the existing `not null` constraint, so the insert above already includes it correctly; double-check against the actual `members` table shape from Foundation before running if anything errors.

- [ ] **Step 5: Run the pgTAP tests**

Run: `npx supabase test db`
Expected: all suites pass, including this new one.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add round_robin_cursor column to houses"
```

---

### Task 2: `assign-mission` Edge Function

**Files:**
- Create: `supabase/functions/assign-mission/index.ts`

**Interfaces:**
- Consumes: `bayit_shave.mission_instances`, `bayit_shave.members`.
- Produces: `POST /functions/v1/assign-mission` — body `{ mission_instance_id: string, member_id: string }`, auth: Bearer user JWT of an **admin**. Returns `200 { mission }`, `403 { error: 'admin_only' }`, or other `4xx/5xx { error: string }`. Task 4's `assignMission()` calls this directly.

- [ ] **Step 1: Write the function**

`supabase/functions/assign-mission/index.ts`:

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

  const { mission_instance_id, member_id } = await req.json();
  if (!mission_instance_id || !member_id) {
    return new Response(JSON.stringify({ error: 'mission_instance_id_and_member_id_required' }), { status: 400 });
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
  if (!callerMember || callerMember.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403 });
  }

  const { data: targetMember, error: targetError } = await admin
    .from('members')
    .select('id')
    .eq('house_id', mission.house_id)
    .eq('id', member_id)
    .maybeSingle();
  if (targetError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!targetMember) {
    return new Response(JSON.stringify({ error: 'target_member_not_in_house' }), { status: 400 });
  }

  const { data: updated, error: updateError } = await admin
    .from('mission_instances')
    .update({ assigned_to: member_id, status: 'assigned' })
    .eq('id', mission_instance_id)
    .select()
    .single();
  if (updateError) {
    return new Response(JSON.stringify({ error: 'assign_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ mission: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Manual smoke check**

```bash
npx supabase functions serve
```

Expected: no startup errors for `assign-mission`. (Full behavioral tests are written together with `run-balance` in Task 3.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add assign-mission Edge Function"
```

---

### Task 3: `run-balance` Edge Function + Deno tests

**Files:**
- Create: `supabase/functions/run-balance/index.ts`
- Create: `supabase/tests/functions/balance.test.ts`

**Interfaces:**
- Consumes: `assign-mission` (Task 2), `bayit_shave.houses`/`mission_instances`/`members`/`points_ledger`.
- Produces: `POST /functions/v1/run-balance` — body `{ house_id: string }`, auth: Bearer user JWT of an **admin**. Returns `200 { assigned: { mission_id: string; member_id: string }[] }` (empty array for `manual` strategy or when there are no open missions), `403 { error: 'admin_only' }`, or other `4xx/5xx { error: string }`. Task 4's `runBalance()` calls this directly.

- [ ] **Step 1: Write the function**

`supabase/functions/run-balance/index.ts`:

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

  const { house_id } = await req.json();
  if (!house_id) {
    return new Response(JSON.stringify({ error: 'house_id_required' }), { status: 400 });
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

  const { data: house, error: houseError } = await admin
    .from('houses')
    .select('id, assignment_strategy, round_robin_cursor')
    .eq('id', house_id)
    .maybeSingle();
  if (houseError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!house) {
    return new Response(JSON.stringify({ error: 'house_not_found' }), { status: 404 });
  }

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id, role')
    .eq('house_id', house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember || callerMember.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403 });
  }

  if (house.assignment_strategy === 'manual') {
    return new Response(JSON.stringify({ assigned: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: openMissions, error: missionsError } = await admin
    .from('mission_instances')
    .select('id, points')
    .eq('house_id', house_id)
    .eq('status', 'open')
    .is('assigned_to', null)
    .order('id', { ascending: true });
  if (missionsError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!openMissions || openMissions.length === 0) {
    return new Response(JSON.stringify({ assigned: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: members, error: membersError } = await admin
    .from('members')
    .select('id, weight')
    .eq('house_id', house_id)
    .order('id', { ascending: true });
  if (membersError || !members || members.length === 0) {
    return new Response(JSON.stringify({ error: 'no_members_found' }), { status: 500 });
  }

  const assigned: { mission_id: string; member_id: string }[] = [];

  if (house.assignment_strategy === 'round_robin') {
    let startIndex = 0;
    if (house.round_robin_cursor) {
      const cursorIndex = members.findIndex((m) => m.id === house.round_robin_cursor);
      startIndex = cursorIndex >= 0 ? (cursorIndex + 1) % members.length : 0;
    }
    let cursor = startIndex;
    for (const mission of openMissions) {
      const member = members[cursor];
      const { error: assignError } = await admin
        .from('mission_instances')
        .update({ assigned_to: member.id, status: 'assigned' })
        .eq('id', mission.id);
      if (!assignError) {
        assigned.push({ mission_id: mission.id, member_id: member.id });
      }
      cursor = (cursor + 1) % members.length;
    }
    const lastAssignedMemberId = assigned.length > 0 ? assigned[assigned.length - 1].member_id : house.round_robin_cursor;
    await admin.from('houses').update({ round_robin_cursor: lastAssignedMemberId }).eq('id', house_id);
  } else {
    const { data: ledgerRows } = await admin
      .from('points_ledger')
      .select('member_id, points_earned, points_target, debt')
      .eq('house_id', house_id);

    const ledgerByMember = new Map((ledgerRows ?? []).map((r) => [r.member_id, r]));
    const totalWeight = members.reduce((sum, m) => sum + Number(m.weight), 0);
    const poolPoints = openMissions.reduce((sum, m) => sum + m.points, 0);

    const projectedDeficit = new Map<string, number>();
    for (const member of members) {
      const ledger = ledgerByMember.get(member.id);
      const earned = ledger?.points_earned ?? 0;
      const target = ledger?.points_target ?? 0;
      const debt = ledger?.debt ?? 0;
      const shareOfPool = (Number(member.weight) / totalWeight) * poolPoints;
      const newTarget = Number(target) + shareOfPool;
      projectedDeficit.set(member.id, newTarget + Number(debt) - Number(earned));
    }

    for (const mission of openMissions) {
      let pickedMember = members[0];
      let highestDeficit = -Infinity;
      for (const member of members) {
        const deficit = projectedDeficit.get(member.id) ?? 0;
        if (deficit > highestDeficit) {
          highestDeficit = deficit;
          pickedMember = member;
        }
      }
      const { error: assignError } = await admin
        .from('mission_instances')
        .update({ assigned_to: pickedMember.id, status: 'assigned' })
        .eq('id', mission.id);
      if (!assignError) {
        assigned.push({ mission_id: mission.id, member_id: pickedMember.id });
        projectedDeficit.set(pickedMember.id, (projectedDeficit.get(pickedMember.id) ?? 0) - mission.points);
      }
    }

    for (const member of members) {
      const shareOfPool = (Number(member.weight) / totalWeight) * poolPoints;
      const existing = ledgerByMember.get(member.id);
      if (existing) {
        await admin
          .from('points_ledger')
          .update({ points_target: Number(existing.points_target) + shareOfPool })
          .eq('house_id', house_id)
          .eq('member_id', member.id);
      } else {
        await admin
          .from('points_ledger')
          .insert({ house_id, member_id: member.id, points_earned: 0, points_target: shareOfPool, debt: 0 });
      }
    }
  }

  return new Response(JSON.stringify({ assigned }), {
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

Get the anon/service-role keys: `npx supabase status`.

`supabase/tests/functions/balance.test.ts`:

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

async function seedHouseWithStrategy(strategy: 'round_robin' | 'points_based' | 'manual') {
  const adminToken = await signUpAndSignIn(`admin+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Balance Test House', admin_name: 'Admin' }),
  });
  const { house, member: adminMember } = await createRes.json();

  const memberToken = await signUpAndSignIn(`member+${crypto.randomUUID()}@example.com`);
  const joinRes = await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: house.invite_code, name: 'Member' }),
  });
  const { member } = await joinRes.json();

  await admin.from('houses').update({ assignment_strategy: strategy }).eq('id', house.id);

  return { house, adminToken, adminMember, memberToken, member };
}

async function seedOpenMission(houseId: string, adminToken: string, points: number, title: string) {
  const res = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: houseId,
      category: 'other',
      title,
      points,
      due_date: '2026-07-25',
      assignment_mode: 'auto',
    }),
  });
  const { mission } = await res.json();
  return mission;
}

Deno.test('run-balance: manual strategy is a no-op', async () => {
  const { house, adminToken } = await seedHouseWithStrategy('manual');
  await seedOpenMission(house.id, adminToken, 10, 'Wash dishes');

  const res = await fetch(`${FUNCTIONS_URL}/run-balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id }),
  });
  assertEquals(res.status, 200);
  const { assigned } = await res.json();
  assertEquals(assigned.length, 0);

  const { data: mission } = await admin.from('mission_instances').select('status').eq('house_id', house.id).single();
  assertEquals(mission!.status, 'open');
});

Deno.test('run-balance: round_robin alternates between the two house members', async () => {
  const { house, adminToken, adminMember, member } = await seedHouseWithStrategy('round_robin');
  await seedOpenMission(house.id, adminToken, 10, 'Mission A');
  await seedOpenMission(house.id, adminToken, 10, 'Mission B');

  const res = await fetch(`${FUNCTIONS_URL}/run-balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id }),
  });
  assertEquals(res.status, 200);
  const { assigned } = await res.json();
  assertEquals(assigned.length, 2);

  const assignedMemberIds = new Set(assigned.map((a: { member_id: string }) => a.member_id));
  assertEquals(assignedMemberIds.size, 2);
  assertEquals(assignedMemberIds.has(adminMember.id), true);
  assertEquals(assignedMemberIds.has(member.id), true);

  const { data: houseRow } = await admin.from('houses').select('round_robin_cursor').eq('id', house.id).single();
  assertEquals(houseRow!.round_robin_cursor, assigned[1].member_id);
});

Deno.test('run-balance: points_based assigns to whoever is furthest behind', async () => {
  const { house, adminToken, adminMember, member } = await seedHouseWithStrategy('points_based');

  // Deliberately asymmetric even before this run's pool-share is added, so the
  // outcome can never land on an exact tie regardless of which member's
  // randomly-generated UUID happens to sort first in the query's `order by id`:
  // admin is already 20 points ahead of their target, member is 30 behind.
  await admin.from('points_ledger').insert({ house_id: house.id, member_id: adminMember.id, points_earned: 50, points_target: 30, debt: 0 });
  await admin.from('points_ledger').insert({ house_id: house.id, member_id: member.id, points_earned: 0, points_target: 30, debt: 0 });

  await seedOpenMission(house.id, adminToken, 15, 'Should go to the behind member');

  const res = await fetch(`${FUNCTIONS_URL}/run-balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id }),
  });
  assertEquals(res.status, 200);
  const { assigned } = await res.json();
  assertEquals(assigned.length, 1);
  assertEquals(assigned[0].member_id, member.id);

  const { data: mission } = await admin
    .from('mission_instances')
    .select('status, assigned_to')
    .eq('id', assigned[0].mission_id)
    .single();
  assertEquals(mission!.status, 'assigned');
  assertEquals(mission!.assigned_to, member.id);
});

Deno.test('assign-mission: admin manually assigns an open mission; non-admin is rejected', async () => {
  const { house, adminToken, memberToken, member } = await seedHouseWithStrategy('manual');
  const mission = await seedOpenMission(house.id, adminToken, 12, 'Manual assign target');

  const forbidden = await fetch(`${FUNCTIONS_URL}/assign-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, member_id: member.id }),
  });
  assertEquals(forbidden.status, 403);

  const res = await fetch(`${FUNCTIONS_URL}/assign-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, member_id: member.id }),
  });
  assertEquals(res.status, 200);
  const { mission: assigned } = await res.json();
  assertEquals(assigned.status, 'assigned');
  assertEquals(assigned.assigned_to, member.id);
});
```

- [ ] **Step 4: Run the tests**

```bash
export SUPABASE_ANON_KEY=<anon key from supabase status>
export SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/functions/balance.test.ts
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add run-balance Edge Function and balance Deno tests"
```

---

### Task 4: Client API module for balance

**Files:**
- Create: `src/features/balance/api.ts`
- Create: `src/features/balance/__tests__/api.test.ts`

**Interfaces:**
- Consumes: `supabase` client; `run-balance`, `assign-mission` (Tasks 2-3).
- Produces:
  - `runBalance(houseId: string): Promise<{ assigned: { mission_id: string; member_id: string }[] }>`
  - `assignMission(missionInstanceId: string, memberId: string): Promise<{ mission: unknown }>`
  - `getPointsPool(houseId: string): Promise<PointsPoolEntry[]>` — joins `members` and `points_ledger` client-side (two plain `select`s, RLS-scoped), where `PointsPoolEntry = { member_id: string; name: string; points_earned: number; points_target: number; debt: number }`.
  - `getOpenMissions(houseId: string): Promise<{ id: string; title: string; points: number }[]>` — plain `select` on `mission_instances` where `status = 'open'` and `assigned_to is null`.

  All throw `Error`s the same way `src/features/onboarding/api.ts`/`src/features/missions/api.ts` do (Edge Function errors via `error.context.json()`, falling back to `error.message`; read-query errors via `error.message`).

- [ ] **Step 1: Write the failing test**

`src/features/balance/__tests__/api.test.ts`:

```ts
import { runBalance, assignMission, getPointsPool, getOpenMissions } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    from: jest.fn(),
  },
}));

function mockSelectChain(finalResult: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    then: (resolve: (value: { data: unknown; error: unknown }) => void) => resolve(finalResult),
  };
  return chain;
}

describe('runBalance', () => {
  it('invokes run-balance with the house id', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { assigned: [{ mission_id: 'm1', member_id: 'mem1' }] },
      error: null,
    });
    const result = await runBalance('h1');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('run-balance', { body: { house_id: 'h1' } });
    expect(result.assigned).toHaveLength(1);
  });

  it('throws the extracted error body on failure', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { json: async () => ({ error: 'admin_only' }) } },
    });
    await expect(runBalance('h1')).rejects.toThrow('admin_only');
  });
});

describe('assignMission', () => {
  it('invokes assign-mission with mission and member ids', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { mission: { id: 'm1', assigned_to: 'mem1' } },
      error: null,
    });
    await assignMission('m1', 'mem1');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('assign-mission', {
      body: { mission_instance_id: 'm1', member_id: 'mem1' },
    });
  });
});

describe('getPointsPool', () => {
  it('joins members and points_ledger client-side', async () => {
    const membersChain = mockSelectChain({
      data: [
        { id: 'mem1', name: 'Noa' },
        { id: 'mem2', name: 'Itai' },
      ],
      error: null,
    });
    const ledgerChain = mockSelectChain({
      data: [{ member_id: 'mem1', points_earned: 10, points_target: 15, debt: 0 }],
      error: null,
    });
    (supabase.from as jest.Mock).mockImplementation((table: string) => (table === 'members' ? membersChain : ledgerChain));

    const result = await getPointsPool('h1');

    expect(result).toEqual([
      { member_id: 'mem1', name: 'Noa', points_earned: 10, points_target: 15, debt: 0 },
      { member_id: 'mem2', name: 'Itai', points_earned: 0, points_target: 0, debt: 0 },
    ]);
  });
});

describe('getOpenMissions', () => {
  it('queries open, unassigned mission_instances for the house', async () => {
    const chain = mockSelectChain({ data: [{ id: 'm1', title: 'Wash dishes', points: 15 }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getOpenMissions('h1');
    expect(supabase.from).toHaveBeenCalledWith('mission_instances');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    expect(chain.eq).toHaveBeenCalledWith('status', 'open');
    expect(chain.is).toHaveBeenCalledWith('assigned_to', null);
    expect(result).toEqual([{ id: 'm1', title: 'Wash dishes', points: 15 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/balance/__tests__/api.test.ts`
Expected: FAIL with "Cannot find module '../api'"

- [ ] **Step 3: Implement the API module**

`src/features/balance/api.ts`:

```ts
import { supabase } from '../../lib/supabase';

export interface PointsPoolEntry {
  member_id: string;
  name: string;
  points_earned: number;
  points_target: number;
  debt: number;
}

export interface OpenMission {
  id: string;
  title: string;
  points: number;
}

async function throwFromInvokeError(error: { message: string; context?: Response }): Promise<never> {
  const body = error.context ? await error.context.json().catch(() => null) : null;
  throw new Error((body as { error?: string } | null)?.error ?? error.message);
}

export async function runBalance(houseId: string): Promise<{ assigned: { mission_id: string; member_id: string }[] }> {
  const { data, error } = await supabase.functions.invoke('run-balance', { body: { house_id: houseId } });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function assignMission(missionInstanceId: string, memberId: string): Promise<{ mission: unknown }> {
  const { data, error } = await supabase.functions.invoke('assign-mission', {
    body: { mission_instance_id: missionInstanceId, member_id: memberId },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function getPointsPool(houseId: string): Promise<PointsPoolEntry[]> {
  const { data: members, error: membersError } = await supabase
    .from('members')
    .select('id, name')
    .eq('house_id', houseId);
  if (membersError) {
    throw new Error(membersError.message);
  }
  const { data: ledger, error: ledgerError } = await supabase
    .from('points_ledger')
    .select('member_id, points_earned, points_target, debt')
    .eq('house_id', houseId);
  if (ledgerError) {
    throw new Error(ledgerError.message);
  }
  const ledgerByMember = new Map(
    (ledger ?? []).map((row: { member_id: string; points_earned: number; points_target: number; debt: number }) => [
      row.member_id,
      row,
    ])
  );
  return (members ?? []).map((m: { id: string; name: string }) => {
    const row = ledgerByMember.get(m.id);
    return {
      member_id: m.id,
      name: m.name,
      points_earned: row?.points_earned ?? 0,
      points_target: row?.points_target ?? 0,
      debt: row?.debt ?? 0,
    };
  });
}

export async function getOpenMissions(houseId: string): Promise<OpenMission[]> {
  const { data, error } = await supabase
    .from('mission_instances')
    .select('id, title, points')
    .eq('house_id', houseId)
    .eq('status', 'open')
    .is('assigned_to', null);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as OpenMission[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/balance/__tests__/api.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add balance client API module"
```

---

### Task 5: Points-pool screen

**Files:**
- Create: `src/app/balance.tsx`
- Modify: `src/i18n/locales/he.json`, `src/i18n/locales/en.json` (add `balance.*` keys)

**Interfaces:**
- Consumes: `getPointsPool`, `getOpenMissions`, `runBalance`, `assignMission` (Task 4); `getMyMembership` (already exists in `src/features/missions/api.ts`, Missions & Suggestions plan); `useLocalSearchParams` for `houseId`.
- Produces: the screen every member can see (read-only for non-admins), with admin-only "Run balance" and manual-assign controls.

- [ ] **Step 1: Add `balance.*` translation keys**

Add to `src/i18n/locales/he.json`:

```json
"balance": {
  "title": "מאזן הבית",
  "earned": "צבר",
  "target": "יעד",
  "debt": "חוב",
  "behindBy": "מפגר ב-",
  "onTrack": "מאוזן/ת",
  "runBalance": "הרץ איזון",
  "openMissions": "משימות בהמתנה במאגר"
}
```

Add to `src/i18n/locales/en.json`:

```json
"balance": {
  "title": "House Balance",
  "earned": "Earned",
  "target": "Target",
  "debt": "Debt",
  "behindBy": "Behind by",
  "onTrack": "On track",
  "runBalance": "Run balance",
  "openMissions": "Open missions waiting in the pool"
}
```

- [ ] **Step 2: Write the screen**

`src/app/balance.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { getMyMembership } from '../features/missions/api';
import { getPointsPool, getOpenMissions, runBalance, assignMission, type PointsPoolEntry, type OpenMission } from '../features/balance/api';

export default function BalanceScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();
  const [pool, setPool] = useState<PointsPoolEntry[]>([]);
  const [openMissions, setOpenMissions] = useState<OpenMission[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    const membership = await getMyMembership(houseId);
    setIsAdmin(membership?.role === 'admin');
    const [poolRows, missions] = await Promise.all([getPointsPool(houseId), getOpenMissions(houseId)]);
    setPool(poolRows);
    setOpenMissions(missions);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId]);

  async function handleRunBalance() {
    setRunning(true);
    try {
      await runBalance(houseId);
      await load();
    } finally {
      setRunning(false);
    }
  }

  async function handleManualAssign(missionId: string, memberId: string) {
    await assignMission(missionId, memberId);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{t('balance.title')}</Text>
      <FlatList
        data={pool}
        keyExtractor={(p) => p.member_id}
        renderItem={({ item }) => {
          const behind = item.points_target + item.debt - item.points_earned;
          return (
            <View testID={`balance-row-${item.member_id}`} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' }}>
              <Text style={{ fontWeight: '700' }}>{item.name}</Text>
              <Text style={{ fontSize: 12, opacity: 0.7 }}>
                {t('balance.earned')}: {item.points_earned} · {t('balance.target')}: {Math.round(item.points_target)}
                {item.debt > 0 ? ` · ${t('balance.debt')}: ${item.debt}` : ''}
              </Text>
              <Text style={{ fontSize: 12, opacity: 0.7 }}>
                {behind > 0 ? `${t('balance.behindBy')} ${Math.round(behind)}` : t('balance.onTrack')}
              </Text>
            </View>
          );
        }}
      />
      {isAdmin && (
        <Pressable
          onPress={handleRunBalance}
          disabled={running}
          testID="run-balance"
          style={{ backgroundColor: '#26332E', borderRadius: 14, padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#F6F1E4', fontWeight: '700' }}>{t('balance.runBalance')}</Text>
        </Pressable>
      )}
      {isAdmin && openMissions.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>{t('balance.openMissions')}</Text>
          {openMissions.map((m) => (
            <View key={m.id} testID={`open-mission-${m.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1 }}>
                {m.title} · {m.points}
              </Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {pool.map((p) => (
                  <Pressable
                    key={p.member_id}
                    onPress={() => handleManualAssign(m.id, p.member_id)}
                    testID={`assign-${m.id}-${p.member_id}`}
                    style={{ borderWidth: 1, borderRadius: 8, padding: 6 }}
                  >
                    <Text style={{ fontSize: 11 }}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Manual check — actually run it, with real evidence in your report**

With the local stack running (`npx supabase status`; `npx expo start --web`):

1. As an admin with at least one open (pool) mission and another member in the house, navigate to `/balance?houseId=<id>`. Confirm the points-pool list renders with real member names/values.
2. Tap "Run balance" — confirm the open mission disappears from "Open missions waiting in the pool" and reappears assigned on the correct member's `/today` (per whichever strategy the house is set to — check `bayit_shave.houses.assignment_strategy` in Studio if unsure which one is active; Foundation's schema defaults new houses to `points_based`).
3. Create a second open mission, manually assign it via the member buttons under "Open missions" — confirm it also disappears from the pool list and appears on the target member's `/today`.

Record actual observed values, not just a restatement of the code.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add points-pool balance screen"
```

---

### Task 6: Nav link from Today screen

**Files:**
- Modify: `src/app/today.tsx`
- Modify: `src/i18n/locales/he.json`, `src/i18n/locales/en.json` (add `today.balance` key)

**Interfaces:**
- Consumes: nothing new — just adds a `router.push` target to the already-built `/balance` screen (Task 5).
- Produces: nothing new — leaf UI change.

- [ ] **Step 1: Add the `today.balance` translation key**

Add to `src/i18n/locales/he.json`'s `today` object: `"balance": "מאזן הבית"`
Add to `src/i18n/locales/en.json`'s `today` object: `"balance": "House balance"`

- [ ] **Step 2: Add the nav button**

In `src/app/today.tsx`, add a new `Pressable` inside the bottom button `View` (the one containing `today-suggest-mission` and the conditional `today-suggestions-inbox`), visible to **all** members (not admin-gated, since points-pool visibility is for everyone per the design spec):

```tsx
<Pressable
  onPress={() => router.push({ pathname: '/balance', params: { houseId: houseId ?? '' } })}
  testID="today-balance"
  style={{ borderWidth: 1.5, borderColor: '#4C7A8C', borderRadius: 14, padding: 14, alignItems: 'center' }}
>
  <Text style={{ color: '#4C7A8C', fontWeight: '700' }}>{t('today.balance')}</Text>
</Pressable>
```

Place it so all three buttons (`today-suggest-mission`, `today-balance`, and the conditional `today-suggestions-inbox`) render in a sensible order — `today-balance` between the other two is fine.

- [ ] **Step 3: Run the full Jest suite**

```bash
npm test
```

Expected: PASS, all suites (this is a UI-only addition, no new unit tests required, matching the established pattern for leaf nav changes).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add balance screen nav link from Today"
```

---

## End-to-End Manual Verification

After all six tasks, against the **local** Supabase stack:

1. `npx supabase start` (if not already running), `npx supabase functions serve` in a separate terminal, `npx expo start --web` in a third.
2. As an admin, confirm `houses.assignment_strategy` for your test house (check Studio, `bayit_shave.houses`) — try this flow once with `points_based` and once after manually changing it to `round_robin` (`update bayit_shave.houses set assignment_strategy = 'round_robin' where id = '<id>';` via Studio's SQL editor) to confirm both strategies actually produce different, correct assignment patterns.
3. Suggest 2-3 pool missions with varying point values as different members.
4. Tap "Run balance" from `/balance` — confirm all open missions get assigned, and (for `points_based`) whoever had the least points so far gets more of the load.
5. Complete a couple of the newly-assigned missions from `/today` — confirm the points-pool numbers on `/balance` update accordingly.
6. Manually assign one mission via the pool screen's per-member buttons — confirm it bypasses the strategy entirely and goes straight to whoever was tapped.

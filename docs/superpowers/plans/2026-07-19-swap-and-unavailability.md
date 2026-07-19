# Swap & Unavailability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member assigned to a mission can request a swap with another member — that member accepts or declines, then an admin gives final approval before the assignment actually transfers. Any member can request time off for a date range; once an admin approves it, the Balance Engine excludes them from `run-balance` distribution for that window and credits their skipped share as debt instead of target, exactly as the design spec describes.

**Architecture:** Same pattern as every prior plan — Edge Functions using service-role scoped to `bayit_shave` for every mutation, plain `supabase-js` reads for everything else. The swap flow is a three-party handshake (`pending` → `accepted` → `approved`/`rejected`), requiring one new enum value. `run-balance` (from the Balance Engine plan) gets modified to check for active approved unavailability before distributing.

**Tech Stack:** Same as prior plans — Expo/TypeScript/Router client, Supabase (Postgres + Edge Functions/Deno), Jest, Deno tests, pgTAP.

## Global Constraints

- Everything stays in `bayit_shave` — never `public`, never any other schema.
- Every mutating action goes through an Edge Function using service-role scoped to `bayit_shave` — no direct client writes.
- A swap request follows `pending` (created by the mission's assignee, targeting another member) → `accepted` (target member agrees) → `approved` (admin confirms, assignment actually transfers) or `rejected` (declined by the target member OR the admin, at either stage). "Points transfer" on approval means `mission_instances.assigned_to` moves to the new member — a reassignment of future ledger accrual, not a retroactive rewrite (same meaning as established in Foundation's spec).
- A swap request not resolved (accepted+approved) within **7 days** of creation auto-expires to `rejected` — checked at the point someone tries to act on it (accept/decline/resolve), since this plan doesn't add a scheduler (consistent with the Balance Engine plan's "no automatic cron" scope decision).
- Unavailability approval doesn't immediately touch `points_ledger` — it only excludes the member from `run-balance` distribution while their approved window is active (`period_start <= today <= period_end`), crediting their skipped weighted share as `debt` instead of `points_target` for that run, per the design spec.

## Scope decisions made for this plan (read before implementing)

1. **No cron/scheduler for swap expiry.** Same reasoning as Balance Engine's "no automatic period triggering" — the 7-day expiry is enforced lazily, at the moment `respond-swap` or `resolve-swap` is called on a request older than 7 days (auto-flips it to `rejected` and returns an error, rather than proceeding). A swap nobody ever touches again just sits `pending`/`accepted` forever with no visible consequence until someone tries to act on it — acceptable for v1, note it rather than silently building scheduling infrastructure.
2. **Unavailability doesn't retroactively adjust anything.** It only affects *future* `run-balance` calls made while the approved window is active. If a house never runs balance during a member's unavailability window, no debt accrues — this matches the "debt comes from being excluded from balance runs," not from unavailability approval itself.
3. **No dedicated swap-response screen.** Incoming swap requests (to-member's accept/decline) surface as a small section at the top of the already-existing Today screen, not a new dedicated screen — keeps scope tight, matches how this codebase has favored extending existing screens over multiplying new ones where reasonable.

## File Structure

```
/supabase
  /migrations
    <timestamp>_request_status_add_accepted.sql
  /functions
    /suggest-swap/index.ts
    /respond-swap/index.ts
    /resolve-swap/index.ts
    /suggest-unavailability/index.ts
    /resolve-unavailability/index.ts
    /run-balance/index.ts          # MODIFIED — exclude active-unavailable members, credit debt
  /tests
    request_status_add_accepted.test.sql   # pgTAP
    /functions
      swap.test.ts                          # Deno integration tests
      unavailability.test.ts                 # Deno integration tests
      balance.test.ts                        # MODIFIED — add unavailability-exclusion tests
/src
  /features
    /requests
      api.ts            # suggestSwap(), respondSwap(), resolveSwap(), suggestUnavailability(),
                         # resolveUnavailability(), getMyIncomingSwaps(), getPendingSwapsForAdmin(),
                         # getPendingUnavailability()
      __tests__/api.test.ts
  /app
    today.tsx              # MODIFIED — add "Swap" action per mission row, incoming-swaps section
    /missions
      suggestions.tsx        # MODIFIED — also render/resolve swap + unavailability suggestions
    /unavailability
      suggest.tsx              # new unavailability request screen
  /i18n/locales
    he.json                     # MODIFIED — add `swap.*`/`unavailability.*` keys
    en.json                      # MODIFIED — same keys, English
```

---

### Task 1: Add `'accepted'` to the `request_status` enum

**Files:**
- Create: `supabase/migrations/<timestamp>_request_status_add_accepted.sql`
- Create: `supabase/tests/request_status_add_accepted.test.sql`

**Interfaces:**
- Consumes: `bayit_shave.request_status` (existing enum: `pending | approved | rejected`, from Foundation).
- Produces: `bayit_shave.request_status` gains a fourth value, `accepted`, used only by `swap_requests.status` in this plan (`unavailability_requests.status` never uses it, stays `pending`/`approved`/`rejected`).

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new request_status_add_accepted
```

- [ ] **Step 2: Write the migration**

```sql
alter type bayit_shave.request_status add value 'accepted';
```

**Important:** do not use the new `'accepted'` value anywhere else in this same migration file — Postgres doesn't allow using a freshly-added enum value within the same transaction it was added in. The pgTAP test (a separate file, applied after this migration commits) is where `'accepted'` first gets used.

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db reset
```

Expected: clean reset, `npx supabase migration list --local` shows this migration applied last.

- [ ] **Step 4: Write the smoke test**

`supabase/tests/request_status_add_accepted.test.sql`:

```sql
begin;
select plan(1);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'noa@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'itai@example.com');

insert into bayit_shave.houses (id, name, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'House A', 'CODEACC');

insert into bayit_shave.members (id, house_id, user_id, name, role) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Noa', 'admin'),
  ('c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Itai', 'member');

insert into bayit_shave.mission_instances
  (house_id, title, category, points, due_date, created_by, status, assignment_mode, assigned_to)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Wash dishes', 'dishes', 15, current_date, 'c0000000-0000-0000-0000-000000000001', 'assigned', 'direct', 'c0000000-0000-0000-0000-000000000001');

insert into bayit_shave.swap_requests (house_id, mission_instance_id, from_member, to_member, status)
select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'accepted'
from bayit_shave.mission_instances limit 1;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select status::text from bayit_shave.swap_requests limit 1),
  'accepted',
  'the new accepted status value is a valid swap_requests.status'
);

select * from finish();
rollback;
```

- [ ] **Step 5: Run the pgTAP tests**

Run: `npx supabase test db`
Expected: all suites pass, including this new one.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add accepted value to request_status enum"
```

---

### Task 2: `suggest-swap` Edge Function

**Files:**
- Create: `supabase/functions/suggest-swap/index.ts`

**Interfaces:**
- Consumes: `bayit_shave.mission_instances`, `bayit_shave.members`, `bayit_shave.swap_requests`.
- Produces: `POST /functions/v1/suggest-swap` — body `{ mission_instance_id: string, to_member_id: string }`, auth: Bearer JWT of the mission's **current assignee**. Returns `200 { swap }` or `4xx/5xx { error: string }`. Task 8's `suggestSwap()` calls this directly.

- [ ] **Step 1: Write the function**

`supabase/functions/suggest-swap/index.ts`:

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

  const { mission_instance_id, to_member_id } = await req.json();
  if (!mission_instance_id || !to_member_id) {
    return new Response(JSON.stringify({ error: 'mission_instance_id_and_to_member_id_required' }), { status: 400 });
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
    .select('id, house_id, status, assigned_to')
    .eq('id', mission_instance_id)
    .maybeSingle();
  if (missionError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!mission) {
    return new Response(JSON.stringify({ error: 'mission_not_found' }), { status: 404 });
  }
  if (mission.status !== 'assigned') {
    return new Response(JSON.stringify({ error: 'mission_not_assigned' }), { status: 409 });
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

  if (to_member_id === callerMember.id) {
    return new Response(JSON.stringify({ error: 'cannot_swap_with_yourself' }), { status: 400 });
  }

  const { data: targetMember, error: targetError } = await admin
    .from('members')
    .select('id')
    .eq('house_id', mission.house_id)
    .eq('id', to_member_id)
    .maybeSingle();
  if (targetError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!targetMember) {
    return new Response(JSON.stringify({ error: 'target_member_not_in_house' }), { status: 400 });
  }

  const { data: swap, error: insertError } = await admin
    .from('swap_requests')
    .insert({
      house_id: mission.house_id,
      mission_instance_id,
      from_member: callerMember.id,
      to_member: to_member_id,
      status: 'pending',
    })
    .select()
    .single();
  if (insertError) {
    return new Response(JSON.stringify({ error: 'swap_creation_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ swap }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Manual smoke check**

```bash
npx supabase functions serve
```

Expected: no startup errors for `suggest-swap`. (Full behavioral tests are written together with `respond-swap`/`resolve-swap` in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add suggest-swap Edge Function"
```

---

### Task 3: `respond-swap` Edge Function

**Files:**
- Create: `supabase/functions/respond-swap/index.ts`

**Interfaces:**
- Consumes: `bayit_shave.swap_requests`, `bayit_shave.members`.
- Produces: `POST /functions/v1/respond-swap` — body `{ swap_request_id: string, decision: 'accept' | 'decline' }`, auth: Bearer JWT of the swap's **`to_member`**. Returns `200 { swap }`, `403 { error: 'not_your_swap_request' }`, `409 { error: 'already_resolved' }`, `410 { error: 'swap_expired' }`, or other `4xx/5xx { error: string }`. Task 8's `respondSwap()` calls this directly.

- [ ] **Step 1: Write the function**

`supabase/functions/respond-swap/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { swap_request_id, decision } = await req.json();
  if (!swap_request_id || !decision) {
    return new Response(JSON.stringify({ error: 'swap_request_id_and_decision_required' }), { status: 400 });
  }
  if (decision !== 'accept' && decision !== 'decline') {
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

  const { data: swap, error: swapError } = await admin
    .from('swap_requests')
    .select('id, house_id, to_member, status, created_at')
    .eq('id', swap_request_id)
    .maybeSingle();
  if (swapError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!swap) {
    return new Response(JSON.stringify({ error: 'swap_not_found' }), { status: 404 });
  }

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id')
    .eq('house_id', swap.house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember || swap.to_member !== callerMember.id) {
    return new Response(JSON.stringify({ error: 'not_your_swap_request' }), { status: 403 });
  }

  if (swap.status !== 'pending') {
    return new Response(JSON.stringify({ error: 'already_resolved' }), { status: 409 });
  }

  const ageMs = Date.now() - new Date(swap.created_at).getTime();
  if (ageMs > SEVEN_DAYS_MS) {
    await admin.from('swap_requests').update({ status: 'rejected' }).eq('id', swap_request_id);
    return new Response(JSON.stringify({ error: 'swap_expired' }), { status: 410 });
  }

  const { data: updated, error: updateError } = await admin
    .from('swap_requests')
    .update({ status: decision === 'accept' ? 'accepted' : 'rejected' })
    .eq('id', swap_request_id)
    .select()
    .single();
  if (updateError) {
    return new Response(JSON.stringify({ error: 'respond_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ swap: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Manual smoke check**

```bash
npx supabase functions serve
```

Expected: no startup errors. (Behavioral tests come with `resolve-swap` in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add respond-swap Edge Function"
```

---

### Task 4: `resolve-swap` Edge Function + Deno tests

**Files:**
- Create: `supabase/functions/resolve-swap/index.ts`
- Create: `supabase/tests/functions/swap.test.ts`

**Interfaces:**
- Consumes: `suggest-swap`, `respond-swap` (Tasks 2-3).
- Produces: `POST /functions/v1/resolve-swap` — body `{ swap_request_id: string, decision: 'approve' | 'reject' }`, auth: Bearer JWT of an **admin**. Returns `200 { swap }`, `403 { error: 'admin_only' }`, `409 { error: 'not_accepted_yet' }`, `410 { error: 'swap_expired' }`, or other `4xx/5xx { error: string }`. Task 8's `resolveSwap()` calls this directly.

- [ ] **Step 1: Write the function**

`supabase/functions/resolve-swap/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { swap_request_id, decision } = await req.json();
  if (!swap_request_id || !decision) {
    return new Response(JSON.stringify({ error: 'swap_request_id_and_decision_required' }), { status: 400 });
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

  const { data: swap, error: swapError } = await admin
    .from('swap_requests')
    .select('id, house_id, mission_instance_id, to_member, status, created_at')
    .eq('id', swap_request_id)
    .maybeSingle();
  if (swapError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!swap) {
    return new Response(JSON.stringify({ error: 'swap_not_found' }), { status: 404 });
  }

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id, role')
    .eq('house_id', swap.house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember || callerMember.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403 });
  }

  if (swap.status !== 'accepted') {
    return new Response(JSON.stringify({ error: 'not_accepted_yet' }), { status: 409 });
  }

  const ageMs = Date.now() - new Date(swap.created_at).getTime();
  if (ageMs > SEVEN_DAYS_MS) {
    await admin.from('swap_requests').update({ status: 'rejected' }).eq('id', swap_request_id);
    return new Response(JSON.stringify({ error: 'swap_expired' }), { status: 410 });
  }

  if (decision === 'reject') {
    const { data: updated, error: updateError } = await admin
      .from('swap_requests')
      .update({ status: 'rejected', approved_by: callerMember.id })
      .eq('id', swap_request_id)
      .select()
      .single();
    if (updateError) {
      return new Response(JSON.stringify({ error: 'resolve_failed' }), { status: 500 });
    }
    return new Response(JSON.stringify({ swap: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: updated, error: updateError } = await admin
    .from('swap_requests')
    .update({ status: 'approved', approved_by: callerMember.id })
    .eq('id', swap_request_id)
    .select()
    .single();
  if (updateError) {
    return new Response(JSON.stringify({ error: 'resolve_failed' }), { status: 500 });
  }

  const { error: missionUpdateError } = await admin
    .from('mission_instances')
    .update({ assigned_to: swap.to_member })
    .eq('id', swap.mission_instance_id);
  if (missionUpdateError) {
    return new Response(JSON.stringify({ error: 'mission_transfer_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ swap: updated }), {
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

`supabase/tests/functions/swap.test.ts`:

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

async function seedHouseWithTwoMembersAndAssignedMission() {
  const adminToken = await signUpAndSignIn(`admin+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Swap Test House', admin_name: 'Admin' }),
  });
  const { house, member: adminMember } = await createRes.json();

  const memberToken = await signUpAndSignIn(`member+${crypto.randomUUID()}@example.com`);
  const joinRes = await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: house.invite_code, name: 'Member' }),
  });
  const { member } = await joinRes.json();

  const missionRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'dishes',
      title: 'Wash dishes',
      points: 15,
      due_date: '2026-07-25',
      assignment_mode: 'direct',
      target_member_id: adminMember.id,
    }),
  });
  const { mission } = await missionRes.json();

  return { house, adminToken, adminMember, memberToken, member, mission };
}

Deno.test('swap flow: suggest -> accept -> admin approve transfers the mission', async () => {
  const { adminToken, adminMember, memberToken, member, mission } = await seedHouseWithTwoMembersAndAssignedMission();

  const suggestRes = await fetch(`${FUNCTIONS_URL}/suggest-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, to_member_id: member.id }),
  });
  assertEquals(suggestRes.status, 200);
  const { swap } = await suggestRes.json();
  assertEquals(swap.status, 'pending');

  const acceptRes = await fetch(`${FUNCTIONS_URL}/respond-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ swap_request_id: swap.id, decision: 'accept' }),
  });
  assertEquals(acceptRes.status, 200);
  const { swap: accepted } = await acceptRes.json();
  assertEquals(accepted.status, 'accepted');

  const approveRes = await fetch(`${FUNCTIONS_URL}/resolve-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ swap_request_id: swap.id, decision: 'approve' }),
  });
  assertEquals(approveRes.status, 200);

  const { data: updatedMission } = await admin.from('mission_instances').select('assigned_to').eq('id', mission.id).single();
  assertEquals(updatedMission!.assigned_to, member.id);

  void adminMember;
});

Deno.test('resolve-swap: admin cannot approve a swap the target member has not accepted yet', async () => {
  const { adminToken, member, mission } = await seedHouseWithTwoMembersAndAssignedMission();

  const suggestRes = await fetch(`${FUNCTIONS_URL}/suggest-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, to_member_id: member.id }),
  });
  const { swap } = await suggestRes.json();

  const approveRes = await fetch(`${FUNCTIONS_URL}/resolve-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ swap_request_id: swap.id, decision: 'approve' }),
  });
  assertEquals(approveRes.status, 409);
});

Deno.test('suggest-swap: non-assignee cannot suggest a swap on the mission', async () => {
  const { memberToken, mission } = await seedHouseWithTwoMembersAndAssignedMission();

  const res = await fetch(`${FUNCTIONS_URL}/suggest-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, to_member_id: mission.assigned_to }),
  });
  assertEquals(res.status, 403);
});

Deno.test('respond-swap: only the target member can accept/decline', async () => {
  const { adminToken, member, mission } = await seedHouseWithTwoMembersAndAssignedMission();

  const suggestRes = await fetch(`${FUNCTIONS_URL}/suggest-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, to_member_id: member.id }),
  });
  const { swap } = await suggestRes.json();

  const wrongCallerRes = await fetch(`${FUNCTIONS_URL}/respond-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ swap_request_id: swap.id, decision: 'accept' }),
  });
  assertEquals(wrongCallerRes.status, 403);
});
```

- [ ] **Step 4: Run the tests**

```bash
export SUPABASE_ANON_KEY=<anon key from supabase status>
export SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/functions/swap.test.ts
```

Expected: `4 passed` (swap-flow-happy-path, admin-cannot-approve-unaccepted, non-assignee-cannot-suggest, only-target-member-can-respond).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add resolve-swap Edge Function and swap Deno tests"
```

---

### Task 5: `suggest-unavailability` Edge Function

**Files:**
- Create: `supabase/functions/suggest-unavailability/index.ts`

**Interfaces:**
- Consumes: `bayit_shave.members`, `bayit_shave.unavailability_requests`.
- Produces: `POST /functions/v1/suggest-unavailability` — body `{ house_id: string, period_start: string, period_end: string, reason?: string }`, auth: Bearer JWT of the requesting member. Returns `200 { unavailability }` or `4xx/5xx { error: string }`. Task 8's `suggestUnavailability()` calls this directly.

- [ ] **Step 1: Write the function**

`supabase/functions/suggest-unavailability/index.ts`:

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

  const { house_id, period_start, period_end, reason } = await req.json();
  if (!house_id || !period_start || !period_end) {
    return new Response(JSON.stringify({ error: 'house_id_period_start_and_period_end_required' }), { status: 400 });
  }
  if (period_end < period_start) {
    return new Response(JSON.stringify({ error: 'period_end_before_period_start' }), { status: 400 });
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
    .select('id')
    .eq('house_id', house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember) {
    return new Response(JSON.stringify({ error: 'not_a_member_of_this_house' }), { status: 403 });
  }

  const { data: unavailability, error: insertError } = await admin
    .from('unavailability_requests')
    .insert({
      house_id,
      member_id: callerMember.id,
      period_start,
      period_end,
      reason: reason ?? null,
      status: 'pending',
    })
    .select()
    .single();
  if (insertError) {
    return new Response(JSON.stringify({ error: 'unavailability_creation_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ unavailability }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Manual smoke check**

```bash
npx supabase functions serve
```

Expected: no startup errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add suggest-unavailability Edge Function"
```

---

### Task 6: `resolve-unavailability` Edge Function + Deno tests

**Files:**
- Create: `supabase/functions/resolve-unavailability/index.ts`
- Create: `supabase/tests/functions/unavailability.test.ts`

**Interfaces:**
- Consumes: `suggest-unavailability` (Task 5).
- Produces: `POST /functions/v1/resolve-unavailability` — body `{ unavailability_request_id: string, decision: 'approve' | 'reject' }`, auth: Bearer JWT of an **admin**. Returns `200 { unavailability }`, `403 { error: 'admin_only' }`, `409 { error: 'not_pending' }`, or other `4xx/5xx { error: string }`. Task 8's `resolveUnavailability()` calls this directly.

- [ ] **Step 1: Write the function**

`supabase/functions/resolve-unavailability/index.ts`:

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

  const { unavailability_request_id, decision } = await req.json();
  if (!unavailability_request_id || !decision) {
    return new Response(JSON.stringify({ error: 'unavailability_request_id_and_decision_required' }), { status: 400 });
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

  const { data: unavailability, error: fetchError } = await admin
    .from('unavailability_requests')
    .select('id, house_id, status')
    .eq('id', unavailability_request_id)
    .maybeSingle();
  if (fetchError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!unavailability) {
    return new Response(JSON.stringify({ error: 'unavailability_not_found' }), { status: 404 });
  }

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id, role')
    .eq('house_id', unavailability.house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember || callerMember.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403 });
  }

  if (unavailability.status !== 'pending') {
    return new Response(JSON.stringify({ error: 'not_pending' }), { status: 409 });
  }

  const { data: updated, error: updateError } = await admin
    .from('unavailability_requests')
    .update({ status: decision === 'approve' ? 'approved' : 'rejected', approved_by: callerMember.id })
    .eq('id', unavailability_request_id)
    .select()
    .single();
  if (updateError) {
    return new Response(JSON.stringify({ error: 'resolve_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ unavailability: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Write the integration tests**

`supabase/tests/functions/unavailability.test.ts`:

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
    body: JSON.stringify({ house_name: 'Unavailability Test House', admin_name: 'Admin' }),
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

Deno.test('suggest-unavailability: creates a pending request for the caller', async () => {
  const { house, memberToken, member } = await seedHouseWithAdminAndMember();

  const res = await fetch(`${FUNCTIONS_URL}/suggest-unavailability`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id, period_start: '2026-08-01', period_end: '2026-08-05', reason: 'Trip' }),
  });
  assertEquals(res.status, 200);
  const { unavailability } = await res.json();
  assertEquals(unavailability.status, 'pending');
  assertEquals(unavailability.member_id, member.id);
});

Deno.test('suggest-unavailability: rejects period_end before period_start', async () => {
  const { house, memberToken } = await seedHouseWithAdminAndMember();

  const res = await fetch(`${FUNCTIONS_URL}/suggest-unavailability`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id, period_start: '2026-08-05', period_end: '2026-08-01' }),
  });
  assertEquals(res.status, 400);
});

Deno.test('resolve-unavailability: admin approves; non-admin is rejected', async () => {
  const { house, adminToken, memberToken, member } = await seedHouseWithAdminAndMember();

  const suggestRes = await fetch(`${FUNCTIONS_URL}/suggest-unavailability`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id, period_start: '2026-08-01', period_end: '2026-08-05' }),
  });
  const { unavailability } = await suggestRes.json();

  const forbidden = await fetch(`${FUNCTIONS_URL}/resolve-unavailability`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ unavailability_request_id: unavailability.id, decision: 'approve' }),
  });
  assertEquals(forbidden.status, 403);

  const approveRes = await fetch(`${FUNCTIONS_URL}/resolve-unavailability`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ unavailability_request_id: unavailability.id, decision: 'approve' }),
  });
  assertEquals(approveRes.status, 200);
  const { unavailability: approved } = await approveRes.json();
  assertEquals(approved.status, 'approved');

  const { data: dbRow } = await admin.from('unavailability_requests').select('status').eq('id', unavailability.id).single();
  assertEquals(dbRow!.status, 'approved');

  void member;
});
```

- [ ] **Step 3: Run the tests**

```bash
export SUPABASE_ANON_KEY=<anon key from supabase status>
export SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/functions/unavailability.test.ts
```

Expected: `3 passed`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add resolve-unavailability Edge Function and unavailability Deno tests"
```

---

### Task 7: Wire unavailability exclusion into `run-balance`

**Files:**
- Modify: `supabase/functions/run-balance/index.ts` (from the Balance Engine plan)
- Modify: `supabase/tests/functions/balance.test.ts` (append tests)

**Interfaces:**
- Consumes: `bayit_shave.unavailability_requests` (approved rows with an active window).
- Produces: `run-balance` now excludes members with an active approved unavailability from receiving missions in both strategies, and (for `points_based`) credits their weighted pool share to `points_ledger.debt` (rounded to the nearest integer, since `debt` is an `integer` column) instead of `points_target`.

**Why this task exists:** the Balance Engine plan shipped `run-balance` before this plan's `Unavailability` entity existed. This task is the cross-plan integration point the design spec calls for — "a member with an approved Unavailability covering the period is excluded from that period's assignment entirely; their share becomes debt."

- [ ] **Step 1: Replace `run-balance/index.ts` with the unavailability-aware version**

Replace the entire contents of `supabase/functions/run-balance/index.ts` with:

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

  const today = new Date().toISOString().slice(0, 10);
  const { data: activeUnavailability, error: unavailabilityError } = await admin
    .from('unavailability_requests')
    .select('member_id')
    .eq('house_id', house_id)
    .eq('status', 'approved')
    .lte('period_start', today)
    .gte('period_end', today);
  if (unavailabilityError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  const unavailableMemberIds = new Set((activeUnavailability ?? []).map((u) => u.member_id));
  const availableMembers = members.filter((m) => !unavailableMemberIds.has(m.id));

  const assigned: { mission_id: string; member_id: string }[] = [];

  if (availableMembers.length === 0) {
    // Everyone eligible to receive missions is currently unavailable — nothing to assign
    // this run, but the target/debt accounting below still needs to run for everyone.
  } else if (house.assignment_strategy === 'round_robin') {
    let startIndex = 0;
    if (house.round_robin_cursor) {
      const cursorIndex = availableMembers.findIndex((m) => m.id === house.round_robin_cursor);
      startIndex = cursorIndex >= 0 ? (cursorIndex + 1) % availableMembers.length : 0;
    }
    let cursor = startIndex;
    for (const mission of openMissions) {
      const member = availableMembers[cursor];
      const { error: assignError } = await admin
        .from('mission_instances')
        .update({ assigned_to: member.id, status: 'assigned' })
        .eq('id', mission.id);
      if (!assignError) {
        assigned.push({ mission_id: mission.id, member_id: member.id });
      }
      cursor = (cursor + 1) % availableMembers.length;
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
    for (const member of availableMembers) {
      const ledger = ledgerByMember.get(member.id);
      const earned = ledger?.points_earned ?? 0;
      const target = ledger?.points_target ?? 0;
      const debt = ledger?.debt ?? 0;
      const shareOfPool = (Number(member.weight) / totalWeight) * poolPoints;
      const newTarget = Number(target) + shareOfPool;
      projectedDeficit.set(member.id, newTarget + Number(debt) - Number(earned));
    }

    for (const mission of openMissions) {
      let pickedMember = availableMembers[0];
      let highestDeficit = -Infinity;
      for (const member of availableMembers) {
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
  }

  if (house.assignment_strategy === 'points_based') {
    const { data: ledgerRows } = await admin
      .from('points_ledger')
      .select('member_id, points_earned, points_target, debt')
      .eq('house_id', house_id);
    const ledgerByMember = new Map((ledgerRows ?? []).map((r) => [r.member_id, r]));
    const totalWeight = members.reduce((sum, m) => sum + Number(m.weight), 0);
    const poolPoints = openMissions.reduce((sum, m) => sum + m.points, 0);

    for (const member of members) {
      const shareOfPool = (Number(member.weight) / totalWeight) * poolPoints;
      const existing = ledgerByMember.get(member.id);
      const isUnavailable = unavailableMemberIds.has(member.id);

      if (existing) {
        const update = isUnavailable
          ? { debt: Number(existing.debt) + Math.round(shareOfPool) }
          : { points_target: Number(existing.points_target) + shareOfPool };
        await admin.from('points_ledger').update(update).eq('house_id', house_id).eq('member_id', member.id);
      } else {
        await admin.from('points_ledger').insert({
          house_id,
          member_id: member.id,
          points_earned: 0,
          points_target: isUnavailable ? 0 : shareOfPool,
          debt: isUnavailable ? Math.round(shareOfPool) : 0,
        });
      }
    }
  }

  return new Response(JSON.stringify({ assigned }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Append unavailability-exclusion tests to `balance.test.ts`**

Add to `supabase/tests/functions/balance.test.ts` (before the trailing `admin;` no-op reference, if one exists — otherwise at the end of the file):

```ts
Deno.test('run-balance: an approved-unavailable member is excluded and their share becomes debt', async () => {
  const { house, adminToken, adminMember, member } = await seedHouseWithStrategy('points_based');

  const { data: unavailability } = await admin
    .from('unavailability_requests')
    .insert({
      house_id: house.id,
      member_id: member.id,
      period_start: '2020-01-01',
      period_end: '2999-12-31',
      status: 'approved',
    })
    .select()
    .single();

  await admin.from('points_ledger').insert({ house_id: house.id, member_id: adminMember.id, points_earned: 0, points_target: 0, debt: 0 });
  await admin.from('points_ledger').insert({ house_id: house.id, member_id: member.id, points_earned: 0, points_target: 0, debt: 0 });

  await seedOpenMission(house.id, adminToken, 10, 'Should skip the unavailable member');

  const res = await fetch(`${FUNCTIONS_URL}/run-balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id }),
  });
  assertEquals(res.status, 200);
  const { assigned } = await res.json();
  assertEquals(assigned.length, 1);
  assertEquals(assigned[0].member_id, adminMember.id);

  const { data: memberLedger } = await admin
    .from('points_ledger')
    .select('points_target, debt')
    .eq('house_id', house.id)
    .eq('member_id', member.id)
    .single();
  assertEquals(memberLedger!.points_target, 0);
  assertEquals(memberLedger!.debt, 5);

  void unavailability;
});
```

- [ ] **Step 3: Run the full balance test file**

```bash
deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/functions/balance.test.ts
```

Expected: all prior tests still pass, plus this new one (previously 5, now 6).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: exclude unavailable members from run-balance, credit their share as debt"
```

---

### Task 8: Client API module for requests (swap + unavailability)

**Files:**
- Create: `src/features/requests/api.ts`
- Create: `src/features/requests/__tests__/api.test.ts`

**Interfaces:**
- Consumes: `supabase` client; the five Edge Functions (Tasks 2-3, 4, 5-6).
- Produces:
  - `suggestSwap(missionInstanceId: string, toMemberId: string): Promise<{ swap: SwapRequest }>`
  - `respondSwap(swapRequestId: string, decision: 'accept' | 'decline'): Promise<{ swap: SwapRequest }>`
  - `resolveSwap(swapRequestId: string, decision: 'approve' | 'reject'): Promise<{ swap: SwapRequest }>`
  - `suggestUnavailability(houseId: string, periodStart: string, periodEnd: string, reason?: string): Promise<{ unavailability: UnavailabilityRequest }>`
  - `resolveUnavailability(unavailabilityRequestId: string, decision: 'approve' | 'reject'): Promise<{ unavailability: UnavailabilityRequest }>`
  - `getMyIncomingSwaps(houseId: string, memberId: string): Promise<SwapRequest[]>` — `to_member = memberId`, `status = 'pending'`.
  - `getPendingSwapsForAdmin(houseId: string): Promise<SwapRequest[]>` — `status = 'accepted'` (ready for final admin approval).
  - `getPendingUnavailability(houseId: string): Promise<UnavailabilityRequest[]>` — `status = 'pending'`.

  Error handling matches the established pattern (`error.context.json()` for Edge Function calls, `error.message` for reads).

- [ ] **Step 1: Write the failing test**

`src/features/requests/__tests__/api.test.ts`:

```ts
import {
  suggestSwap,
  respondSwap,
  resolveSwap,
  suggestUnavailability,
  resolveUnavailability,
  getMyIncomingSwaps,
  getPendingSwapsForAdmin,
  getPendingUnavailability,
} from '../api';
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
    then: (resolve: (value: { data: unknown; error: unknown }) => void) => resolve(finalResult),
  };
  return chain;
}

describe('suggestSwap', () => {
  it('invokes suggest-swap with mission and target member ids', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { swap: { id: 's1', status: 'pending' } }, error: null });
    const result = await suggestSwap('m1', 'mem2');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('suggest-swap', {
      body: { mission_instance_id: 'm1', to_member_id: 'mem2' },
    });
    expect(result.swap.status).toBe('pending');
  });
});

describe('respondSwap', () => {
  it('invokes respond-swap with the decision', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { swap: { id: 's1', status: 'accepted' } }, error: null });
    await respondSwap('s1', 'accept');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('respond-swap', {
      body: { swap_request_id: 's1', decision: 'accept' },
    });
  });
});

describe('resolveSwap', () => {
  it('invokes resolve-swap with the decision', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { swap: { id: 's1', status: 'approved' } }, error: null });
    await resolveSwap('s1', 'approve');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('resolve-swap', {
      body: { swap_request_id: 's1', decision: 'approve' },
    });
  });
});

describe('suggestUnavailability', () => {
  it('invokes suggest-unavailability with the date range and reason', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { unavailability: { id: 'u1', status: 'pending' } },
      error: null,
    });
    await suggestUnavailability('h1', '2026-08-01', '2026-08-05', 'Trip');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('suggest-unavailability', {
      body: { house_id: 'h1', period_start: '2026-08-01', period_end: '2026-08-05', reason: 'Trip' },
    });
  });
});

describe('resolveUnavailability', () => {
  it('invokes resolve-unavailability with the decision', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { unavailability: { id: 'u1', status: 'approved' } },
      error: null,
    });
    await resolveUnavailability('u1', 'approve');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('resolve-unavailability', {
      body: { unavailability_request_id: 'u1', decision: 'approve' },
    });
  });
});

describe('getMyIncomingSwaps', () => {
  it('queries pending swaps addressed to the member', async () => {
    const chain = mockSelectChain({ data: [{ id: 's1' }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getMyIncomingSwaps('h1', 'mem1');
    expect(supabase.from).toHaveBeenCalledWith('swap_requests');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    expect(chain.eq).toHaveBeenCalledWith('to_member', 'mem1');
    expect(chain.eq).toHaveBeenCalledWith('status', 'pending');
    expect(result).toEqual([{ id: 's1' }]);
  });
});

describe('getPendingSwapsForAdmin', () => {
  it('queries accepted swaps ready for admin approval', async () => {
    const chain = mockSelectChain({ data: [{ id: 's1' }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getPendingSwapsForAdmin('h1');
    expect(chain.eq).toHaveBeenCalledWith('status', 'accepted');
    expect(result).toEqual([{ id: 's1' }]);
  });
});

describe('getPendingUnavailability', () => {
  it('queries pending unavailability requests', async () => {
    const chain = mockSelectChain({ data: [{ id: 'u1' }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getPendingUnavailability('h1');
    expect(supabase.from).toHaveBeenCalledWith('unavailability_requests');
    expect(chain.eq).toHaveBeenCalledWith('status', 'pending');
    expect(result).toEqual([{ id: 'u1' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/requests/__tests__/api.test.ts`
Expected: FAIL with "Cannot find module '../api'"

- [ ] **Step 3: Implement the API module**

`src/features/requests/api.ts`:

```ts
import { supabase } from '../../lib/supabase';

export interface SwapRequest {
  id: string;
  house_id: string;
  mission_instance_id: string;
  from_member: string;
  to_member: string;
  status: 'pending' | 'accepted' | 'approved' | 'rejected';
  approved_by: string | null;
}

export interface UnavailabilityRequest {
  id: string;
  house_id: string;
  member_id: string;
  period_start: string;
  period_end: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
}

async function throwFromInvokeError(error: { message: string; context?: Response }): Promise<never> {
  const body = error.context ? await error.context.json().catch(() => null) : null;
  throw new Error((body as { error?: string } | null)?.error ?? error.message);
}

export async function suggestSwap(missionInstanceId: string, toMemberId: string): Promise<{ swap: SwapRequest }> {
  const { data, error } = await supabase.functions.invoke('suggest-swap', {
    body: { mission_instance_id: missionInstanceId, to_member_id: toMemberId },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function respondSwap(
  swapRequestId: string,
  decision: 'accept' | 'decline'
): Promise<{ swap: SwapRequest }> {
  const { data, error } = await supabase.functions.invoke('respond-swap', {
    body: { swap_request_id: swapRequestId, decision },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function resolveSwap(
  swapRequestId: string,
  decision: 'approve' | 'reject'
): Promise<{ swap: SwapRequest }> {
  const { data, error } = await supabase.functions.invoke('resolve-swap', {
    body: { swap_request_id: swapRequestId, decision },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function suggestUnavailability(
  houseId: string,
  periodStart: string,
  periodEnd: string,
  reason?: string
): Promise<{ unavailability: UnavailabilityRequest }> {
  const { data, error } = await supabase.functions.invoke('suggest-unavailability', {
    body: { house_id: houseId, period_start: periodStart, period_end: periodEnd, reason },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function resolveUnavailability(
  unavailabilityRequestId: string,
  decision: 'approve' | 'reject'
): Promise<{ unavailability: UnavailabilityRequest }> {
  const { data, error } = await supabase.functions.invoke('resolve-unavailability', {
    body: { unavailability_request_id: unavailabilityRequestId, decision },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function getMyIncomingSwaps(houseId: string, memberId: string): Promise<SwapRequest[]> {
  const { data, error } = await supabase
    .from('swap_requests')
    .select('*')
    .eq('house_id', houseId)
    .eq('to_member', memberId)
    .eq('status', 'pending');
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as SwapRequest[];
}

export async function getPendingSwapsForAdmin(houseId: string): Promise<SwapRequest[]> {
  const { data, error } = await supabase
    .from('swap_requests')
    .select('*')
    .eq('house_id', houseId)
    .eq('status', 'accepted');
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as SwapRequest[];
}

export async function getPendingUnavailability(houseId: string): Promise<UnavailabilityRequest[]> {
  const { data, error } = await supabase
    .from('unavailability_requests')
    .select('*')
    .eq('house_id', houseId)
    .eq('status', 'pending');
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as UnavailabilityRequest[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/requests/__tests__/api.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add requests client API module (swap + unavailability)"
```

---

### Task 9: Extend the suggestions inbox to show swap and unavailability requests

**Files:**
- Modify: `src/app/missions/suggestions.tsx`
- Modify: `src/i18n/locales/he.json`, `src/i18n/locales/en.json` (add `suggestions.swap`/`unavailability` keys)

**Interfaces:**
- Consumes: `getPendingSwapsForAdmin`, `getPendingUnavailability`, `resolveSwap`, `resolveUnavailability` (Task 8), alongside the existing `getSuggestions`/`resolveSuggestion` (Missions & Suggestions plan).
- Produces: the admin inbox now shows three kinds of items — mission suggestions (existing), accepted-and-awaiting-final-approval swaps, and pending unavailability requests — each with the correct approve/reject action wired to the correct function.

- [ ] **Step 1: Add the new translation keys**

Add to `src/i18n/locales/he.json`'s `suggestions` object:

```json
"swap": "בקשת החלפה",
"unavailability": "בקשת חופש"
```

Add to `src/i18n/locales/en.json`'s `suggestions` object:

```json
"swap": "Swap request",
"unavailability": "Time-off request"
```

- [ ] **Step 2: Modify the screen**

Replace the entire contents of `src/app/missions/suggestions.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { getSuggestions, resolveSuggestion, type Mission } from '../../features/missions/api';
import {
  getPendingSwapsForAdmin,
  getPendingUnavailability,
  resolveSwap,
  resolveUnavailability,
  type SwapRequest,
  type UnavailabilityRequest,
} from '../../features/requests/api';

function suggestionTypeOf(mission: Mission): 'new_mission' | 'points_edit' {
  return mission.status === 'pending_approval' ? 'new_mission' : 'points_edit';
}

type InboxItem =
  | { kind: 'mission'; mission: Mission }
  | { kind: 'swap'; swap: SwapRequest }
  | { kind: 'unavailability'; unavailability: UnavailabilityRequest };

export default function SuggestionsScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [missions, swaps, unavailability] = await Promise.all([
      getSuggestions(houseId),
      getPendingSwapsForAdmin(houseId),
      getPendingUnavailability(houseId),
    ]);
    setItems([
      ...missions.map((mission): InboxItem => ({ kind: 'mission', mission })),
      ...swaps.map((swap): InboxItem => ({ kind: 'swap', swap })),
      ...unavailability.map((unavailability): InboxItem => ({ kind: 'unavailability', unavailability })),
    ]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId]);

  async function handleMissionDecision(mission: Mission, decision: 'approve' | 'reject') {
    await resolveSuggestion(suggestionTypeOf(mission), mission.id, decision);
    await load();
  }

  async function handleSwapDecision(swap: SwapRequest, decision: 'approve' | 'reject') {
    await resolveSwap(swap.id, decision);
    await load();
  }

  async function handleUnavailabilityDecision(unavailability: UnavailabilityRequest, decision: 'approve' | 'reject') {
    await resolveUnavailability(unavailability.id, decision);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{t('suggestions.title')}</Text>
      <FlatList
        data={items}
        keyExtractor={(item) =>
          item.kind === 'mission' ? item.mission.id : item.kind === 'swap' ? item.swap.id : item.unavailability.id
        }
        ListEmptyComponent={<Text style={{ opacity: 0.6 }}>{t('suggestions.empty')}</Text>}
        renderItem={({ item }) => {
          if (item.kind === 'mission') {
            const kind = suggestionTypeOf(item.mission);
            return (
              <View testID={`suggestion-${item.mission.id}`} style={{ borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, gap: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', opacity: 0.6 }}>
                  {kind === 'new_mission' ? t('suggestions.newMission') : t('suggestions.pointsEdit')}
                </Text>
                <Text style={{ fontWeight: '700' }}>
                  {kind === 'new_mission'
                    ? `${item.mission.title} · ${item.mission.points}`
                    : `${item.mission.title} · ${item.mission.points} → ${item.mission.proposed_points}`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => handleMissionDecision(item.mission, 'approve')}
                    testID={`approve-${item.mission.id}`}
                    style={{ flex: 1, backgroundColor: '#7C9473', borderRadius: 10, padding: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{t('suggestions.approve')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleMissionDecision(item.mission, 'reject')}
                    testID={`reject-${item.mission.id}`}
                    style={{ flex: 1, borderWidth: 1.5, borderColor: '#A6425A', borderRadius: 10, padding: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#A6425A', fontWeight: '700' }}>{t('suggestions.reject')}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }

          if (item.kind === 'swap') {
            return (
              <View testID={`suggestion-swap-${item.swap.id}`} style={{ borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, gap: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', opacity: 0.6 }}>{t('suggestions.swap')}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => handleSwapDecision(item.swap, 'approve')}
                    testID={`approve-swap-${item.swap.id}`}
                    style={{ flex: 1, backgroundColor: '#7C9473', borderRadius: 10, padding: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{t('suggestions.approve')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleSwapDecision(item.swap, 'reject')}
                    testID={`reject-swap-${item.swap.id}`}
                    style={{ flex: 1, borderWidth: 1.5, borderColor: '#A6425A', borderRadius: 10, padding: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#A6425A', fontWeight: '700' }}>{t('suggestions.reject')}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }

          return (
            <View testID={`suggestion-unavailability-${item.unavailability.id}`} style={{ borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', opacity: 0.6 }}>{t('suggestions.unavailability')}</Text>
              <Text style={{ fontWeight: '700' }}>
                {item.unavailability.period_start} → {item.unavailability.period_end}
                {item.unavailability.reason ? ` · ${item.unavailability.reason}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => handleUnavailabilityDecision(item.unavailability, 'approve')}
                  testID={`approve-unavailability-${item.unavailability.id}`}
                  style={{ flex: 1, backgroundColor: '#7C9473', borderRadius: 10, padding: 8, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{t('suggestions.approve')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleUnavailabilityDecision(item.unavailability, 'reject')}
                  testID={`reject-unavailability-${item.unavailability.id}`}
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

Navigate to `/missions/suggestions?houseId=<a-real-house-id>` as an admin with at least one accepted swap and one pending unavailability request seeded, confirm both render correctly alongside mission suggestions and their approve/reject buttons work.

- [ ] **Step 4: Run the full Jest suite**

```bash
npm test
```

Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: show swap and unavailability requests in the suggestions inbox"
```

---

### Task 10: Today screen — swap action + incoming swap requests

**Files:**
- Modify: `src/app/today.tsx`
- Modify: `src/i18n/locales/he.json`, `src/i18n/locales/en.json` (add `swap.*` keys)

**Interfaces:**
- Consumes: `suggestSwap`, `respondSwap`, `getMyIncomingSwaps`, `getHouseMembers` (from `src/features/missions/api.ts`, Missions & Suggestions plan) — Task 8's `requests/api.ts` functions.
- Produces: each mission row on `/today` gets a "Swap" action opening a member picker; a new section at the top of the screen lists incoming pending swap requests with Accept/Decline buttons.

- [ ] **Step 1: Add `swap.*` translation keys**

Add to `src/i18n/locales/he.json`:

```json
"swap": {
  "requestSwap": "בקש/י החלפה",
  "selectMember": "בחר/י עם מי להחליף",
  "incomingTitle": "בקשות החלפה אליך",
  "accept": "קבל/י",
  "decline": "דחה/י"
}
```

Add to `src/i18n/locales/en.json`:

```json
"swap": {
  "requestSwap": "Request swap",
  "selectMember": "Select who to swap with",
  "incomingTitle": "Swap requests for you",
  "accept": "Accept",
  "decline": "Decline"
}
```

- [ ] **Step 2: Modify `today.tsx`**

Update the import line to include the new dependencies:

```ts
import { getMyHouseId, getMyMembership, getTodayMissions, getHouseMembers, completeMission, editMissionPoints, type Mission } from '../features/missions/api';
import { getMyIncomingSwaps, suggestSwap, respondSwap, type SwapRequest } from '../features/requests/api';
```

Add new state after the existing state declarations:

```ts
const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
const [incomingSwaps, setIncomingSwaps] = useState<SwapRequest[]>([]);
const [swappingMissionId, setSwappingMissionId] = useState<string | null>(null);
const [myMemberId, setMyMemberId] = useState<string | null>(null);
```

Modify `load()` to also fetch members and incoming swaps, and capture the caller's own member id:

```ts
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
    setMyMemberId(membership.id);
    const [todayMissions, houseMembers, swaps] = await Promise.all([
      getTodayMissions(hId, membership.id),
      getHouseMembers(hId),
      getMyIncomingSwaps(hId, membership.id),
    ]);
    setMissions(todayMissions);
    setMembers(houseMembers);
    setIncomingSwaps(swaps);
  }
  setLoading(false);
}
```

Add handlers after `handleSaveEditPoints`:

```ts
async function handleRequestSwap(missionId: string, toMemberId: string) {
  await suggestSwap(missionId, toMemberId);
  setSwappingMissionId(null);
  await load();
}

async function handleRespondSwap(swapId: string, decision: 'accept' | 'decline') {
  await respondSwap(swapId, decision);
  await load();
}
```

Add an incoming-swaps section right after the `today.greeting` heading (before the `FlatList` of missions):

```tsx
{incomingSwaps.length > 0 && (
  <View style={{ gap: 8 }}>
    <Text style={{ fontWeight: '700' }}>{t('swap.incomingTitle')}</Text>
    {incomingSwaps.map((swap) => (
      <View key={swap.id} testID={`incoming-swap-${swap.id}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Text style={{ flex: 1 }}>{members.find((m) => m.id === swap.from_member)?.name ?? swap.from_member}</Text>
        <Pressable onPress={() => handleRespondSwap(swap.id, 'accept')} testID={`accept-swap-${swap.id}`} style={{ padding: 8 }}>
          <Text style={{ color: '#7C9473', fontWeight: '700' }}>{t('swap.accept')}</Text>
        </Pressable>
        <Pressable onPress={() => handleRespondSwap(swap.id, 'decline')} testID={`decline-swap-${swap.id}`} style={{ padding: 8 }}>
          <Text style={{ color: '#A6425A', fontWeight: '700' }}>{t('swap.decline')}</Text>
        </Pressable>
      </View>
    ))}
  </View>
)}
```

Add a "Swap" button and member picker to each mission row — inside the existing `renderItem`, right after the "Edit points" `Pressable` (still inside the outer row `Pressable`, as a sibling):

```tsx
<Pressable onPress={() => setSwappingMissionId(item.id)} testID={`swap-${item.id}`} style={{ padding: 4 }}>
  <Text style={{ fontSize: 12, opacity: 0.6 }}>{t('swap.requestSwap')}</Text>
</Pressable>
```

And, as a sibling to the existing edit-points inline row (same pattern — a conditional block right after the row `Pressable` closes, checking `swappingMissionId === item.id` instead of `editingMissionId === item.id`):

```tsx
{swappingMissionId === item.id && (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingStart: 32 }}>
    <Text style={{ width: '100%', fontSize: 12, opacity: 0.6 }}>{t('swap.selectMember')}</Text>
    {members
      .filter((m) => m.id !== myMemberId)
      .map((m) => (
        <Pressable
          key={m.id}
          onPress={() => handleRequestSwap(item.id, m.id)}
          testID={`swap-target-${item.id}-${m.id}`}
          style={{ borderWidth: 1, borderRadius: 8, padding: 6 }}
        >
          <Text style={{ fontSize: 11 }}>{m.name}</Text>
        </Pressable>
      ))}
  </View>
)}
```

- [ ] **Step 3: Run the full Jest suite**

```bash
npm test
```

Expected: PASS, all suites (no new unit tests for this leaf UI change, matching the established pattern).

- [ ] **Step 4: Manual check — actually run it, with real evidence in your report**

With the local stack running: seed a house with 2+ members and a mission assigned to one of them. As that member, tap "Request swap" on the mission, pick a target, submit — confirm a `swap_requests` row appears with `status='pending'`. As the target member, confirm the "Swap requests for you" section shows it, tap Accept — confirm `status` becomes `'accepted'`. As admin, confirm it now appears in `/missions/suggestions` (Task 9) and approving it moves `assigned_to` to the target member (check `mission_instances` directly).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add swap request/response UI to Today screen"
```

---

### Task 11: Unavailability request screen

**Files:**
- Create: `src/app/unavailability/suggest.tsx`
- Modify: `src/app/today.tsx` (nav link)
- Modify: `src/i18n/locales/he.json`, `src/i18n/locales/en.json` (add `unavailability.*` and `today.unavailability` keys)

**Interfaces:**
- Consumes: `suggestUnavailability` (Task 8).
- Produces: a working request-time-off form, linked from the Today screen.

- [ ] **Step 1: Add translation keys**

Add to `src/i18n/locales/he.json` (new top-level `unavailability` key, plus one addition to the existing `today` object):

```json
"unavailability": {
  "title": "בקשת חופש",
  "periodStartLabel": "מתאריך (YYYY-MM-DD)",
  "periodEndLabel": "עד תאריך (YYYY-MM-DD)",
  "reasonLabel": "סיבה (לא חובה)",
  "submit": "שלח בקשה"
}
```

And inside the existing `today` object: `"unavailability": "בקש/י חופש"`

Add to `src/i18n/locales/en.json`:

```json
"unavailability": {
  "title": "Request time off",
  "periodStartLabel": "From (YYYY-MM-DD)",
  "periodEndLabel": "To (YYYY-MM-DD)",
  "reasonLabel": "Reason (optional)",
  "submit": "Submit request"
}
```

And inside the existing `today` object: `"unavailability": "Request time off"`

- [ ] **Step 2: Write the screen**

`src/app/unavailability/suggest.tsx`:

```tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { suggestUnavailability } from '../../features/requests/api';

export default function SuggestUnavailabilityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await suggestUnavailability(houseId, periodStart, periodEnd, reason || undefined);
      router.replace('/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{t('unavailability.title')}</Text>

      <Text>{t('unavailability.periodStartLabel')}</Text>
      <TextInput
        value={periodStart}
        onChangeText={setPeriodStart}
        placeholder="2026-08-01"
        testID="unavailability-start-input"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />

      <Text>{t('unavailability.periodEndLabel')}</Text>
      <TextInput
        value={periodEnd}
        onChangeText={setPeriodEnd}
        placeholder="2026-08-05"
        testID="unavailability-end-input"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />

      <Text>{t('unavailability.reasonLabel')}</Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        testID="unavailability-reason-input"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />

      {error && <Text testID="unavailability-error">{error}</Text>}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting || !periodStart || !periodEnd}
        testID="unavailability-submit"
        style={{ backgroundColor: '#4C7A8C', borderRadius: 14, padding: 14, alignItems: 'center' }}
      >
        <Text style={{ color: '#fff', fontWeight: '800' }}>{t('unavailability.submit')}</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 3: Add the nav link from Today**

In `src/app/today.tsx`, add a fourth button in the bottom button `View`, visible to all members:

```tsx
<Pressable
  onPress={() => router.push({ pathname: '/unavailability/suggest', params: { houseId: houseId ?? '' } })}
  testID="today-unavailability"
  style={{ borderWidth: 1.5, borderColor: '#8B5FBF', borderRadius: 14, padding: 14, alignItems: 'center' }}
>
  <Text style={{ color: '#8B5FBF', fontWeight: '700' }}>{t('today.unavailability')}</Text>
</Pressable>
```

- [ ] **Step 4: Manual check — actually run it, with real evidence in your report**

With the local stack running, navigate to `/unavailability/suggest?houseId=<id>`, submit a date range, confirm a `bayit_shave.unavailability_requests` row appears with `status='pending'`, then confirm it shows up correctly on `/missions/suggestions` (Task 9's rendering).

- [ ] **Step 5: Run the full Jest suite**

```bash
npm test
```

Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add unavailability request screen and nav link"
```

---

## End-to-End Manual Verification

After all eleven tasks, against the **local** Supabase stack:

1. `npx supabase start` (if not already running), `npx supabase functions serve` in a separate terminal, `npx expo start --web` in a third.
2. **Swap flow:** as member A (assigned to a mission), tap "Request swap" on that mission, pick member B. As B, see the incoming swap request on `/today`, tap Accept. As admin, see it in `/missions/suggestions`, tap Approve — confirm the mission now shows on B's `/today`, not A's.
3. **Swap expiry (manual check):** create a swap request, then directly edit its `created_at` in Studio to 8 days ago. Try to respond to it (as B) or resolve it (as admin) — confirm both paths return the expired error and the row flips to `rejected`.
4. **Unavailability flow:** as a member, request time off covering today's date. As admin, approve it in `/missions/suggestions`. Suggest a pool mission, run balance (`/balance`) — confirm the unavailable member is skipped and their `points_ledger.debt` increased instead of `points_target`.
5. Confirm a house using `round_robin` strategy also correctly skips an unavailable member during `run-balance` (change `assignment_strategy` via Studio's SQL editor to test both strategies).

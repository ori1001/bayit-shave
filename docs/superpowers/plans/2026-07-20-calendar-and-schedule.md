# Calendar & Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every member can see a month calendar of the house's missions (color-coded by category), toggle between "everyone" and "just mine," and tap any day to see that day's detail. From the day-detail sheet, an admin can edit a mission's due date directly; a member can only propose a new date for a mission assigned to them — the fifth and final suggestion type from the design spec ("schedule edit"), routed through the same suggestions inbox as every other suggestion type.

**Architecture:** One Edge Function (`edit-mission-schedule`) mirrors the existing `edit-mission-points` pattern exactly (admin applies immediately, non-admin proposes via `proposed_due_date`/`proposed_by`). `resolve-suggestion` (already shipped) gets a third `suggestion_type` branch. The calendar screen and day-detail sheet are new client-only UI over data that's already fully queryable with plain `supabase-js` reads — no new tables, no new columns (`mission_instances.proposed_due_date` and `.proposed_by` already exist from Foundation and the Missions & Suggestions plan, just never wired into a client type or UI until now).

**Tech Stack:** Same as every prior plan — Expo/TypeScript/Router client, Supabase (Postgres + Edge Functions/Deno), Jest, Deno tests.

## Global Constraints

- Everything stays in `bayit_shave` — never `public`, never any other schema.
- Every mutating action goes through an Edge Function using service-role scoped to `bayit_shave` — no direct client writes to `mission_instances`.
- A points-edit or schedule-edit suggestion never touches `mission_instances.status` — only the matching `proposed_*` field (plus `proposed_by`), so an already-`assigned` mission stays assigned and visible while the edit awaits approval (established in the Missions & Suggestions plan, unchanged here).
- Every Edge Function in this plan follows the auth-before-state check ordering established across every prior plan (fetch resource → verify caller's authorization for it → THEN check its business state) — two real bugs from that class were found and fixed in the Swap & Unavailability plan; do not reintroduce it.

## Scope decision made for this plan (read before implementing)

**Schedule-edit is date-only, not reassignment.** The design spec's original "schedule edit" suggestion described a member being able to propose both a new due date AND a new assignee from the calendar. This plan scopes it to **due date only** — reassignment-to-a-specific-other-member is already fully covered by the Swap & Unavailability plan's dedicated three-party handshake (suggest → accept → admin approve), which is a more deliberate flow than a same-shot date+assignee edit would be. Building a second, overlapping reassignment path here would create two different ways to do the same thing with different guarantees (swap requires the target's consent; a bare schedule-edit reassignment wouldn't). `mission_instances.proposed_assigned_to` (from Foundation) stays unused by this plan — it remains available in the schema for a future plan if a genuine need for it emerges separately from swap.

**Notifications and native device-calendar sync are explicitly out of scope for this plan.** They require a real phone or simulator to verify (`expo-notifications` local scheduling, `expo-calendar` device writes) — this environment only has Expo web, so neither can be verified the way every other feature in this project has been (Deno tests, Jest tests, or live Playwright runs against the actual app). They're deferred to a dedicated follow-up plan, verified on a real device when one is available, rather than shipped here as unverified device-only code.

## File Structure

```
/supabase
  /functions
    /edit-mission-schedule/index.ts
    /resolve-suggestion/index.ts    # MODIFIED — add 'schedule_edit' suggestion_type
  /tests
    /functions
      schedule.test.ts                # Deno integration tests
      missions.test.ts                 # MODIFIED — append schedule_edit resolve tests
/src
  /features
    /missions
      api.ts               # MODIFIED — add proposed_due_date to Mission, editMissionSchedule(),
                            # getMonthMissions(), broaden getSuggestions()'s filter
      __tests__/api.test.ts  # MODIFIED — append tests for the above
  /app
    calendar.tsx              # new month-calendar screen + day-detail sheet
    today.tsx                  # MODIFIED — nav link to /calendar
    /missions
      suggestions.tsx           # MODIFIED — render schedule_edit suggestion cards
  /i18n/locales
    he.json                      # MODIFIED — add `calendar.*` keys
    en.json                       # MODIFIED — same keys, English
```

---

### Task 1: `edit-mission-schedule` Edge Function + Deno tests

**Files:**
- Create: `supabase/functions/edit-mission-schedule/index.ts`
- Create: `supabase/tests/functions/schedule.test.ts`

**Interfaces:**
- Consumes: `bayit_shave.mission_instances`, `bayit_shave.members`.
- Produces: `POST /functions/v1/edit-mission-schedule` — body `{ mission_instance_id: string, due_date: string }`, auth: Bearer user JWT. Returns `200 { mission }` or `4xx/5xx { error: string }`. Task 3's `editMissionSchedule()` calls this directly. Mirrors `edit-mission-points` exactly: admin caller applies `due_date` immediately; non-admin caller must be the mission's current `assigned_to`, and only sets `proposed_due_date`/`proposed_by`, leaving the live `due_date` untouched.

- [ ] **Step 1: Write the function**

`supabase/functions/edit-mission-schedule/index.ts`:

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

  const { mission_instance_id, due_date } = await req.json();
  if (!mission_instance_id || !due_date) {
    return new Response(JSON.stringify({ error: 'mission_instance_id_and_due_date_required' }), { status: 400 });
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
    .select('id, house_id, assigned_to')
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
  if (!isAdmin && mission.assigned_to !== callerMember.id) {
    return new Response(JSON.stringify({ error: 'not_assigned_to_you' }), { status: 403 });
  }

  const { data: updated, error: updateError } = await admin
    .from('mission_instances')
    .update(
      isAdmin
        ? { due_date, proposed_due_date: null, proposed_by: null, approved_by: callerMember.id, approved_at: new Date().toISOString() }
        : { proposed_due_date: due_date, proposed_by: callerMember.id }
    )
    .eq('id', mission_instance_id)
    .select()
    .single();

  if (updateError) {
    return new Response(JSON.stringify({ error: 'schedule_edit_failed' }), { status: 500 });
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

Get the anon/service-role keys: `npx supabase status`.

`supabase/tests/functions/schedule.test.ts`:

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

async function seedHouseWithAssignedMission() {
  const adminToken = await signUpAndSignIn(`admin+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Schedule Test House', admin_name: 'Admin' }),
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
      target_member_id: member.id,
    }),
  });
  const { mission } = await missionRes.json();

  return { house, adminToken, adminMember, memberToken, member, mission };
}

Deno.test('edit-mission-schedule: admin applies the new date immediately', async () => {
  const { adminToken, mission } = await seedHouseWithAssignedMission();

  const res = await fetch(`${FUNCTIONS_URL}/edit-mission-schedule`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, due_date: '2026-07-30' }),
  });
  assertEquals(res.status, 200);
  const { mission: updated } = await res.json();
  assertEquals(updated.due_date, '2026-07-30');
  assertEquals(updated.proposed_due_date, null);
});

Deno.test('edit-mission-schedule: assignee proposes a date, live due_date unchanged', async () => {
  const { memberToken, member, mission } = await seedHouseWithAssignedMission();

  const res = await fetch(`${FUNCTIONS_URL}/edit-mission-schedule`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, due_date: '2026-08-01' }),
  });
  assertEquals(res.status, 200);
  const { mission: updated } = await res.json();
  assertEquals(updated.due_date, '2026-07-25');
  assertEquals(updated.proposed_due_date, '2026-08-01');
  assertEquals(updated.proposed_by, member.id);
});

Deno.test('edit-mission-schedule: non-assignee, non-admin member is rejected', async () => {
  const { house, adminToken, memberToken, mission } = await seedHouseWithAssignedMission();

  const thirdToken = await signUpAndSignIn(`third+${crypto.randomUUID()}@example.com`);
  await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${thirdToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: house.invite_code, name: 'Third' }),
  });

  const res = await fetch(`${FUNCTIONS_URL}/edit-mission-schedule`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${thirdToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, due_date: '2026-08-01' }),
  });
  assertEquals(res.status, 403);

  void adminToken;
  void memberToken;
});
```

- [ ] **Step 4: Run the tests**

```bash
export SUPABASE_ANON_KEY=<anon key from supabase status>
export SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/functions/schedule.test.ts
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add edit-mission-schedule Edge Function"
```

---

### Task 2: Add `schedule_edit` to `resolve-suggestion`

**Files:**
- Modify: `supabase/functions/resolve-suggestion/index.ts`
- Modify: `supabase/tests/functions/missions.test.ts` (append tests)

**Interfaces:**
- Consumes: `edit-mission-schedule` (Task 1).
- Produces: `resolve-suggestion` now accepts `suggestion_type: 'new_mission' | 'points_edit' | 'schedule_edit'`. For `schedule_edit`: approve copies `proposed_due_date` → `due_date`, clears `proposed_due_date`/`proposed_by`, sets `approved_by`/`approved_at`; reject just clears `proposed_due_date`/`proposed_by`. Same "must have a pending proposal to resolve" guard pattern as `points_edit` (409 if nothing pending).

- [ ] **Step 1: Modify the function**

In `supabase/functions/resolve-suggestion/index.ts`, change the type-validation line:

```ts
if (suggestion_type !== 'new_mission' && suggestion_type !== 'points_edit') {
  return new Response(JSON.stringify({ error: 'invalid_suggestion_type' }), { status: 400 });
}
```

to:

```ts
if (suggestion_type !== 'new_mission' && suggestion_type !== 'points_edit' && suggestion_type !== 'schedule_edit') {
  return new Response(JSON.stringify({ error: 'invalid_suggestion_type' }), { status: 400 });
}
```

Then change the `else` branch that currently only handles `points_edit`:

```ts
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
```

to:

```ts
} else if (suggestion_type === 'points_edit') {
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
} else {
  if (!mission.proposed_due_date) {
    return new Response(JSON.stringify({ error: 'no_pending_schedule_edit' }), { status: 409 });
  }
  updatePayload =
    decision === 'approve'
      ? {
          due_date: mission.proposed_due_date,
          proposed_due_date: null,
          proposed_by: null,
          approved_by: callerMember.id,
          approved_at: new Date().toISOString(),
        }
      : { proposed_due_date: null, proposed_by: null };
}
```

- [ ] **Step 2: Append tests to `missions.test.ts`**

Add to `supabase/tests/functions/missions.test.ts` (needs a mission with a proposed schedule edit — call `edit-mission-schedule` first, same pattern as the existing points-edit tests in this file):

```ts
Deno.test('resolve-suggestion: approving a schedule_edit copies proposed_due_date into due_date', async () => {
  const { house, adminToken, memberToken, member } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'trash',
      title: 'Take out trash',
      points: 10,
      due_date: '2026-07-25',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  const { mission: created } = await createRes.json();

  await fetch(`${FUNCTIONS_URL}/edit-mission-schedule`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: created.id, due_date: '2026-08-02' }),
  });

  const approveRes = await fetch(`${FUNCTIONS_URL}/resolve-suggestion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestion_type: 'schedule_edit', mission_instance_id: created.id, decision: 'approve' }),
  });
  assertEquals(approveRes.status, 200);
  const { mission: approved } = await approveRes.json();
  assertEquals(approved.due_date, '2026-08-02');
  assertEquals(approved.proposed_due_date, null);
});

Deno.test('resolve-suggestion: rejecting a schedule_edit with nothing pending returns 409', async () => {
  const { house, adminToken, member } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'garden',
      title: 'Water plants',
      points: 6,
      due_date: '2026-07-25',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  const { mission: created } = await createRes.json();

  const rejectRes = await fetch(`${FUNCTIONS_URL}/resolve-suggestion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestion_type: 'schedule_edit', mission_instance_id: created.id, decision: 'reject' }),
  });
  assertEquals(rejectRes.status, 409);
});
```

- [ ] **Step 3: Run the full missions test file**

```bash
deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/functions/missions.test.ts
```

Expected: all prior tests still pass, plus these 2 new ones.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add schedule_edit suggestion type to resolve-suggestion"
```

---

### Task 3: Client API — schedule edit, month query, broadened suggestions filter

**Files:**
- Modify: `src/features/missions/api.ts`
- Modify: `src/features/missions/__tests__/api.test.ts`

**Interfaces:**
- Consumes: `edit-mission-schedule` (Task 1), `resolve-suggestion` (Task 2, already client-wrapped by the existing `resolveSuggestion`, whose type signature just needs widening).
- Produces:
  - `Mission` interface gains `proposed_due_date: string | null` (the column has existed since Foundation, just never been on the client type).
  - `editMissionSchedule(missionInstanceId: string, dueDate: string): Promise<{ mission: Mission }>`
  - `resolveSuggestion`'s `suggestionType` parameter widens to `'new_mission' | 'points_edit' | 'schedule_edit'`.
  - `getSuggestions` broadens its filter to also catch rows with a pending schedule edit.
  - `getMonthMissions(houseId: string, year: number, month: number): Promise<Mission[]>` — missions where `due_date` falls within the given month (1-indexed `month`, matching JS `Date` convention where callers already do `date.getMonth() + 1`), for the calendar screen. Not filtered by status, EXCEPT `rejected` missions are excluded (never worth showing on a calendar).

- [ ] **Step 1: Write the failing test**

Add to `src/features/missions/__tests__/api.test.ts` (the file already has a `mockSelectChain` helper — reuse it; add `.gte`/`.lte`/`.neq` to the chain if not already present):

```ts
import { editMissionSchedule, getMonthMissions } from '../api';

describe('editMissionSchedule', () => {
  it('invokes edit-mission-schedule with mission id and due date', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { mission: { id: 'm1', proposed_due_date: '2026-08-01' } },
      error: null,
    });
    const result = await editMissionSchedule('m1', '2026-08-01');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('edit-mission-schedule', {
      body: { mission_instance_id: 'm1', due_date: '2026-08-01' },
    });
    expect(result.mission.proposed_due_date).toBe('2026-08-01');
  });
});

describe('getMonthMissions', () => {
  it('queries mission_instances within the given month, excluding rejected', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      then: (resolve: (value: { data: unknown; error: unknown }) => void) =>
        resolve({ data: [{ id: 'm1' }], error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getMonthMissions('h1', 2026, 8);
    expect(supabase.from).toHaveBeenCalledWith('mission_instances');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    expect(chain.neq).toHaveBeenCalledWith('status', 'rejected');
    expect(chain.gte).toHaveBeenCalledWith('due_date', '2026-08-01');
    expect(chain.lte).toHaveBeenCalledWith('due_date', '2026-08-31');
    expect(result).toEqual([{ id: 'm1' }]);
  });
});
```

Also add a test confirming `getSuggestions` catches a schedule-edit row — add to the existing `describe('getSuggestions', ...)` block:

```ts
it('includes the proposed_due_date condition in its filter', async () => {
  const chain = mockSelectChain({ data: [{ id: 'm1' }], error: null });
  (supabase.from as jest.Mock).mockReturnValue(chain);
  await getSuggestions('h1');
  expect(chain.or).toHaveBeenCalledWith(
    'status.eq.pending_approval,proposed_points.not.is.null,proposed_due_date.not.is.null'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/missions/__tests__/api.test.ts`
Expected: FAIL — `editMissionSchedule`/`getMonthMissions` not exported yet, and the `getSuggestions` filter-string test fails against the old, narrower filter.

- [ ] **Step 3: Implement the changes**

In `src/features/missions/api.ts`:

Add `proposed_due_date` to the `Mission` interface:

```ts
export interface Mission {
  id: string;
  house_id: string;
  title: string;
  category: MissionCategory;
  points: number;
  proposed_points: number | null;
  proposed_due_date: string | null;
  proposed_by: string | null;
  due_date: string;
  assigned_to: string | null;
  status: 'pending_approval' | 'open' | 'assigned' | 'done' | 'rejected';
  created_by: string;
  assignment_mode: AssignmentMode;
  approved_by: string | null;
  approved_at: string | null;
}
```

Widen `resolveSuggestion`'s type parameter:

```ts
export async function resolveSuggestion(
  suggestionType: 'new_mission' | 'points_edit' | 'schedule_edit',
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
```

Add `editMissionSchedule`, right after `editMissionPoints`:

```ts
export async function editMissionSchedule(missionInstanceId: string, dueDate: string): Promise<{ mission: Mission }> {
  const { data, error } = await supabase.functions.invoke('edit-mission-schedule', {
    body: { mission_instance_id: missionInstanceId, due_date: dueDate },
  });
  if (error) {
    return throwFromInvokeError(data, error);
  }
  return data;
}
```

Broaden `getSuggestions`'s filter:

```ts
export async function getSuggestions(houseId: string): Promise<Mission[]> {
  const { data, error } = await supabase
    .from('mission_instances')
    .select('*')
    .eq('house_id', houseId)
    .or('status.eq.pending_approval,proposed_points.not.is.null,proposed_due_date.not.is.null');
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Mission[];
}
```

Add `getMonthMissions`, after `getTodayMissions`:

```ts
export async function getMonthMissions(houseId: string, year: number, month: number): Promise<Mission[]> {
  const monthStr = String(month).padStart(2, '0');
  const daysInMonth = new Date(year, month, 0).getDate();
  const start = `${year}-${monthStr}-01`;
  const end = `${year}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('mission_instances')
    .select('*')
    .eq('house_id', houseId)
    .neq('status', 'rejected')
    .gte('due_date', start)
    .lte('due_date', end);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Mission[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/missions/__tests__/api.test.ts`
Expected: PASS, all tests (previous count + 3 new).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add editMissionSchedule, getMonthMissions, broaden getSuggestions filter"
```

---

### Task 4: Show schedule-edit suggestions in the inbox

**Files:**
- Modify: `src/app/missions/suggestions.tsx`
- Modify: `src/i18n/locales/he.json`, `src/i18n/locales/en.json` (add `suggestions.scheduleEdit` key)

**Interfaces:**
- Consumes: the broadened `getSuggestions`, widened `resolveSuggestion` (Task 3).
- Produces: the mission-suggestion card in the inbox now correctly classifies and renders a schedule-edit suggestion (in addition to the existing new-mission/points-edit classification), and resolves it via `resolveSuggestion('schedule_edit', ...)`.

**Note on classification overlap:** as with the existing `points_edit`/`pending_approval` overlap (a mission can theoretically be both pending-approval AND have a proposed edit sitting on it — already documented as a low-severity, UI-unreachable edge case in the Missions & Suggestions plan), a mission could theoretically have both `proposed_points` and `proposed_due_date` set. This task's classification order is: `pending_approval` (new_mission) first, then `proposed_points` (points_edit), then `proposed_due_date` (schedule_edit) — same precedence pattern, same accepted-edge-case reasoning, not a new problem to solve here.

- [ ] **Step 1: Add the translation key**

Add to `src/i18n/locales/he.json`'s `suggestions` object: `"scheduleEdit": "שינוי תאריך"`
Add to `src/i18n/locales/en.json`'s `suggestions` object: `"scheduleEdit": "Date change"`

- [ ] **Step 2: Modify `suggestionTypeOf` and the mission card**

In `src/app/missions/suggestions.tsx`, change:

```ts
function suggestionTypeOf(mission: Mission): 'new_mission' | 'points_edit' {
  return mission.status === 'pending_approval' ? 'new_mission' : 'points_edit';
}
```

to:

```ts
function suggestionTypeOf(mission: Mission): 'new_mission' | 'points_edit' | 'schedule_edit' {
  if (mission.status === 'pending_approval') {
    return 'new_mission';
  }
  if (mission.proposed_points !== null) {
    return 'points_edit';
  }
  return 'schedule_edit';
}
```

In the mission card's `renderItem` branch, change the label line:

```tsx
<Text style={{ fontSize: 11, fontWeight: '700', opacity: 0.6 }}>
  {kind === 'new_mission' ? t('suggestions.newMission') : t('suggestions.pointsEdit')}
</Text>
```

to:

```tsx
<Text style={{ fontSize: 11, fontWeight: '700', opacity: 0.6 }}>
  {kind === 'new_mission' ? t('suggestions.newMission') : kind === 'points_edit' ? t('suggestions.pointsEdit') : t('suggestions.scheduleEdit')}
</Text>
```

And the body line:

```tsx
<Text style={{ fontWeight: '700' }}>
  {kind === 'new_mission'
    ? `${item.mission.title} · ${item.mission.points}`
    : `${item.mission.title} · ${item.mission.points} → ${item.mission.proposed_points}`}
</Text>
```

to:

```tsx
<Text style={{ fontWeight: '700' }}>
  {kind === 'new_mission'
    ? `${item.mission.title} · ${item.mission.points}`
    : kind === 'points_edit'
      ? `${item.mission.title} · ${item.mission.points} → ${item.mission.proposed_points}`
      : `${item.mission.title} · ${item.mission.due_date} → ${item.mission.proposed_due_date}`}
</Text>
```

The existing `handleMissionDecision` already calls `resolveSuggestion(suggestionTypeOf(mission), mission.id, decision)` — since `suggestionTypeOf` now returns the correct third value and `resolveSuggestion`'s type was widened in Task 3, no change needed there.

- [ ] **Step 3: Manual check**

```bash
npx expo start --web
```

Seed a schedule-edit suggestion (have a member call `edit-mission-schedule` on their own mission), navigate to `/missions/suggestions?houseId=<id>` as admin, confirm the card renders with the "Date change" label and the old→new date, and that approving it works.

- [ ] **Step 4: Run the full Jest suite**

```bash
npm test
```

Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: show schedule-edit suggestions in the inbox"
```

---

### Task 5: Calendar screen

**Files:**
- Create: `src/app/calendar.tsx`
- Modify: `src/i18n/locales/he.json`, `src/i18n/locales/en.json` (add `calendar.*` keys)

**Interfaces:**
- Consumes: `getMonthMissions`, `getHouseMembers` (from `src/features/missions/api.ts`), `editMissionSchedule`, `getMyMembership`.
- Produces: the month-calendar screen every member can reach. No new exports — leaf screen.

- [ ] **Step 1: Add `calendar.*` translation keys**

Add to `src/i18n/locales/he.json`:

```json
"calendar": {
  "title": "לוח שנה",
  "mine": "שלי",
  "everyone": "כולם",
  "noMissionsThisDay": "אין משימות ביום זה",
  "editDate": "ערוך תאריך",
  "suggestNewDate": "הצע תאריך חדש",
  "newDateLabel": "תאריך חדש (YYYY-MM-DD)",
  "save": "שמור",
  "cancel": "ביטול",
  "viewOnly": "צפייה בלבד"
}
```

Add to `src/i18n/locales/en.json`:

```json
"calendar": {
  "title": "Calendar",
  "mine": "Mine",
  "everyone": "Everyone",
  "noMissionsThisDay": "No missions on this day",
  "editDate": "Edit date",
  "suggestNewDate": "Suggest new date",
  "newDateLabel": "New date (YYYY-MM-DD)",
  "save": "Save",
  "cancel": "Cancel",
  "viewOnly": "View only"
}
```

- [ ] **Step 2: Write the screen**

`src/app/calendar.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import {
  getMonthMissions,
  getHouseMembers,
  getMyMembership,
  editMissionSchedule,
  type Mission,
} from '../features/missions/api';

const CATEGORY_COLORS: Record<string, string> = {
  dishes: '#1F9E93',
  clean: '#8B5FBF',
  laundry: '#5B72C9',
  trash: '#E0793A',
  shop: '#D45A82',
  pets: '#D99A2B',
  garden: '#7AA23E',
  bath: '#3FAFC9',
  other: '#888888',
};

export default function CalendarScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [newDateValue, setNewDateValue] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const membership = await getMyMembership(houseId);
    setMyMemberId(membership?.id ?? null);
    setIsAdmin(membership?.role === 'admin');
    const [monthMissions, houseMembers] = await Promise.all([
      getMonthMissions(houseId, year, month),
      getHouseMembers(houseId),
    ]);
    setMissions(monthMissions);
    setMembers(houseMembers);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId, year, month]);

  const visibleMissions = useMemo(
    () => (mineOnly ? missions.filter((m) => m.assigned_to === myMemberId) : missions),
    [missions, mineOnly, myMemberId]
  );

  const missionsByDay = useMemo(() => {
    const map = new Map<number, Mission[]>();
    for (const mission of visibleMissions) {
      const day = Number(mission.due_date.slice(8, 10));
      const existing = map.get(day) ?? [];
      existing.push(mission);
      map.set(day, existing);
    }
    return map;
  }, [visibleMissions]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  function handlePrevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
    setSelectedDay(null);
  }

  function handleNextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
    setSelectedDay(null);
  }

  function startEditDate(mission: Mission) {
    setEditingMissionId(mission.id);
    setNewDateValue(mission.due_date);
  }

  async function handleSaveDate(missionId: string) {
    await editMissionSchedule(missionId, newDateValue);
    setEditingMissionId(null);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1 }} />;
  }

  const selectedMissions = selectedDay !== null ? (missionsByDay.get(selectedDay) ?? []) : [];

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{t('calendar.title')}</Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={handlePrevMonth} testID="calendar-prev-month">
          <Text style={{ fontSize: 18 }}>‹</Text>
        </Pressable>
        <Text style={{ fontWeight: '700' }}>
          {year}-{String(month).padStart(2, '0')}
        </Text>
        <Pressable onPress={handleNextMonth} testID="calendar-next-month">
          <Text style={{ fontSize: 18 }}>›</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => setMineOnly(false)}
          testID="calendar-everyone"
          style={{ flex: 1, padding: 8, borderRadius: 10, alignItems: 'center', backgroundColor: !mineOnly ? '#26332E' : 'transparent', borderWidth: 1.5, borderColor: '#26332E' }}
        >
          <Text style={{ color: !mineOnly ? '#F6F1E4' : '#26332E' }}>{t('calendar.everyone')}</Text>
        </Pressable>
        <Pressable
          onPress={() => setMineOnly(true)}
          testID="calendar-mine"
          style={{ flex: 1, padding: 8, borderRadius: 10, alignItems: 'center', backgroundColor: mineOnly ? '#26332E' : 'transparent', borderWidth: 1.5, borderColor: '#26332E' }}
        >
          <Text style={{ color: mineOnly ? '#F6F1E4' : '#26332E' }}>{t('calendar.mine')}</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {dayNumbers.map((day) => {
          const dayMissions = missionsByDay.get(day) ?? [];
          return (
            <Pressable
              key={day}
              onPress={() => setSelectedDay(day)}
              testID={`calendar-day-${day}`}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                borderWidth: selectedDay === day ? 2 : 1,
                borderColor: selectedDay === day ? '#26332E' : '#ccc',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              <Text style={{ fontSize: 11 }}>{day}</Text>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {dayMissions.slice(0, 3).map((m, i) => (
                  <View
                    key={i}
                    style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: CATEGORY_COLORS[m.category] ?? '#888' }}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      {selectedDay !== null && (
        <ScrollView style={{ flex: 1, borderTopWidth: 1, borderColor: '#eee', paddingTop: 12 }}>
          {selectedMissions.length === 0 && <Text style={{ opacity: 0.6 }}>{t('calendar.noMissionsThisDay')}</Text>}
          {selectedMissions.map((mission) => {
            const canEdit = isAdmin || mission.assigned_to === myMemberId;
            const assigneeName = members.find((m) => m.id === mission.assigned_to)?.name ?? '';
            return (
              <View key={mission.id} testID={`calendar-mission-${mission.id}`} style={{ gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f0f0f0' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: CATEGORY_COLORS[mission.category] ?? '#888' }} />
                  <Text style={{ fontWeight: '700', flex: 1 }}>{mission.title}</Text>
                  <Text style={{ fontSize: 12, opacity: 0.6 }}>{mission.points}</Text>
                </View>
                <Text style={{ fontSize: 12, opacity: 0.6 }}>{assigneeName}</Text>
                {canEdit ? (
                  <Pressable onPress={() => startEditDate(mission)} testID={`calendar-edit-${mission.id}`}>
                    <Text style={{ fontSize: 12, color: '#4C7A8C' }}>
                      {isAdmin ? t('calendar.editDate') : t('calendar.suggestNewDate')}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={{ fontSize: 11, opacity: 0.4 }}>{t('calendar.viewOnly')}</Text>
                )}
                {editingMissionId === mission.id && (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      value={newDateValue}
                      onChangeText={setNewDateValue}
                      testID={`calendar-date-input-${mission.id}`}
                      style={{ borderWidth: 1, borderRadius: 8, padding: 6, width: 120 }}
                    />
                    <Pressable onPress={() => handleSaveDate(mission.id)} testID={`calendar-date-save-${mission.id}`}>
                      <Text style={{ color: '#7C9473', fontWeight: '700' }}>{t('calendar.save')}</Text>
                    </Pressable>
                    <Pressable onPress={() => setEditingMissionId(null)} testID={`calendar-date-cancel-${mission.id}`}>
                      <Text style={{ color: '#A6425A', fontWeight: '700' }}>{t('calendar.cancel')}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Manual check — actually run it, with real evidence in your report**

With the local stack running: seed a house with 2+ members and a few missions with varying `due_date`s and categories in the current month. Navigate to `/calendar?houseId=<id>`, confirm: the grid renders with colored dots on the right days; tapping a day opens the detail list below; toggling "Mine"/"Everyone" changes which dots/list items show; as admin, editing a date applies immediately (mission moves to the new day on next load); as a non-admin viewing their own mission, "Suggest new date" creates a `proposed_due_date` (visible in Studio, not yet applied); as a non-admin viewing someone else's mission, only "View only" shows, no edit control.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add month calendar screen with day-detail schedule editing"
```

---

### Task 6: Nav link from Today screen

**Files:**
- Modify: `src/app/today.tsx`
- Modify: `src/i18n/locales/he.json`, `src/i18n/locales/en.json` (add `today.calendar` key)

**Interfaces:**
- Consumes: nothing new — links to the already-built `/calendar` screen (Task 5).
- Produces: nothing new — leaf UI change.

- [ ] **Step 1: Add the translation key**

Add to `src/i18n/locales/he.json`'s `today` object: `"calendar": "לוח שנה"`
Add to `src/i18n/locales/en.json`'s `today` object: `"calendar": "Calendar"`

- [ ] **Step 2: Add the nav button**

In `src/app/today.tsx`, add a fifth button in the bottom button `View` (visible to all members, alongside `today-suggest-mission`, `today-balance`, `today-unavailability`):

```tsx
<Pressable
  onPress={() => router.push({ pathname: '/calendar', params: { houseId: houseId ?? '' } })}
  testID="today-calendar"
  style={{ borderWidth: 1.5, borderColor: '#5B72C9', borderRadius: 14, padding: 14, alignItems: 'center' }}
>
  <Text style={{ color: '#5B72C9', fontWeight: '700' }}>{t('today.calendar')}</Text>
</Pressable>
```

- [ ] **Step 3: Run the full Jest suite**

```bash
npm test
```

Expected: PASS, all suites.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add calendar screen nav link from Today"
```

---

## End-to-End Manual Verification

After all six tasks, against the **local** Supabase stack:

1. `npx supabase start` (if not already running), `npx supabase functions serve` in a separate terminal, `npx expo start --web` in a third.
2. As admin, create a house, suggest 2-3 missions with different due dates in the current month and different categories, assign them.
3. Navigate to `/calendar` — confirm the dots appear on the right days in the right colors, tapping a day shows the right missions.
4. As admin, edit a mission's date directly from the day-detail sheet — confirm it moves to the new day on next load.
5. As the assigned member (non-admin), propose a new date on your own mission — confirm the live date is unchanged, but the proposal now appears on `/missions/suggestions` as a "Date change" card.
6. As admin, approve it from the inbox — confirm the mission's date actually updates and it moves to the new day on the calendar.
7. Confirm a member viewing someone else's mission on the calendar sees "View only," no edit control.

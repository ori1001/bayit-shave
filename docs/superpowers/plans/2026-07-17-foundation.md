# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Expo app skeleton, the Supabase schema for every entity in the design spec, house-isolation RLS, and the invite-code onboarding flow — end state: a person can open the app, create a house (becoming admin) or join one with an invite code, in Hebrew by default or English.

**Architecture:** React Native (Expo, TypeScript, Expo Router) client talking to a local Supabase project (Postgres + Auth + Edge Functions). House creation and invite-code joining run through two Edge Functions using the service-role key, because both need to look up/insert rows before the caller has RLS-visible house membership. All other schema/RLS in this plan is read-only house-isolation — the fine-grained "admin approval gate" write rules for missions/suggestions are out of scope here and belong to the next plan (Missions & Suggestions).

**Tech Stack:** Expo SDK (latest stable) + TypeScript + Expo Router, `i18next` + `react-i18next` + `expo-localization`, Supabase CLI (local dev stack: Postgres, Auth, Edge Functions via Deno), Jest + `jest-expo` + `@testing-library/react-native`, pgTAP for RLS tests, `Deno.test` for Edge Function integration tests.

## Global Constraints

- Client is React Native via Expo, single codebase for iOS and Android (spec: Architecture).
- Hebrew is the default locale (RTL), English is secondary (LTR); all UI copy comes from `i18next` translation resources, never hardcoded strings (spec: Architecture, Localization).
- Backend is Supabase: Postgres, Supabase Auth, Row Level Security scoped per house — one house's data must never be visible to another's queries (spec: Architecture, Backend).
- Invite-code join and house creation happen through service-role Edge Functions, not client-side RLS-gated inserts, because the caller isn't yet a house member when they call them (spec: Architecture, Backend).
- Every table in an exposed schema must have RLS enabled — this is a hard Supabase security requirement, not a style preference.
- RLS policies use `to authenticated` plus an ownership/membership predicate — never `auth.role() = 'authenticated'` alone (Supabase security checklist).
- **All app tables/types live in a dedicated `bayit_shave` schema, never `public`.** The target Supabase project (`nqiauqgwpygsibwxiuov`) is shared with other unrelated apps, each in its own schema — never create objects in `public` or touch any other schema. Unlike `public`, a custom schema has no default grants: every migration that creates it must also `grant usage on schema bayit_shave to authenticated, anon;` and grant table-level privileges explicitly (RLS still governs which *rows* are visible; the schema/table grants govern whether the role can reach the table at all).
- Local development still targets Supabase's local Docker-backed CLI stack throughout Tasks 3-6 (safe to reset/break). The `bayit_shave` schema convention applies there too, so the local schema matches what gets pushed to the remote project at the end. Pushing this schema to the real remote project is a separate, final task (Task 7) — no task before it touches the remote project.

---

## File Structure

```
/src
  /app                             # Expo Router's app dir lives under src/ in the current default template — NOT root-level /app (see Task 1 note)
    _layout.tsx                    # root layout: boots i18n, forces RTL/LTR before first render
    /onboarding
      create-house.tsx
      join-house.tsx
  /i18n
    language.ts                   # pure functions: resolveInitialLanguage, applyRTLForLanguage
    index.ts                      # side-effecting bootstrap: i18next.init + applyRTLForLanguage
    /locales
      he.json
      en.json
  /lib
    supabase.ts                   # supabase-js client factory
  /features
    /onboarding
      api.ts                      # createHouse(), joinHouse() — calls the two Edge Functions
/supabase
  config.toml
  /migrations
    <timestamp>_houses_and_members.sql
    <timestamp>_mission_and_ledger_tables.sql
  /functions
    /create-house/index.ts
    /join-house/index.ts
  /tests
    houses_and_members.test.sql   # pgTAP
    mission_and_ledger_tables.test.sql  # pgTAP
    /functions
      onboarding.test.ts          # Deno integration test for both Edge Functions
package.json
tsconfig.json
jest.config.js (or jest key in package.json)
```

---

### Task 1: Project scaffolding

**Files:**
- Create: entire Expo project (via CLI) — `package.json`, `app.json`, `tsconfig.json`, `src/app/_layout.tsx`, etc.
- Create: `src/lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a working Expo + TypeScript + Expo Router project with Jest wired up via `npm test`. Later tasks assume `src/` and `src/app/` exist and Jest runs.

This task is pure scaffolding — there's no application logic to red/green, so the "test" step here just proves the toolchain works, not TDD in the usual sense.

- [ ] **Step 1: Initialize git and the Expo project**

```bash
git init
npx create-expo-app@latest . --template default
```

Confirm it created `package.json`, `tsconfig.json`, and a Router `_layout.tsx` (Expo Router default template ships with one). **Note:** the current default template places the Router's app directory at `src/app/`, not root-level `app/` — if your scaffold lands it elsewhere, update every `app/...` path in the remaining tasks of this plan to match before continuing, and say so in your report.

- [ ] **Step 2: Add Jest**

```bash
npx expo install jest-expo jest @types/jest --dev
npm install --save-dev @testing-library/react-native
```

Add to `package.json`:

```json
{
  "scripts": {
    "test": "jest"
  },
  "jest": {
    "preset": "jest-expo"
  }
}
```

- [ ] **Step 3: Write and run the smoke test**

`src/lib/__tests__/smoke.test.ts`:

```ts
describe('project setup', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Expo + TypeScript + Jest project"
```

---

### Task 2: i18n bootstrap and RTL

**Files:**
- Create: `src/i18n/locales/he.json`
- Create: `src/i18n/locales/en.json`
- Create: `src/i18n/language.ts`
- Create: `src/i18n/index.ts`
- Create: `src/i18n/__tests__/language.test.ts`
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Consumes: nothing new (uses the Task 1 project).
- Produces: `resolveInitialLanguage(): 'he' | 'en'` and `applyRTLForLanguage(lang: 'he' | 'en'): boolean` from `src/i18n/language.ts` — later onboarding screens (Task 6) import `t` from `react-i18next`'s `useTranslation()` hook against the resources this task registers (keys `onboarding.*`).

- [ ] **Step 1: Install dependencies**

```bash
npm install i18next react-i18next
npx expo install expo-localization
```

- [ ] **Step 2: Write the failing test**

`src/i18n/__tests__/language.test.ts`:

```ts
import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import { resolveInitialLanguage, applyRTLForLanguage } from '../language';

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));

describe('resolveInitialLanguage', () => {
  it('defaults to Hebrew when the device locale is not English', () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'fr' }]);
    expect(resolveInitialLanguage()).toBe('he');
  });

  it('picks English when the device locale is English', () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'en' }]);
    expect(resolveInitialLanguage()).toBe('en');
  });

  it('defaults to Hebrew when locale detection returns nothing', () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([]);
    expect(resolveInitialLanguage()).toBe('he');
  });
});

describe('applyRTLForLanguage', () => {
  let forceRTLSpy: jest.SpyInstance;
  let allowRTLSpy: jest.SpyInstance;

  beforeEach(() => {
    forceRTLSpy = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
    allowRTLSpy = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forces RTL on for Hebrew when not already RTL', () => {
    Object.defineProperty(I18nManager, 'isRTL', { value: false, configurable: true });
    const changed = applyRTLForLanguage('he');
    expect(allowRTLSpy).toHaveBeenCalledWith(true);
    expect(forceRTLSpy).toHaveBeenCalledWith(true);
    expect(changed).toBe(true);
  });

  it('forces RTL off for English when currently RTL', () => {
    Object.defineProperty(I18nManager, 'isRTL', { value: true, configurable: true });
    const changed = applyRTLForLanguage('en');
    expect(forceRTLSpy).toHaveBeenCalledWith(false);
    expect(changed).toBe(true);
  });

  it('does nothing when the direction is already correct', () => {
    Object.defineProperty(I18nManager, 'isRTL', { value: true, configurable: true });
    const changed = applyRTLForLanguage('he');
    expect(forceRTLSpy).not.toHaveBeenCalled();
    expect(changed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/i18n/__tests__/language.test.ts`
Expected: FAIL with "Cannot find module '../language'"

- [ ] **Step 3: Implement `language.ts`**

`src/i18n/language.ts`:

```ts
import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';

export const SUPPORTED_LANGUAGES = ['he', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function resolveInitialLanguage(): SupportedLanguage {
  const deviceTag = Localization.getLocales()[0]?.languageCode;
  return deviceTag === 'en' ? 'en' : 'he';
}

/**
 * Returns true if the RTL direction actually changed. React Native only
 * applies a forceRTL change on the *next* app reload, not the current
 * render — callers that change language at runtime (not just at boot)
 * must trigger a reload (e.g. expo-updates' reloadAsync) when this
 * returns true.
 */
export function applyRTLForLanguage(lang: SupportedLanguage): boolean {
  const shouldBeRTL = lang === 'he';
  const changed = I18nManager.isRTL !== shouldBeRTL;
  if (changed) {
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);
  }
  return changed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/i18n/__tests__/language.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add translation resources**

`src/i18n/locales/he.json`:

```json
{
  "onboarding": {
    "appName": "בית שווה",
    "tagline": "לחלוקת משימות הוגנת בבית — כל אחד יודע מה ומתי, והניקוד דואג שיהיה שווה.",
    "createHouse": "צור בית חדש",
    "joinHouse": "הצטרף עם קוד הזמנה",
    "houseNameLabel": "שם הבית",
    "yourNameLabel": "השם שלך",
    "inviteCodeLabel": "קוד הזמנה",
    "submit": "המשך"
  }
}
```

`src/i18n/locales/en.json`:

```json
{
  "onboarding": {
    "appName": "Bayit Shave",
    "tagline": "Fair chore division for the house — everyone knows what and when, and points keep it equal.",
    "createHouse": "Create a new house",
    "joinHouse": "Join with an invite code",
    "houseNameLabel": "House name",
    "yourNameLabel": "Your name",
    "inviteCodeLabel": "Invite code",
    "submit": "Continue"
  }
}
```

- [ ] **Step 6: Wire the i18next bootstrap**

`src/i18n/index.ts`:

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import he from './locales/he.json';
import en from './locales/en.json';
import { resolveInitialLanguage, applyRTLForLanguage } from './language';

const initialLanguage = resolveInitialLanguage();
applyRTLForLanguage(initialLanguage);

i18n.use(initReactI18next).init({
  lng: initialLanguage,
  fallbackLng: 'he',
  resources: {
    he: { translation: he },
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
});

export default i18n;
```

- [ ] **Step 7: Import the bootstrap at app entry**

Modify `src/app/_layout.tsx` — add as the first import (side effects must run before any component renders):

```ts
import '../i18n';
```

- [ ] **Step 8: Run the full test suite and commit**

Run: `npm test`
Expected: PASS, all tests including Task 1's smoke test.

```bash
git add -A
git commit -m "feat: add i18next bootstrap with Hebrew-default RTL detection"
```

---

### Task 3: Supabase local project, houses & members schema, RLS

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `supabase/migrations/<timestamp>_houses_and_members.sql`
- Create: `supabase/tests/houses_and_members.test.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: tables `bayit_shave.houses` (`id`, `name`, `invite_code`, `admin_id`, `balance_period`, `balance_day`, `assignment_strategy`, `created_at`) and `bayit_shave.members` (`id`, `house_id`, `user_id`, `name`, `role`, `weight`, `created_at`), both RLS-enabled with house-membership SELECT policies. Task 4 adds the remaining five tables against the same `members` pattern; Task 5's Edge Functions insert into these two tables using the service-role key (bypassing RLS by design).

- [ ] **Step 1: Install the Supabase CLI and initialize**

```bash
npm install --save-dev supabase
npx supabase init
npx supabase start
```

Note the `API URL`, `anon key`, and `service_role key` printed — Task 5 and Task 6 need them.

- [ ] **Step 2: Create the migration file**

```bash
npx supabase migration new houses_and_members
```

This creates an empty timestamped file under `supabase/migrations/` — edit that file, don't create your own filename.

- [ ] **Step 3: Write the migration**

Edit the generated `supabase/migrations/<timestamp>_houses_and_members.sql`:

```sql
create schema if not exists bayit_shave;
-- custom schemas get no default grants (unlike public) — every role that
-- needs to reach this schema at all must be granted usage explicitly.
grant usage on schema bayit_shave to authenticated, service_role;

create type bayit_shave.member_role as enum ('admin', 'member');
create type bayit_shave.balance_period as enum ('weekly', 'monthly');
create type bayit_shave.assignment_strategy as enum ('round_robin', 'points_based', 'manual');

create table bayit_shave.houses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  admin_id uuid,
  balance_period bayit_shave.balance_period not null default 'weekly',
  balance_day smallint not null default 5 check (balance_day between 0 and 6), -- 0=Sunday..6=Saturday
  assignment_strategy bayit_shave.assignment_strategy not null default 'points_based',
  created_at timestamptz not null default now()
);

create table bayit_shave.members (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references bayit_shave.houses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role bayit_shave.member_role not null default 'member',
  weight numeric(4,2) not null default 1.0 check (weight > 0),
  created_at timestamptz not null default now(),
  unique (house_id, user_id)
);

alter table bayit_shave.houses
  add constraint houses_admin_id_fkey foreign key (admin_id) references bayit_shave.members(id) on delete set null;

alter table bayit_shave.houses enable row level security;
alter table bayit_shave.members enable row level security;

create policy "members select own house" on bayit_shave.members
  for select
  to authenticated
  using (
    house_id in (select m.house_id from bayit_shave.members m where m.user_id = (select auth.uid()))
  );

create policy "members update self" on bayit_shave.members
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "houses select for members" on bayit_shave.houses
  for select
  to authenticated
  using (
    id in (select m.house_id from bayit_shave.members m where m.user_id = (select auth.uid()))
  );

-- table-level grants: RLS governs which rows, these grant reaching the
-- table at all. service_role needs full CRUD since the Edge Functions
-- (Task 5) do every write through it.
grant select on bayit_shave.houses to authenticated;
grant select, insert, update, delete on bayit_shave.houses to service_role;
grant select, update on bayit_shave.members to authenticated;
grant select, insert, update, delete on bayit_shave.members to service_role;
```

- [ ] **Step 4: Apply the migration**

```bash
npx supabase db reset
```

Expected: output ends with "Finished supabase db reset" and no errors; `npx supabase migration list --local` shows the new migration applied.

- [ ] **Step 5: Write the RLS test (this is the "red" step — it fails until the migration above is correct)**

`supabase/tests/houses_and_members.test.sql`:

```sql
begin;
select plan(3);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'noa@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'itai@example.com');

insert into bayit_shave.houses (id, name, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'House A', 'CODEA1'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'House B', 'CODEB1');

insert into bayit_shave.members (house_id, user_id, name, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Noa', 'admin'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Itai', 'admin');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from bayit_shave.houses),
  1,
  'Noa sees only her own house via RLS'
);

select is(
  (select name from bayit_shave.houses limit 1),
  'House A',
  'the house Noa sees is House A, not House B'
);

select is(
  (select count(*)::int from bayit_shave.members),
  1,
  'Noa sees only members of her own house'
);

select * from finish();
rollback;
```

- [ ] **Step 6: Run the pgTAP tests**

Run: `npx supabase test db`
Expected: `3 tests, 0 failures` (or equivalent pass summary) for `houses_and_members.test.sql`.

If any assertion fails, re-check the policies in Step 3 before touching the test file.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add houses/members schema with house-isolation RLS"
```

---

### Task 4: Remaining schema tables

**Files:**
- Create: `supabase/migrations/<timestamp>_mission_and_ledger_tables.sql`
- Create: `supabase/tests/mission_and_ledger_tables.test.sql`

**Interfaces:**
- Consumes: `bayit_shave.houses`, `bayit_shave.members` from Task 3.
- Produces: tables `bayit_shave.mission_templates`, `bayit_shave.mission_instances`, `bayit_shave.points_ledger`, `bayit_shave.swap_requests`, `bayit_shave.unavailability_requests`, matching the design spec's Data Model section field-for-field, all RLS-enabled with house-isolation SELECT policies. **Out of scope here:** the admin-approval-gate write rules (who can set `status`, `points` vs `proposed_points`, etc.) — those are enforced in the next plan (Missions & Suggestions) via Edge Functions, not raw client UPDATE policies. This task only guarantees house isolation, matching Task 3's pattern.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new mission_and_ledger_tables
```

- [ ] **Step 2: Write the migration**

Edit `supabase/migrations/<timestamp>_mission_and_ledger_tables.sql`:

```sql
create type bayit_shave.mission_category as enum
  ('dishes', 'clean', 'laundry', 'trash', 'shop', 'pets', 'garden', 'bath', 'other');
create type bayit_shave.mission_status as enum
  ('pending_approval', 'open', 'assigned', 'done', 'rejected');
create type bayit_shave.assignment_mode as enum ('auto', 'direct');
create type bayit_shave.request_status as enum ('pending', 'approved', 'rejected');

create table bayit_shave.mission_templates (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references bayit_shave.houses(id) on delete cascade,
  title text not null,
  category bayit_shave.mission_category not null default 'other',
  points integer not null check (points > 0),
  recurrence_rule text not null, -- e.g. "weekly:fri"
  default_assignee uuid references bayit_shave.members(id) on delete set null,
  eligible_members uuid[], -- null = all house members
  last_assigned_to uuid references bayit_shave.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table bayit_shave.mission_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references bayit_shave.mission_templates(id) on delete set null,
  house_id uuid not null references bayit_shave.houses(id) on delete cascade,
  title text not null,
  category bayit_shave.mission_category not null default 'other',
  points integer not null check (points > 0),
  proposed_points integer,
  due_date date not null,
  proposed_due_date date,
  assigned_to uuid references bayit_shave.members(id) on delete set null,
  proposed_assigned_to uuid references bayit_shave.members(id) on delete set null,
  status bayit_shave.mission_status not null default 'open',
  created_by uuid not null references bayit_shave.members(id) on delete cascade,
  assignment_mode bayit_shave.assignment_mode not null default 'auto',
  approved_by uuid references bayit_shave.members(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table bayit_shave.points_ledger (
  house_id uuid not null references bayit_shave.houses(id) on delete cascade,
  member_id uuid not null references bayit_shave.members(id) on delete cascade,
  points_earned integer not null default 0,
  points_target numeric not null default 0,
  debt integer not null default 0,
  primary key (house_id, member_id)
);

create table bayit_shave.swap_requests (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references bayit_shave.houses(id) on delete cascade,
  mission_instance_id uuid not null references bayit_shave.mission_instances(id) on delete cascade,
  from_member uuid not null references bayit_shave.members(id) on delete cascade,
  to_member uuid not null references bayit_shave.members(id) on delete cascade,
  status bayit_shave.request_status not null default 'pending',
  approved_by uuid references bayit_shave.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table bayit_shave.unavailability_requests (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references bayit_shave.houses(id) on delete cascade,
  member_id uuid not null references bayit_shave.members(id) on delete cascade,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  reason text,
  status bayit_shave.request_status not null default 'pending',
  approved_by uuid references bayit_shave.members(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table bayit_shave.mission_templates enable row level security;
alter table bayit_shave.mission_instances enable row level security;
alter table bayit_shave.points_ledger enable row level security;
alter table bayit_shave.swap_requests enable row level security;
alter table bayit_shave.unavailability_requests enable row level security;

create policy "mission_templates select own house" on bayit_shave.mission_templates
  for select to authenticated
  using (house_id in (select m.house_id from bayit_shave.members m where m.user_id = (select auth.uid())));

create policy "mission_instances select own house" on bayit_shave.mission_instances
  for select to authenticated
  using (house_id in (select m.house_id from bayit_shave.members m where m.user_id = (select auth.uid())));

create policy "points_ledger select own house" on bayit_shave.points_ledger
  for select to authenticated
  using (house_id in (select m.house_id from bayit_shave.members m where m.user_id = (select auth.uid())));

create policy "swap_requests select own house" on bayit_shave.swap_requests
  for select to authenticated
  using (house_id in (select m.house_id from bayit_shave.members m where m.user_id = (select auth.uid())));

create policy "unavailability_requests select own house" on bayit_shave.unavailability_requests
  for select to authenticated
  using (house_id in (select m.house_id from bayit_shave.members m where m.user_id = (select auth.uid())));

grant select on bayit_shave.mission_templates to authenticated;
grant select, insert, update, delete on bayit_shave.mission_templates to service_role;
grant select on bayit_shave.mission_instances to authenticated;
grant select, insert, update, delete on bayit_shave.mission_instances to service_role;
grant select on bayit_shave.points_ledger to authenticated;
grant select, insert, update, delete on bayit_shave.points_ledger to service_role;
grant select on bayit_shave.swap_requests to authenticated;
grant select, insert, update, delete on bayit_shave.swap_requests to service_role;
grant select on bayit_shave.unavailability_requests to authenticated;
grant select, insert, update, delete on bayit_shave.unavailability_requests to service_role;
```

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db reset
```

Expected: clean reset, `npx supabase migration list --local` shows both migrations applied in order.

- [ ] **Step 4: Write the RLS test**

`supabase/tests/mission_and_ledger_tables.test.sql`:

```sql
begin;
select plan(2);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'noa@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'itai@example.com');

insert into bayit_shave.houses (id, name, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'House A', 'CODEA2'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'House B', 'CODEB2');

insert into bayit_shave.members (id, house_id, user_id, name, role) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Noa', 'admin'),
  ('c0000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Itai', 'admin');

insert into bayit_shave.mission_instances
  (house_id, title, category, points, due_date, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Wash dishes', 'dishes', 15, current_date, 'c0000000-0000-0000-0000-000000000001', 'open'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Take out trash', 'trash', 10, current_date, 'c0000000-0000-0000-0000-000000000002', 'open');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from bayit_shave.mission_instances),
  1,
  'Noa sees only her own house''s missions'
);

select is(
  (select title from bayit_shave.mission_instances limit 1),
  'Wash dishes',
  'the mission Noa sees belongs to House A'
);

select * from finish();
rollback;
```

- [ ] **Step 5: Run the pgTAP tests**

Run: `npx supabase test db`
Expected: both `houses_and_members.test.sql` (3 tests) and `mission_and_ledger_tables.test.sql` (2 tests) pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add mission, ledger, swap, and unavailability schema with RLS"
```

---

### Task 5: `create-house` and `join-house` Edge Functions

**Files:**
- Create: `supabase/functions/create-house/index.ts`
- Create: `supabase/functions/join-house/index.ts`
- Create: `supabase/tests/functions/onboarding.test.ts`

**Interfaces:**
- Consumes: `bayit_shave.houses`, `bayit_shave.members` from Task 3.
- Produces: two HTTP endpoints. Task 6's `src/features/onboarding/api.ts` calls these directly:
  - `POST /functions/v1/create-house` — body `{ house_name: string, admin_name: string }`, auth: Bearer user JWT. Returns `200 { house, member }` or `4xx/5xx { error: string }`.
  - `POST /functions/v1/join-house` — body `{ invite_code: string, name: string }`, auth: Bearer user JWT. Returns `200 { member }`, `404 { error: 'invalid_invite_code' }`, `409 { error: 'already_a_member' }`, or other `4xx/5xx { error: string }`.

- [ ] **Step 1: Write `join-house`**

`supabase/functions/join-house/index.ts`:

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

  const { invite_code, name } = await req.json();
  if (!invite_code || !name) {
    return new Response(JSON.stringify({ error: 'invite_code_and_name_required' }), { status: 400 });
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
    .select('id')
    .eq('invite_code', invite_code)
    .maybeSingle();

  if (houseError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!house) {
    return new Response(JSON.stringify({ error: 'invalid_invite_code' }), { status: 404 });
  }

  const { data: existing } = await admin
    .from('members')
    .select('id')
    .eq('house_id', house.id)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ error: 'already_a_member' }), { status: 409 });
  }

  const { data: member, error: insertError } = await admin
    .from('members')
    .insert({ house_id: house.id, user_id: userData.user.id, name, role: 'member' })
    .select()
    .single();

  if (insertError) {
    return new Response(JSON.stringify({ error: 'join_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ member }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Write `create-house`**

`supabase/functions/create-house/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (no 0/O, 1/I)
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { house_name, admin_name } = await req.json();
  if (!house_name || !admin_name) {
    return new Response(JSON.stringify({ error: 'house_name_and_admin_name_required' }), { status: 400 });
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

  let house: { id: string; invite_code: string } | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    const invite_code = generateInviteCode();
    const { data, error } = await admin
      .from('houses')
      .insert({ name: house_name, invite_code })
      .select()
      .single();
    if (!error) {
      house = data;
      break;
    }
    if (error.code !== '23505') {
      return new Response(JSON.stringify({ error: 'house_creation_failed' }), { status: 500 });
    }
    // 23505 = unique_violation on invite_code — retry with a fresh code
  }
  if (!house) {
    return new Response(JSON.stringify({ error: 'could_not_generate_unique_code' }), { status: 500 });
  }

  const { data: member, error: memberError } = await admin
    .from('members')
    .insert({ house_id: house.id, user_id: userData.user.id, name: admin_name, role: 'admin' })
    .select()
    .single();

  if (memberError) {
    return new Response(JSON.stringify({ error: 'admin_member_creation_failed' }), { status: 500 });
  }

  await admin.from('houses').update({ admin_id: member.id }).eq('id', house.id);

  return new Response(JSON.stringify({ house, member }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 3: Start the functions server**

In a separate terminal (leave running for the tests):

```bash
npx supabase functions serve
```

- [ ] **Step 4: Write the integration test**

Get the anon key first: `npx supabase status` (copy the `anon key` value).

`supabase/tests/functions/onboarding.test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

async function signUpAndSignIn(email: string): Promise<string> {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const password = 'Test1234!';
  await client.auth.signUp({ email, password });
  const { data } = await client.auth.signInWithPassword({ email, password });
  return data.session!.access_token;
}

Deno.test('join-house: valid invite code adds a member', async () => {
  const adminToken = await signUpAndSignIn(`admin+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Test House', admin_name: 'Noa' }),
  });
  const { house } = await createRes.json();

  const memberToken = await signUpAndSignIn(`member+${crypto.randomUUID()}@example.com`);
  const joinRes = await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: house.invite_code, name: 'Itai' }),
  });
  assertEquals(joinRes.status, 200);
  const { member } = await joinRes.json();
  assertEquals(member.role, 'member');
  assertEquals(member.house_id, house.id);
});

Deno.test('join-house: invalid invite code is rejected', async () => {
  const token = await signUpAndSignIn(`nobody+${crypto.randomUUID()}@example.com`);
  const res = await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: 'NOPE99', name: 'Ghost' }),
  });
  assertEquals(res.status, 404);
});

Deno.test('join-house: joining the same house twice is rejected', async () => {
  const adminToken = await signUpAndSignIn(`admin2+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Dup House', admin_name: 'Dana' }),
  });
  const { house } = await createRes.json();

  const memberToken = await signUpAndSignIn(`member2+${crypto.randomUUID()}@example.com`);
  const headers = { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' };
  const body = JSON.stringify({ invite_code: house.invite_code, name: 'Yoni' });

  await fetch(`${FUNCTIONS_URL}/join-house`, { method: 'POST', headers, body });
  const secondJoin = await fetch(`${FUNCTIONS_URL}/join-house`, { method: 'POST', headers, body });
  assertEquals(secondJoin.status, 409);
});

Deno.test('create-house: admin_id is set on the house after creation', async () => {
  const adminToken = await signUpAndSignIn(`admin3+${crypto.randomUUID()}@example.com`);
  const res = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Admin Check House', admin_name: 'Admin' }),
  });
  const { house, member } = await res.json();
  assertEquals(member.role, 'admin');
  assertEquals(typeof house.invite_code, 'string');
  assertEquals(house.invite_code.length, 6);
});
```

- [ ] **Step 5: Run the tests**

```bash
export SUPABASE_ANON_KEY=<anon key from supabase status>
deno test --allow-net --allow-env supabase/tests/functions/onboarding.test.ts
```

Expected: `4 passed` (0 failed).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add create-house and join-house Edge Functions"
```

---

### Task 6: Client Supabase wiring and onboarding screens

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/features/onboarding/api.ts`
- Create: `src/features/onboarding/__tests__/api.test.ts`
- Create: `src/app/onboarding/create-house.tsx`
- Create: `src/app/onboarding/join-house.tsx`

**Interfaces:**
- Consumes: `resolveInitialLanguage`/i18next resources from Task 2 (via `useTranslation()`); the two Edge Functions from Task 5.
- Produces: `createHouse(houseName: string, adminName: string): Promise<{ house: House; member: Member }>` and `joinHouse(inviteCode: string, name: string): Promise<{ member: Member }>` from `src/features/onboarding/api.ts`, each throwing an `Error` whose `message` is the server's `error` code (e.g. `'invalid_invite_code'`) on non-200 responses. These are the two functions any onboarding UI in this or later plans should call — no other plan should re-implement the Edge Function call.

- [ ] **Step 1: Install the client SDK**

```bash
npx expo install @supabase/supabase-js
```

- [ ] **Step 2: Add environment config**

`.env.example` (create at repo root):

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=replace-with-anon-key-from-supabase-status
```

Copy it to `.env` and fill in real local values (`.env` should already be covered by the Expo default `.gitignore` — confirm before committing).

- [ ] **Step 3: Write the Supabase client**

`src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'bayit_shave' },
});
```

- [ ] **Step 4: Write the failing test for the onboarding API**

`src/features/onboarding/__tests__/api.test.ts`:

```ts
import { createHouse, joinHouse } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
    functions: {
      invoke: jest.fn(),
    },
  },
}));

describe('createHouse', () => {
  it('returns house and member on success', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { house: { id: 'h1', invite_code: 'ABC123' }, member: { id: 'm1', role: 'admin' } },
      error: null,
    });

    const result = await createHouse('My House', 'Noa');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('create-house', {
      body: { house_name: 'My House', admin_name: 'Noa' },
    });
    expect(result.house.id).toBe('h1');
    expect(result.member.role).toBe('admin');
  });

  it('throws with the server error code on failure', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { error: 'house_creation_failed' },
      error: { message: 'Edge Function returned a non-2xx status code' },
    });

    await expect(createHouse('My House', 'Noa')).rejects.toThrow('house_creation_failed');
  });
});

describe('joinHouse', () => {
  it('returns the member on success', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { member: { id: 'm2', role: 'member', house_id: 'h1' } },
      error: null,
    });

    const result = await joinHouse('ABC123', 'Itai');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('join-house', {
      body: { invite_code: 'ABC123', name: 'Itai' },
    });
    expect(result.member.role).toBe('member');
  });

  it('throws "invalid_invite_code" for a bad code', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { error: 'invalid_invite_code' },
      error: { message: 'Edge Function returned a non-2xx status code' },
    });

    await expect(joinHouse('NOPE99', 'Ghost')).rejects.toThrow('invalid_invite_code');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -- src/features/onboarding/__tests__/api.test.ts`
Expected: FAIL with "Cannot find module '../api'"

- [ ] **Step 6: Implement the onboarding API**

`src/features/onboarding/api.ts`:

```ts
import { supabase } from '../../lib/supabase';

export interface House {
  id: string;
  invite_code: string;
}

export interface Member {
  id: string;
  role: 'admin' | 'member';
  house_id?: string;
}

export async function createHouse(
  houseName: string,
  adminName: string
): Promise<{ house: House; member: Member }> {
  const { data, error } = await supabase.functions.invoke('create-house', {
    body: { house_name: houseName, admin_name: adminName },
  });
  if (error) {
    throw new Error(data?.error ?? error.message);
  }
  return data;
}

export async function joinHouse(
  inviteCode: string,
  name: string
): Promise<{ member: Member }> {
  const { data, error } = await supabase.functions.invoke('join-house', {
    body: { invite_code: inviteCode, name },
  });
  if (error) {
    throw new Error(data?.error ?? error.message);
  }
  return data;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- src/features/onboarding/__tests__/api.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 8: Build the onboarding screens**

`src/app/onboarding/create-house.tsx`:

```tsx
import { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { createHouse } from '../../features/onboarding/api';

export default function CreateHouseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [houseName, setHouseName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await createHouse(houseName, adminName);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
      <Text>{t('onboarding.houseNameLabel')}</Text>
      <TextInput value={houseName} onChangeText={setHouseName} testID="house-name-input" />
      <Text>{t('onboarding.yourNameLabel')}</Text>
      <TextInput value={adminName} onChangeText={setAdminName} testID="admin-name-input" />
      {error && <Text testID="create-house-error">{error}</Text>}
      <Button
        title={t('onboarding.submit')}
        onPress={handleSubmit}
        disabled={submitting || !houseName || !adminName}
        testID="create-house-submit"
      />
    </View>
  );
}
```

`src/app/onboarding/join-house.tsx`:

```tsx
import { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { joinHouse } from '../../features/onboarding/api';

export default function JoinHouseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await joinHouse(inviteCode, name);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
      <Text>{t('onboarding.inviteCodeLabel')}</Text>
      <TextInput value={inviteCode} onChangeText={setInviteCode} testID="invite-code-input" />
      <Text>{t('onboarding.yourNameLabel')}</Text>
      <TextInput value={name} onChangeText={setName} testID="join-name-input" />
      {error && <Text testID="join-house-error">{error}</Text>}
      <Button
        title={t('onboarding.submit')}
        onPress={handleSubmit}
        disabled={submitting || !inviteCode || !name}
        testID="join-house-submit"
      />
    </View>
  );
}
```

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS, all tests across Tasks 1, 2, and 6.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: wire Supabase client and add onboarding screens"
```

---

### Task 7: Push the schema to the remote project

**Files:**
- Modify: `supabase/config.toml` (project ref link — this file is safe to commit, it holds no secrets)
- Create: `.env.production.local` (repo root, gitignored — real project URL/keys, never committed)

**Interfaces:**
- Consumes: the two migrations from Tasks 3-4, already verified locally.
- Produces: the same `bayit_shave` schema, live on the real Supabase project (`nqiauqgwpygsibwxiuov`), with Edge Functions deployed and their secrets set. No other task depends on this one — it's the deployment step, done once Tasks 1-6 are all reviewed clean locally.

This task only runs after every other task in this plan is complete and reviewed — it is the one task in this plan that touches real, shared infrastructure (a Supabase project other unrelated apps also live on), so treat every command as non-reversible even where the CLI itself is idempotent.

- [ ] **Step 1: Store the remote credentials locally (never commit this file)**

`.env.production.local` at repo root:

```
SUPABASE_URL=https://nqiauqgwpygsibwxiuov.supabase.co
SUPABASE_ANON_KEY=<the anon/publishable key>
SUPABASE_SERVICE_ROLE_KEY=<the service_role key>
SUPABASE_DB_PASSWORD=<the database password>
```

Confirm it's ignored: `git check-ignore -v .env.production.local` should print a match (it fits the `.env*.local` pattern already in `.gitignore`).

- [ ] **Step 2: Link the local project to the remote one**

```bash
npx supabase link --project-ref nqiauqgwpygsibwxiuov
```

Enter the DB password from Step 1 when prompted. This only writes a project ref into `supabase/config.toml` — no schema changes yet.

- [ ] **Step 3: Push the migrations**

```bash
npx supabase db push
```

Expected: both migrations from Tasks 3-4 apply in order, output confirms `bayit_shave` schema, tables, and policies created. **If this step reports any object already existing in a schema other than `bayit_shave`, stop immediately and escalate** — it means something targeted the wrong schema.

- [ ] **Step 4: Expose the schema to the Data API**

This is a dashboard-only setting, not scriptable via CLI: in the Supabase dashboard for this project, go to Settings → API → Data API, and add `bayit_shave` to the exposed schemas list (alongside whatever other apps' schemas are already there — do not remove any existing entries). Report back once done; this step needs the account owner and can't be automated from here.

- [ ] **Step 5: Deploy the Edge Functions and their secrets**

```bash
npx supabase functions deploy create-house
npx supabase functions deploy join-house
```

Edge Functions on the deployed project automatically receive `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — no manual secret-setting needed for those two.

- [ ] **Step 6: Verify against the real project**

Using the anon key from Step 1, sign up a throwaway test user and call the deployed `create-house` function exactly as Task 5's Deno tests did (see `supabase/tests/functions/onboarding.test.ts` for the request shape), pointed at `https://nqiauqgwpygsibwxiuov.supabase.co/functions/v1` instead of `127.0.0.1`. Confirm a row appears in `bayit_shave.houses` and `bayit_shave.members` (check via the dashboard's Table Editor, filtered to the `bayit_shave` schema).

- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml
git commit -m "chore: link remote Supabase project"
```

(`.env.production.local` is gitignored and won't be included — verify with `git status` before committing that it doesn't appear.)

---

### Task 8: Auth (sign-up/sign-in) + Playwright E2E onboarding tests

**Files:**
- Create: `src/features/auth/api.ts`
- Create: `src/features/auth/__tests__/api.test.ts`
- Modify: `src/i18n/locales/he.json`, `src/i18n/locales/en.json` (add `auth.*` keys)
- Modify: `src/app/index.tsx` (gate the create/join buttons behind a session; show a sign-up/sign-in form when there is none)
- Create: `playwright.config.ts`
- Create: `e2e/onboarding.spec.ts`

**Interfaces:**
- Consumes: `supabase` client from `src/lib/supabase.ts` (Task 6); `createHouse`/`joinHouse` from `src/features/onboarding/api.ts` (Task 6, unchanged); the two onboarding screens and their existing `testID`s (`house-name-input`, `admin-name-input`, `create-house-submit`, `invite-code-input`, `join-name-input`, `join-house-submit`, `join-house-error`) from Task 6.
- Produces: `signUp(email, password)` and `signIn(email, password)` from `src/features/auth/api.ts`, each throwing an `Error` with the Supabase Auth error message on failure. `src/app/index.tsx` gains `testID`s `auth-email-input`, `auth-password-input`, `auth-submit`, `auth-error`, `auth-switch-mode`, and keeps its existing `welcome-create-house`/`welcome-join-house` `testID`s (now only rendered once a session exists).

**Why this task exists:** `create-house` and `join-house` (Task 5) require a real user session — they resolve the caller via `auth.getUser()` on the forwarded `Authorization` header. Task 5's Deno tests call `auth.signUp()`/`signInWithPassword()` internally to get that session, but no equivalent UI was ever built into the app itself, so the onboarding screens built in Task 6 are unreachable end-to-end by an actual user. This task closes that gap and, in the same pass, proves the whole flow works with a real browser via Playwright — written TDD-style: the E2E spec is written and run first (expected to fail, since the auth UI doesn't exist yet), then the auth screen is implemented to make it pass.

Local Supabase auth does not require email confirmation in this project's config (`enable_signup = true`, no confirmation step) — Task 5's Deno tests already proved `signUp` immediately followed by `signInWithPassword` yields a usable session locally.

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Write the Playwright config**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx expo start --web --port 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 3: Write the E2E spec (RED — this will fail, the auth UI doesn't exist yet)**

`e2e/onboarding.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'bayit_shave' } });

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUpThroughUI(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await expect(page.getByTestId('auth-email-input')).toBeVisible();
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-password-input').fill('Test1234!');
  await page.getByTestId('auth-submit').click();
}

test.describe('onboarding', () => {
  test('sign up, then create a house', async ({ page }) => {
    await signUpThroughUI(page, uniqueEmail('create'));

    await expect(page.getByTestId('welcome-create-house')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('welcome-create-house').click();

    await expect(page).toHaveURL(/onboarding\/create-house/);
    await page.getByTestId('house-name-input').fill('Playwright Test House');
    await page.getByTestId('admin-name-input').fill('Playwright Admin');
    await page.getByTestId('create-house-submit').click();

    await expect(page).toHaveURL('http://localhost:8081/');

    const { data: house } = await admin
      .from('houses')
      .select('id, name, invite_code, admin_id')
      .eq('name', 'Playwright Test House')
      .single();
    expect(house).toBeTruthy();
    expect(house!.admin_id).toBeTruthy();
  });

  test('sign up, then join a house with a valid invite code', async ({ page }) => {
    const { data: house } = await admin
      .from('houses')
      .insert({ name: 'Seeded Join House', invite_code: 'PWJOIN' })
      .select()
      .single();

    await signUpThroughUI(page, uniqueEmail('join'));

    await expect(page.getByTestId('welcome-join-house')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('welcome-join-house').click();

    await expect(page).toHaveURL(/onboarding\/join-house/);
    await page.getByTestId('invite-code-input').fill(house!.invite_code);
    await page.getByTestId('join-name-input').fill('Playwright Joiner');
    await page.getByTestId('join-house-submit').click();

    await expect(page).toHaveURL('http://localhost:8081/');

    const { data: member } = await admin
      .from('members')
      .select('role, house_id')
      .eq('house_id', house!.id)
      .eq('name', 'Playwright Joiner')
      .maybeSingle();
    expect(member?.role).toBe('member');
  });

  test('join house: invalid invite code shows an error', async ({ page }) => {
    await signUpThroughUI(page, uniqueEmail('badcode'));

    await expect(page.getByTestId('welcome-join-house')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('welcome-join-house').click();

    await page.getByTestId('invite-code-input').fill('NOPE99');
    await page.getByTestId('join-name-input').fill('Nobody');
    await page.getByTestId('join-house-submit').click();

    await expect(page.getByTestId('join-house-error')).toBeVisible();
  });
});
```

- [ ] **Step 4: Run the E2E suite to confirm RED**

Ensure the local stack is up (`npx supabase status`; start it if not) and `npx supabase functions serve` is running in the background. Then:

```bash
npx playwright test
```

Expected: FAIL — the first test times out waiting for `auth-email-input`, because `src/app/index.tsx` doesn't render any auth form yet. This confirms the E2E spec actually exercises the missing feature rather than trivially passing.

- [ ] **Step 5: Write the failing Jest test for the auth API module**

`src/features/auth/__tests__/api.test.ts`:

```ts
import { signUp, signIn } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: { auth: { signUp: jest.fn(), signInWithPassword: jest.fn() } },
}));

describe('signUp', () => {
  it('returns the session data on success', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 'tok' } },
      error: null,
    });
    const result = await signUp('a@example.com', 'Test1234!');
    expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: 'a@example.com', password: 'Test1234!' });
    expect(result.session?.access_token).toBe('tok');
  });

  it('throws the Supabase error message on failure', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Password should be at least 6 characters' },
    });
    await expect(signUp('a@example.com', '123')).rejects.toThrow('Password should be at least 6 characters');
  });
});

describe('signIn', () => {
  it('returns the session data on success', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 'tok2' } },
      error: null,
    });
    const result = await signIn('a@example.com', 'Test1234!');
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@example.com', password: 'Test1234!' });
    expect(result.session?.access_token).toBe('tok2');
  });

  it('throws the Supabase error message on failure', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });
    await expect(signIn('a@example.com', 'wrong')).rejects.toThrow('Invalid login credentials');
  });
});
```

Run: `npm test -- src/features/auth/__tests__/api.test.ts`
Expected: FAIL with "Cannot find module '../api'"

- [ ] **Step 6: Implement the auth API module**

`src/features/auth/api.ts`:

```ts
import { supabase } from '../../lib/supabase';

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}
```

Run: `npm test -- src/features/auth/__tests__/api.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Add the `auth.*` translation keys**

Add to `src/i18n/locales/he.json` (inside the top-level object, alongside the existing `onboarding` key):

```json
"auth": {
  "emailLabel": "אימייל",
  "passwordLabel": "סיסמה",
  "signUp": "הרשמה",
  "signIn": "התחברות",
  "switchToSignIn": "כבר יש לך חשבון? התחבר/י",
  "switchToSignUp": "אין לך חשבון? הירשם/י"
}
```

Add to `src/i18n/locales/en.json`:

```json
"auth": {
  "emailLabel": "Email",
  "passwordLabel": "Password",
  "signUp": "Sign up",
  "signIn": "Sign in",
  "switchToSignIn": "Already have an account? Sign in",
  "switchToSignUp": "Don't have an account? Sign up"
}
```

- [ ] **Step 8: Gate the welcome screen behind a session**

Replace `src/app/index.tsx` entirely with:

```tsx
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { signUp, signIn } from '../features/auth/api';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'signUp' | 'signIn'>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleAuthSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signUp') {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  if (hasSession === null) {
    return <View style={{ flex: 1 }} />;
  }

  if (!hasSession) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: '800' }}>{t('onboarding.appName')}</Text>
        <Text style={{ textAlign: 'center', opacity: 0.7 }}>{t('onboarding.tagline')}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailLabel')}
          testID="auth-email-input"
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ width: '100%', borderWidth: 1, borderRadius: 12, padding: 12 }}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.passwordLabel')}
          testID="auth-password-input"
          secureTextEntry
          style={{ width: '100%', borderWidth: 1, borderRadius: 12, padding: 12 }}
        />
        {error && <Text testID="auth-error">{error}</Text>}
        <Pressable
          onPress={handleAuthSubmit}
          disabled={submitting || !email || !password}
          testID="auth-submit"
          style={{ backgroundColor: '#26332E', borderRadius: 14, padding: 14, alignItems: 'center', width: '100%' }}
        >
          <Text style={{ color: '#F6F1E4', fontWeight: '700' }}>
            {t(mode === 'signUp' ? 'auth.signUp' : 'auth.signIn')}
          </Text>
        </Pressable>
        <Pressable onPress={() => setMode(mode === 'signUp' ? 'signIn' : 'signUp')} testID="auth-switch-mode">
          <Text style={{ opacity: 0.6 }}>{t(mode === 'signUp' ? 'auth.switchToSignIn' : 'auth.switchToSignUp')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: '800' }}>{t('onboarding.appName')}</Text>
      <Text style={{ textAlign: 'center', opacity: 0.7 }}>{t('onboarding.tagline')}</Text>
      <View style={{ width: '100%', gap: 12, marginTop: 16 }}>
        <Pressable
          onPress={() => router.push('/onboarding/create-house')}
          testID="welcome-create-house"
          style={{ backgroundColor: '#26332E', borderRadius: 14, padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#F6F1E4', fontWeight: '700' }}>{t('onboarding.createHouse')}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/onboarding/join-house')}
          testID="welcome-join-house"
          style={{ borderWidth: 1.5, borderColor: '#26332E', borderRadius: 14, padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#26332E', fontWeight: '700' }}>{t('onboarding.joinHouse')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 9: Run the E2E suite again to confirm GREEN**

```bash
npx playwright test
```

Expected: PASS, 3/3 tests. If `webServer` fails to boot Expo web, run `npx expo start --web --port 8081` manually in a separate terminal first and re-run `npx playwright test` against the already-running server (`reuseExistingServer` will pick it up).

- [ ] **Step 10: Run the full Jest suite once more**

```bash
npm test
```

Expected: PASS, all suites (should now include the 4 new auth tests alongside the existing ones).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add email/password auth gating onboarding, add Playwright E2E suite"
```

---

## End-to-End Manual Verification

This covers Tasks 1-6 against the **local** Supabase stack. Task 7's own Step 6 covers remote verification separately.

After all six tasks:

1. `npx supabase start` (if not already running), `npx supabase functions serve` in a separate terminal, `npx expo start` in a third.
2. Open the app — confirm it renders right-to-left with Hebrew copy (device/simulator locale not set to English).
3. Navigate to the `/onboarding/create-house` route, submit a house name and your name — confirm no error and navigation away from the screen.
4. Check `npx supabase status` → open Studio URL → confirm a new row exists in `houses` and `members` with `role = 'admin'`, and `houses.admin_id` is set.
5. On a second simulator/device (or after signing out), navigate to the `/onboarding/join-house` route, enter the invite code from Studio — confirm a second `members` row is created with `role = 'member'` in the same house.

# Missing Spec Features — Implementation Plan

**Date:** 2026-08-06
**Status:** Task 1 implemented; Tasks 2–6 planned, not yet started

## Why this plan exists

A review of the shipped app against `docs/superpowers/specs/2026-07-17-house-chores-app-design.md`
found that the database schema and Edge Functions cover the spec almost
completely, but several spec'd capabilities have **no client surface at all**,
and three are absent end to end. The visual design pass is fully delivered and
is out of scope here — this plan is purely about closing functional gaps.

Confirmed present and working, for the avoidance of re-work: all 9 category
icons, microanimations on every pressable, the 5 suggestion types, the balance
engine with all 3 strategies, swap with 7-day expiry, unavailability, calendar
month grid with category dots, Hebrew/RTL.

## Gap inventory

| # | Gap | Schema | Edge Fn | Client |
|---|-----|--------|---------|--------|
| 1 | House settings (`assignment_strategy`, `balance_period`, `balance_day`) + member `weight` | yes | no | no |
| 2 | Recurring missions (`mission_templates`, `recurrence_rule`, `last_assigned_to`) | yes | no | no |
| 3 | `eligible_members` subset rotation | yes | partial | no |
| 4 | Reassignment suggestions (`proposed_assigned_to`) | yes | no | no |
| 5 | Push notifications (due-date + overdue escalation) | n/a | no | no |
| 6 | Device calendar sync (`expo-calendar`) | n/a | n/a | no |
| 7 | Offline "done" queue | n/a | n/a | no |

## Critical constraint discovered

`bayit_shave.houses` has **only** a `select` policy for members — there is no
`update` policy, and `authenticated` is granted `select` only. `members` has
`members update self` (`user_id = auth.uid()`), so a member can edit their own
row but an admin **cannot** edit another member's `weight`.

Therefore every admin-settings write must go through an Edge Function running
with the service role, which also gives one place to enforce "caller is this
house's admin". This matches the pattern every existing mutation already uses.
Do **not** solve this by loosening RLS.

---

### Task 1: Admin house settings + member weights — IMPLEMENTED

**Files:**
- Create: `supabase/functions/update-house-settings/index.ts`
- Create: `src/features/settings/api.ts`
- Create: `src/app/settings.tsx`
- Modify: `src/app/today.tsx` (admin-only nav link)
- Modify: `src/i18n/locales/{he,en}.json`
- Test: `src/features/settings/__tests__/api.test.ts`

**Behaviour:** admin-only screen to set `assignment_strategy`
(`points_based` | `round_robin` | `manual`), `balance_period`
(`weekly` | `monthly`), `balance_day` (0–6), and each member's `weight`.
Non-admins are routed away. The Edge Function rejects a non-admin caller with
403 regardless of what the client does.

**Weight semantics (from the spec, do not change):** a `weight` edit affects
only *future* `points_target` increments. It must never retroactively
rebalance past targets, so the function only writes `members.weight` and never
touches `points_ledger`.

---

### Task 2: Recurring missions from templates

**Files:**
- Create: `supabase/functions/generate-recurring-missions/index.ts`
- Create: `src/app/missions/templates.tsx`, `src/features/templates/api.ts`
- Modify: `run-balance` to call generation before assigning

`mission_templates` already carries `recurrence_rule`, `default_assignee`,
`eligible_members` and `last_assigned_to`, and nothing reads them. Generation
must be **idempotent** per (template, due_date) — the spec requires the balance
run be safe to re-trigger, so instantiating a template twice for the same date
must be impossible. Add a unique index on `(template_id, due_date)` before
writing the function; without it a retry silently duplicates chores.

Recurrence scope for v1: weekly-on-weekday and monthly-on-day-of-month only.
Do not pull in a full RRULE parser.

### Task 3: `eligible_members` subset rotation

`run-balance` currently pools all members. Restrict a template's candidates to
`eligible_members` when non-null, for both `points_based` and `round_robin`.
Extend the existing Deno tests: a member outside the subset must never receive
that template's instance even when they are furthest below target — that is the
assertion that actually pins this behaviour.

### Task 4: Reassignment suggestions (`proposed_assigned_to`)

The column and the spec's "schedule edit" both exist; only reassignment is
unwired. Extend `edit-mission-schedule` to accept `proposed_assigned_to`, and
`resolve-suggestion` to copy it onto `assigned_to` on approve and clear it on
reject — the same untouched-`status` pattern the other proposals use. Surface
it in the calendar day-detail sheet, which is where the spec puts it.

### Task 5: Push notifications

`expo-notifications` is not installed. Needs: dependency, `app.json` plugin
config, a permission request during onboarding, Expo push tokens stored per
member, and a scheduled Edge Function that pushes on the morning a mission is
due then escalates while it stays incomplete. This is the largest task here
and carries real native-config risk — give it its own branch and verify on a
device build, not the emulator.

### Task 6: Device calendar sync

`expo-calendar` is not installed. Write each member's assigned missions to the
device calendar, keyed so re-sync updates rather than duplicates. Requires
runtime calendar permission and a stable external id per mission instance.

### Task 7: Offline "done" queue

The spec explicitly flags this as real work rather than something Supabase
provides. Persist unsent completions (AsyncStorage is now available), retry on
reconnect, and make `complete-mission` idempotent per mission instance so a
replayed completion cannot double-credit the ledger. The idempotency guarantee
is the hard part and should be built before the client queue, not after.

## Sequencing

1 → 4 → 2 → 3 are ordered by value-per-risk and share the settings/suggestion
surfaces. 5, 6 and 7 each add a native or durability concern and should not be
bundled with the others.

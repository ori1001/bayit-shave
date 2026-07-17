# House Chores App — Design Spec

**Date:** 2026-07-17
**Status:** Approved by user, pre-implementation

## Problem

The house currently divides chores ("missions") randomly. There's no way to account for how hard a chore is, no fixed schedule so people know what's expected of them and when, and no record of who's done what over time. The goal is an app that assigns missions fairly (accounting for difficulty), gives everyone a clear personal schedule, and lets the house self-manage additions and swaps without losing fairness.

## Scope

Mobile app (iOS + Android) for a small household (2–5 people). Single house per app instance for v1 — no multi-house switching, no cross-house features.

Two areas below read as one-liners but carry real implementation weight and should be sized as such in the plan: full Hebrew/RTL + English/LTR support across every screen (not a late-stage pass), and the `points_based` balance algorithm (weights + eligibility subsets + debt + tie-breaking, with concurrency-safe ledger updates).

## Architecture

- **Client:** React Native via Expo. Single codebase for iOS and Android.
- **Localization:** Hebrew-first (default locale, RTL layout via `I18nManager`), English as secondary supported language (LTR). `i18next` + `react-i18next` for strings, `expo-localization` for device-locale detection. All UI copy sourced from translation files from day one — no hardcoded strings — so adding further languages later is just a new locale file.
- **Backend:** Supabase — Postgres database, Supabase Auth, Row Level Security scoped per house so one house's data is never visible to another. Joining a house by `invite_code` happens *before* the new user has house membership, so it can't go through a normal RLS-gated read — it's handled by a dedicated Edge Function running with the service role: it looks up the house by code and creates the `Member` row in one server-side step, rather than exposing any RLS policy that lets unauthenticated/unaffiliated users query house data directly.
- **Business logic:** Supabase Edge Functions handle the periodic balancing run and swap-approval side effects (points transfer). The balance run takes a Postgres advisory lock on the house for its duration (so two overlapping runs for the same house can't race) and updates `PointsLedger` rows inside a single transaction with `SELECT ... FOR UPDATE`, so concurrent mission-completion writes can't be lost mid-run.
- **Notifications:** Expo Notifications (wraps APNs/FCM) for due-date and overdue push alerts.
- **Calendar sync:** `expo-calendar` writes each member's missions into their device's native calendar (Google/Apple). No server-side calendar integration required — keeps this self-contained.

## Data Model

- **House** — `id`, `name`, `invite_code`, `admin_id`, `balance_period` (`weekly` | `monthly`, house-configurable), `balance_day` (e.g. Friday), `assignment_strategy` (`round_robin` | `points_based` | `manual`, admin-selectable, changeable anytime)
- **Member** — `id`, `house_id`, `name`, `role` (`admin` | `member`), `weight` (default `1.0`, admin-adjustable — controls their share of `points_target`; e.g. a parent set to `0.5` targets half the points of a `1.0` member)
- **MissionTemplate** — `id`, `house_id`, `title`, `category` (`dishes` | `clean` | `laundry` | `trash` | `shop` | `pets` | `garden` | `bath` | `other` — each a fixed icon+color pair in the client, used consistently across the home list, calendar, and suggestions inbox), `points`, `recurrence_rule` (e.g. weekly on Friday), `default_assignee` (nullable), `eligible_members` (nullable list of member ids — restricts this mission's rotation/pool to a subset of the house; null means all members), `last_assigned_to` (nullable — rotation memory for round-robin) — the recurring-chore definitions the house sets up once
- **MissionInstance** — `id`, `template_id` (nullable — null for one-off missions), `house_id`, `title`, `category` (same enum as `MissionTemplate`; one-off missions set it directly since they have no template), `points`, `proposed_points` (nullable — a non-admin's pending points-edit suggestion; the live `points` value is untouched until the admin resolves it), `due_date`, `proposed_due_date` (nullable — a non-admin's pending reschedule suggestion), `assigned_to`, `proposed_assigned_to` (nullable — a non-admin's pending reassignment suggestion), `status` (`pending_approval` | `open` | `assigned` | `done` | `rejected`), `created_by`, `assignment_mode` (`auto` | `direct`), `approved_by`, `approved_at`. A **new** non-admin-created mission uses `status: pending_approval` (it doesn't exist in anyone's schedule yet, so there's nothing to conflict with). A points-edit, reschedule, or reassignment suggestion on an *existing* mission never touches `status` — it only sets the matching `proposed_*` field, so an already-`assigned` mission stays assigned and visible while the edit awaits approval. Approving copies the `proposed_*` value onto its live field and clears it; rejecting just clears it.
- **PointsLedger** — `house_id`, `member_id`, `points_earned` (lifetime running total, incremented when a mission is marked done), `points_target` (lifetime running target, incremented every balance run by `weight / Σ(weights of eligible members that run) × that run's pool points` — a `weight` change only affects future increments, never retroactively rebalances past target), `debt` (points owed from approved unavailability; summed with `points_target` only at query/comparison time, never merged into the stored `points_target` value) — rolling, never hard-resets, so fairness self-corrects across periods regardless of period length
- **SwapRequest** — `id`, `house_id`, `mission_instance_id`, `from_member`, `to_member`, `status` (`pending` | `approved` | `rejected`), `approved_by`. "Points transfer" on approval means: `assigned_to` moves to `to_member`, and the mission's points accrue to `to_member`'s `points_earned`/`points_target` going forward — it's a reassignment of future ledger accrual, not a retroactive rewrite of past ledger history.
- **Unavailability** — `id`, `house_id`, `member_id`, `period_start`, `period_end`, `reason` (optional text), `status` (`pending_approval` | `approved` | `rejected`), `approved_by` — a member requests time off from the rotation (trip, etc); admin approves; their skipped share becomes `debt` on their `PointsLedger` row, cleared by taking on extra missions in later periods

## Core Features

### Mission creation
Any member can create a mission: title, points (self-set or picked from a template's suggested value), due date. The creator chooses either:
- **Pool** — thrown into the shared pool for auto-balancing, or
- **Direct assign** — targeted at a specific person, skipping the balance pool.

Both recurring (from `MissionTemplate`) and one-off missions are supported.

### Suggestions (admin approval gate)
Every proposal a non-admin member makes is a **suggestion**: it carries all the relevant info for that action (mission title/category/points/due-date/assignment mode for a new mission, the old and proposed value for an edit, the date range and reason for unavailability, the two members for a swap) and lands in a single, shared **suggestions inbox** the admin reviews. Five suggestion types in v1:
1. **New mission** — `pending_approval`; admin approves (mission proceeds per its chosen pool/direct mode) or rejects.
2. **Points edit** — a non-admin editing a mission's points sets `proposed_points` on the instance (its `status` and current assignment are untouched); the live `points` value holds until the admin approves the new one.
3. **Schedule edit** — a non-admin dragging/editing their own mission's day or reassigning it from the calendar sets `proposed_due_date` and/or `proposed_assigned_to`; same untouched-`status` pattern as a points edit. A member can only propose this on missions currently assigned to them.
4. **Swap request** — see below.
5. **Unavailability request** — see below.

The inbox shows each pending suggestion with its full proposed detail and who proposed it, so the admin never has to chase context elsewhere — approve or reject in one tap. Admin-created or admin-edited items apply instantly, bypassing the inbox — no self-approval loop.

### Balance run
At the start of each period (weekly on the house's configured `balance_day`, or monthly — house-configurable), an Edge Function assigns all pool missions per the house's `assignment_strategy`:
- **`points_based`** — assign to whoever is furthest below their `points_target` (each member's target is their `weight` share of total pool points, plus any `debt`). Handles both per-mission difficulty variance and per-member weight directly. Ties broken by round-robin (see below).
- **`round_robin`** — each `MissionTemplate` rotates strictly to the next eligible member after `last_assigned_to`, regardless of current point balance or weight. Points still accrue on the ledger for visibility, but don't drive assignment. Houses that want weighted members to genuinely do less should use `points_based` instead — round-robin treats everyone equally by design.
- **`manual`** — no auto-assignment; admin assigns every instance by hand.

Default `weight` for every member is `1.0` (equal split); the admin can change an individual member's weight anytime (e.g. lower for a parent, or a member with reduced availability).

Only a template's `eligible_members` (if set) participate in its rotation/pool — this is how a mission can be split among a marked subset of the house rather than everyone. A member with an approved `Unavailability` covering the period is excluded from that period's assignment entirely; their share becomes `debt`, carried forward until cleared by extra missions later.

The run is idempotent — safe to re-trigger if it fails partway, since it checks already-assigned instances before reassigning. Admin can manually reassign anything afterward regardless of strategy.

### Unavailability
A member requests time off from the rotation for a date range (e.g. a trip), optionally with a reason. Enters `pending_approval`; admin approves or rejects. Once approved, they're excluded from balance runs covering that range, and their skipped point share is added as `debt` to their ledger, to be cleared by taking extra missions in a later period.

### Points pool visibility
All members can view the house's aggregated points pool: total points in play, each member's earned/target/debt, and how balanced (or not) the house currently is. Updates immediately whenever a mission is completed, so imbalance is visible to everyone in real time, not just the admin.

### Calendar & schedule view
A month-grid calendar, one colored dot per mission per day (dot color = its `category`). A **"mine / everyone"** toggle filters whose missions show — off by default to "everyone" so the house's full schedule is visible at a glance, switchable to just the signed-in member's own missions. Tapping a day opens a detail sheet listing that day's missions (icon, title, points, category, assignee).

From the day-detail sheet:
- **Admin** can edit any mission directly (title, category, points, due date, assignee) — applies instantly, same as any other admin edit.
- **Member** can edit a mission currently assigned to them — this submits a **schedule edit** suggestion (see above) rather than applying directly; missions assigned to others are view-only for them.

Synced to the device's native calendar via `expo-calendar` in addition to the in-app view.

### Completion
Self-check only — tap "done," no proof or confirmation required. Updates the points ledger immediately.

### Swap
Member A requests a swap to member B; B accepts; admin approves; points transfer and both instances update accordingly. A swap request not approved within 7 days auto-expires and reverts to the original assignee.

### Notifications
Push notification the morning a mission is due. If not marked done by end of day, it's flagged overdue and escalates (repeat push, badge) until completed.

### Onboarding
Creator sets up the house and becomes admin, gets an invite code, shares it with housemates, who join via the code as members.

## Error Handling

- Row Level Security enforces house data isolation at the database level — no app-layer trust required.
- The suggestions inbox prevents unreviewed point values from entering the ledger.
- The balance run is idempotent, safe to re-run after partial failure.
- Offline "done" taps queue locally and sync on reconnect. This is custom-built (a small local mutation queue with retry-on-reconnect), not something Supabase provides out of the box — budget it as real implementation work, not a given.
- Unapproved swap requests auto-expire after 7 days, reverting to the original assignee.
- Debt from approved unavailability never expires on its own — it stays on the ledger until cleared by extra missions, so it can't be silently dropped by a period reset (there is no hard reset; the ledger is rolling).

## Testing

- Balancing logic in the Edge Function is unit-tested standalone for all three strategies: given a point total, member list (with weights), eligibility subsets, and outstanding debt, assert `points_based` distribution stays within a weighted fairness tolerance, and `round_robin` rotation order is correct regardless of weight.
- RLS policies tested via Supabase local dev to confirm one house's data never leaks into another's queries.
- Manual QA pass on the suggestions inbox (all five types), swap, unavailability, and calendar day-detail edit/suggest flows specifically before shipping — these are the most complex state machines in the app.
- RTL layout QA pass (Hebrew default) across all screens, plus a spot-check in English/LTR to confirm the toggle doesn't break layout.

## Explicitly Out of Scope (v1)

- Multi-house support / switching between houses
- Photo proof or peer confirmation of completed missions
- Server-side calendar integration (relies on device calendar instead)
- Chat integration (e.g. WhatsApp/Telegram bridging)

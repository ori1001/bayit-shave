# 003 — Onboarding

**Status:** implemented
**Date:** 2026-08-17
**Branch:** `fix/app-load-hang`
**Approved by:** user — five screens, plain copy, illustrative point values

## Why

The app opened directly on a sign-up form. Nothing had explained what points
are, why chores carry different weights, or what a "house" is, so the first
decision anyone made was handing over an email for something unexplained.

## The flow

Five screens, then sign-up.

| # | Title | Idea | Motion |
| --- | --- | --- | --- |
| 1 | One home, shared fairly | The premise | Two houses arrive from opposite edges and settle |
| 2 | Not every chore is equal | Why points exist | Category icons drop in, staggered |
| 3 | It evens out | The payoff | Uneven bars animate until level |
| 4 | Life happens | Swap, time off, suggest | Three cards fan out |
| 5 | Let's set up your house | The destination | Logo settles, buttons rise last |

Screen 4 was flagged as the most cuttable; the user chose to keep all five.

## Design decisions

### Shown once, stored locally

The flag lives in AsyncStorage, not on the member row. The intro explains the
app rather than the account, and it must be answerable *before* anyone has
signed in — a server-side flag could not be read at that point.

**Unreadable storage defaults to "seen."** A storage fault must never trap a
returning user in onboarding on every launch; showing it one time too few is
better than showing it forever.

A reinstall shows it again. Acceptable for five skippable screens.

### Skip everywhere except the end

Screens 1–4 carry Skip, which jumps to the sign-up. Screen 5 has none — it is
the destination, and offering to skip past sign-up would be meaningless.

### Direction is derived from the language, not I18nManager alone

The first Hebrew capture showed the "next" chevron pointing **right** — which in
RTL reads as "back". `I18nManager.isRTL` is not reliable on its own: on native
`forceRTL` only takes effect after a reload, so it lags the active language, and
on web it may never be set even while text renders right-to-left.

`src/i18n/direction.ts` accepts either signal — `I18nManager.isRTL` *or* an
active Hebrew locale — and all directional icons resolve through it.

The horizontal pager itself needs no mirroring: `ScrollView` measures its offset
from the start edge in both directions.

### Reduced motion

`AccessibilityInfo.isReduceMotionEnabled()` is read once; when set, illustrations
render in their final state immediately. Content is never withheld behind an
animation — the animation is the enhancement, not the delivery.

### Animations run per page, not on mount

Each illustration takes `active` and animates only while its page is showing.
Otherwise the motion would play off-screen and be finished by the time it was
reached.

## Implementation

| File | Purpose |
| --- | --- |
| `src/app/onboarding/intro.tsx` | The pager, dots, skip and primary action |
| `src/components/onboarding/Illustrations.tsx` | Five animated illustrations |
| `src/features/onboarding/intro.ts` | The seen-flag, fail-safe on read errors |
| `src/i18n/direction.ts` | RTL detection used by all directional icons |
| `src/app/index.tsx` | Routes a first launch into the intro |

## Verification

- 98/98 Jest, including the storage-fault path
- `e2e/onboarding-visual.spec.ts` walks all five pages in **both** languages and
  asserts the final page swaps Next for Get started and drops Skip
- Hebrew captures confirmed right-aligned copy and a correctly-pointing chevron

## Follow-ups

Screen 5 currently routes to the existing welcome screen for sign-up rather than
embedding the buttons inline. Merging the two is worthwhile but touches the auth
screen, so it is deliberately separate.

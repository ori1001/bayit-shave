# 001 — Haptics and the completion sequence

**Status:** implemented
**Date:** 2026-08-17
**Branch:** `fix/app-load-hang`

## Why

Completing a chore is the app's central action and the moment it should feel
best. Today it is silent: the row updates and the list reloads. Nothing
acknowledges the tap.

Touch feedback does as much work as animation on a phone, and the app had none —
`expo-haptics` was never installed. This is the one item in the design system
that needs a native module, so it also forces a dev-client rebuild.

## Scope

- A haptics wrapper that degrades safely where haptics do not exist
- Haptic feedback on the six moments that warrant it
- A visible completion sequence when a chore is marked done
- Points that tween rather than jump when a total changes

Out of scope: sheets, onboarding, pickers. Tracked separately.

## Design decisions

### Haptics must never throw

Haptics are unavailable on web, on most emulators, and on devices where the user
has disabled system haptics. A failed haptic must never interrupt an action that
otherwise succeeded, so every call is wrapped and swallowed. The wrapper is
fire-and-forget: callers do not await it and cannot fail because of it.

### Mapping

| Moment | Haptic | Reasoning |
| --- | --- | --- |
| Any button press | `Light` impact | Confirms the touch registered |
| Chore completed | `Success` notification | The moment worth celebrating |
| Approve / reject | `Medium` impact | A decision with consequences |
| Balance run finishes | `Success` notification | Long action, deserves an end signal |
| Error surfaced | `Error` notification | Distinct from success by feel alone |
| Onboarding page change | `Selection` | Light, repeated, must not fatigue |

`Light` is used for ordinary presses deliberately — `Medium` on every tap
becomes noise within a minute of use.

### The completion sequence

Tapping a chore runs, in order:

1. `Success` haptic — immediate, before any network call
2. Row state flips to `done`: check fills, title strikes through, row dims
3. Points pop (scale 1.12 → 1.0 spring)
4. Row collapses out of the list

The haptic fires **first**, before the server round-trip. The completion is
already queued locally if offline (spec 000 / the offline queue), so the tap has
genuinely been recorded by the time the user feels it. Waiting for the network
would make the app feel slow on exactly the action that should feel fastest.

### Reduced motion

All animation respects `prefers-reduced-motion`; animations become instant state
changes rather than being removed, so the feedback still exists. Haptics are
unaffected — they are an accessibility aid, not a motion effect.

## Implementation

| File | Purpose |
| --- | --- |
| `src/lib/haptics.ts` | Wrapper — `tap`, `success`, `warn`, `error`, `select` |
| `src/components/AnimatedPressable.tsx` | Fires `tap()` on press-in for every pressable in the app |
| `src/components/CountUp.tsx` | Tweens a number instead of cutting to it |
| `src/app/today.tsx` | Completion sequence |

Putting the press haptic inside `AnimatedPressable` means every button in the
app gains it at once, with no per-call-site changes and no chance of a button
being missed.

## Verification

- Unit tests cover: web returns without calling the native module, a throwing
  native module is swallowed, and each moment maps to the right haptic style
- `npm run test:native` on the emulator (haptics themselves are not observable
  there — the assertion is that the app does not crash without them)
- Real haptics require a physical device

## Notes

Emulators generally have no haptic hardware, so the emulator can only prove the
absence of a crash. Confirming the feel needs a phone.

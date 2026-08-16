# 005 — Copy pass: machine strings out of the UI

**Status:** implemented
**Date:** 2026-08-17
**Branch:** `fix/app-load-hang`

## Why

Several storage details were being rendered straight onto the screen. They are
correct data and unreadable copy.

| Shown | Where | Should read |
| --- | --- | --- |
| `weekly:fri` | Recurring chores list | Every Friday |
| `monthly:15` | Recurring chores list | Monthly on day 15 |
| `2026-08` | Calendar header | August 2026 *(done in an earlier change)* |
| Day index 0–6 | Settings, template form | Sun … Sat |
| `(YYYY-MM-DD)` | Four date labels | *(removed with spec 004)* |

## Design decisions

### Weekday names come from the platform, not a translation table

There was a hand-maintained `settings.day_0` … `day_6` in both locale files.
That is fourteen strings to keep correct, in a language I do not read, for
information the platform already knows.

`toLocaleDateString(locale, { weekday })` gives the correct name in either
language for free, so the fourteen strings are **deleted**. Fewer strings to
drift, and it works for any future locale without new translations.

### An unknown rule shows itself rather than disappearing

`describeRecurrence` falls back to the raw rule when it cannot interpret it.
Showing `every-other-tuesday` looks odd, but hiding it or throwing loses
information the user needs to understand their own schedule. Odd is
recoverable; missing is not.

### Only two interpolated strings remain

"Every {{day}}" and "Monthly on day {{day}}" still need translating, because
sentence structure differs between English and Hebrew. The *day name* inside
them does not.

## Implementation

| File | Purpose |
| --- | --- |
| `src/lib/recurrence.ts` | `describeRecurrence`, `weekdayName` |
| `src/app/missions/templates.tsx` | Rule shown as a sentence; weekday chips named |
| `src/app/settings.tsx` | Balance-day chips named |
| `src/i18n/locales/*.json` | 2 keys added, 14 deleted |

## Verification

- 7 unit tests: weekly and monthly phrasing, case-insensitivity matching the
  generator, unknown-rule fallback, and that switching to Hebrew changes the
  rendered weekday
- tsc 0 errors, 114/114 jest

## Not changed

Mission `status` values (`open`, `assigned`, `done`) never surface as raw text —
they are already rendered as icons and colour by `MissionRow`, so there is
nothing to translate.

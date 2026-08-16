# 004 — Date pickers

**Status:** implemented
**Date:** 2026-08-17
**Branch:** `fix/app-load-hang`

## Why

Four fields still ask people to type `YYYY-MM-DD` on a phone keyboard:

| Field | Screen |
| --- | --- |
| `mission-due-date-input` | Suggest a mission |
| `calendar-date-input-{id}` | Calendar reschedule |
| `unavailability-start-input` | Request time off |
| `unavailability-end-input` | Request time off |

Typing a date by hand is the roughest remaining edge. It is slow, it invites
typos that only surface as a server error, and it demands the user know the
exact format.

## Design decisions

### A JavaScript picker, not a native one

`@react-native-community/datetimepicker` would mean another native module and
another ~45 minute dev-client rebuild, and it renders differently per platform —
meaning the web build would need a second implementation anyway.

A JS calendar grid: works identically on native and web, hot-reloads in seconds,
is drivable by all three test suites, and reuses the month-grid pattern the
calendar screen already proves.

### Never emit an invalid date

The field's value is only ever produced by selecting a day, so an out-of-range
or malformed date cannot be entered at all. This removes a whole class of server
errors rather than validating after the fact.

### Localised, and correct in Hebrew

Month and weekday names come from `toLocaleDateString` with the active language,
so the picker reads naturally in both. The weekday header follows the same order
as the grid, and the grid itself is laid out in logical order so RTL mirrors it
without a second implementation.

### Range picking is one grid, two taps

Time off needs a start and an end. Rather than two separate pickers, one grid
takes the first tap as the start and the second as the end, highlighting the
span between. A second tap earlier than the first restarts the selection — that
is the intent, not an error to reject.

## Implementation

| File | Purpose |
| --- | --- |
| `src/components/DatePicker.tsx` | Month grid, `DateField`, `DateRangeField` |
| `src/app/missions/suggest.tsx` | Due date |
| `src/app/calendar.tsx` | Reschedule |
| `src/app/unavailability/suggest.tsx` | Range |

Existing `testID`s are preserved on the trigger, so the suites that drive those
fields keep working; a new `-grid` testID exposes the picker itself.

## A copy bug this change created

With the picker in place the labels still read "(YYYY-MM-DD)" -- an instruction
for a field nobody can type into any more, which is worse than before the
change. The Hebrew capture is what surfaced it.

All four labels are rewritten in both languages, and the range field now carries
one label ("Dates away" / "תאריכי היעדרות") rather than a separate From and To,
since one grid now supplies both ends.

## Verification

- 9 unit tests on the date maths: local-not-UTC formatting, impossible dates
  rejected rather than rolled forward, leap years, range ordering, month steps
  across a year boundary
- `e2e/datepicker-visual.spec.ts` opens the picker and completes a range in both
  languages
- tsc 0 errors, 107/107 jest

Hebrew renders the month as "אוגוסט 2026" with Hebrew weekday initials and the grid
mirrored, confirming the locale and direction handling.

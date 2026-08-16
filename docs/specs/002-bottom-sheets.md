# 002 — Forms move into bottom sheets

**Status:** implemented
**Date:** 2026-08-17
**Branch:** `fix/app-load-hang`

## Why

The density audit found the same shape on three screens: **a list and a form
sharing one scroll**.

| Screen | Lines | What shares the scroll |
| --- | --- | --- |
| Recurring chores | 387 | Template list + 3 inputs + 16 chips + generate action |
| Calendar | 459 | Month grid + day detail + date editor + reassign chips |
| Suggest a mission | 245 | 9 category chips + 3 inputs + mode toggle + member chips |

On recurring chores the nine category chips and seven weekday chips dominate a
screen whose actual job is showing what already repeats.

Moving every form into a bottom sheet fixes all of them with **one pattern**:
the form's controls exist only while you are using them.

## Design decisions

### Vertical motion means "on top of"

A sheet slides up over the screen rather than replacing it. That is the whole
mental model: you have not navigated away, and dismissing returns you exactly
where you were with the list still in place behind. Horizontal motion stays
reserved for sibling navigation.

### Dismissal must be obvious and forgiving

Three ways out: the backdrop, the close control, and the hardware back button.
A form inside a sheet can hold unsaved input, so dismissal is never automatic on
success-adjacent events — only on explicit intent.

### One component, not three

`BottomSheet` takes a title and children. Each screen supplies its own form.
Nothing about the recurring-chore form is baked into the sheet, so the calendar
and mission-suggest forms reuse it unchanged.

### RTL

The grabber is centred, the close control is positioned with `end` rather than
`right`, and padding uses logical properties, so the sheet is correct in Hebrew
without a second layout.

## Implementation

| File | Purpose |
| --- | --- |
| `src/components/BottomSheet.tsx` | Reusable sheet: backdrop, grabber, title, close, slide animation |
| `src/app/missions/templates.tsx` | Template creation form moves into a sheet |

`MoreSheet` (spec 001's navigation work) already used this pattern; this
generalises it so any form can adopt it.

## What changed for the user

Recurring chores becomes a **list of what repeats**, with one primary action.
Tapping it opens the form. The screen is legible at a glance instead of being a
wall of chips.

## Verification

- tsc, full Jest suite
- Every existing `testID` on the template form preserved, so the suites that
  drive those controls keep working — they now find them inside the sheet

## Not done here

Calendar day-detail and mission-suggest still hold their forms inline. The
component is ready for both; they are follow-on work rather than part of this
change, so each can be verified on its own.

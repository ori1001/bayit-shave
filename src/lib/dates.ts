/**
 * Date helpers for the picker.
 *
 * Everything works in local calendar terms, never UTC. A due date is a day on a
 * wall calendar, and converting through UTC is what shifts a chore onto the
 * wrong day for anyone east or west of it.
 */

/** Local YYYY-MM-DD, matching how due_date is stored. */
export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fromISODate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return null;
  }
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  // Rejects things like 2026-02-31, which Date would silently roll forward.
  return date.getMonth() === Number(m) - 1 ? date : null;
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}

/** Weekday index (0 = Sunday) that the 1st of the month falls on. */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

export function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isBetween(day: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  const t = day.getTime();
  return t > Math.min(start.getTime(), end.getTime()) && t < Math.max(start.getTime(), end.getTime());
}

/** Orders a pair so the earlier date is always first. */
export function orderRange(a: Date, b: Date): [Date, Date] {
  return a.getTime() <= b.getTime() ? [a, b] : [b, a];
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

/**
 * How many empty cells precede the 1st, given which weekday the grid starts on.
 *
 * Without this the month is laid out as a plain wrap of 31 boxes, so the 1st
 * always lands in the first column and no column corresponds to a weekday --
 * which is the one thing a month grid exists to show.
 */
export function leadingBlanks(year: number, month: number, weekStart = 0): number {
  return (firstWeekdayOfMonth(year, month) - weekStart + 7) % 7;
}

/** Weekday indices (0 = Sunday) in display order for a grid starting at `weekStart`. */
export function weekdayOrder(weekStart = 0): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
}

/**
 * Cells for a whole month, padded at both ends so the grid is complete weeks.
 * Trailing padding matters: without it the last row is short and the grid's
 * bottom edge steps, which reads as a rendering fault rather than a month end.
 */
export function monthCells(year: number, month: number, weekStart = 0): (number | null)[] {
  const lead = leadingBlanks(year, month, weekStart);
  const total = daysInMonth(year, month);
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

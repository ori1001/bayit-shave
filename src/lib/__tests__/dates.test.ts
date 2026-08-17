import {
  toISODate,
  fromISODate,
  daysInMonth,
  firstWeekdayOfMonth,
  isSameDay,
  isBetween,
  orderRange,
  addMonths,
  leadingBlanks,
  weekdayOrder,
  monthCells,
} from '../dates';

describe('date helpers', () => {
  it('formats as local YYYY-MM-DD, not UTC', () => {
    // Late in the day: a UTC conversion would roll this to the next date for
    // anyone east of GMT, putting the chore on the wrong day.
    expect(toISODate(new Date(2026, 7, 17, 23, 30))).toBe('2026-08-17');
  });

  it('round-trips a valid date', () => {
    expect(toISODate(fromISODate('2026-08-17')!)).toBe('2026-08-17');
  });

  it('rejects a date that does not exist rather than rolling it forward', () => {
    expect(fromISODate('2026-02-31')).toBeNull();
    expect(fromISODate('not-a-date')).toBeNull();
    expect(fromISODate('2026-8-1')).toBeNull();
  });

  it('knows month lengths including leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 8)).toBe(31);
    expect(daysInMonth(2026, 9)).toBe(30);
  });

  it('finds the weekday the month starts on', () => {
    // 1 Aug 2026 is a Saturday.
    expect(firstWeekdayOfMonth(2026, 8)).toBe(6);
  });

  it('compares days ignoring time', () => {
    expect(isSameDay(new Date(2026, 7, 17, 9), new Date(2026, 7, 17, 22))).toBe(true);
    expect(isSameDay(new Date(2026, 7, 17), new Date(2026, 7, 18))).toBe(false);
    expect(isSameDay(null, new Date())).toBe(false);
  });

  it('detects days strictly inside a range, in either order', () => {
    const a = new Date(2026, 7, 10);
    const b = new Date(2026, 7, 20);
    expect(isBetween(new Date(2026, 7, 15), a, b)).toBe(true);
    expect(isBetween(new Date(2026, 7, 15), b, a)).toBe(true);
    expect(isBetween(a, a, b)).toBe(false);
  });

  it('orders a range so the earlier date is first', () => {
    const a = new Date(2026, 7, 20);
    const b = new Date(2026, 7, 10);
    const [start, end] = orderRange(a, b);
    expect(toISODate(start)).toBe('2026-08-10');
    expect(toISODate(end)).toBe('2026-08-20');
  });

  it('steps months across a year boundary in both directions', () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths(2026, 8, 5)).toEqual({ year: 2027, month: 1 });
  });
});

describe('month grid layout', () => {
  // 1 August 2026 is a Saturday (getDay() === 6).
  it('pads the front so the 1st lands under its own weekday', () => {
    expect(leadingBlanks(2026, 8, 0)).toBe(6);
  });

  it('pads differently for a week that starts on Monday', () => {
    expect(leadingBlanks(2026, 8, 1)).toBe(5);
  });

  it('needs no padding when the 1st is the first column', () => {
    // 1 February 2026 is a Sunday.
    expect(leadingBlanks(2026, 2, 0)).toBe(0);
  });

  it('rotates the weekday header to match the start day', () => {
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('produces whole weeks, so the grid has no ragged last row', () => {
    const cells = monthCells(2026, 8, 0);
    expect(cells.length % 7).toBe(0);
    // 6 blanks + 31 days = 37, padded up to 42.
    expect(cells.length).toBe(42);
  });

  it('places every day of the month exactly once, in order', () => {
    const days = monthCells(2026, 8, 0).filter((cell): cell is number => cell !== null);
    expect(days).toHaveLength(31);
    expect(days[0]).toBe(1);
    expect(days[30]).toBe(31);
  });

  it('puts each day in the column of its actual weekday', () => {
    const cells = monthCells(2026, 8, 0);
    for (const [index, day] of cells.entries()) {
      if (day === null) continue;
      expect(index % 7).toBe(new Date(2026, 7, day).getDay());
    }
  });
});

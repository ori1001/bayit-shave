import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { datesForRule } from '../../functions/generate-recurring-missions/index.ts';

const from = new Date('2026-08-01T00:00:00Z');
const to = new Date('2026-08-31T00:00:00Z');

Deno.test('weekly rule fires on every matching weekday in range', () => {
  // Fridays in August 2026.
  assertEquals(datesForRule('weekly:fri', from, to), [
    '2026-08-07',
    '2026-08-14',
    '2026-08-21',
    '2026-08-28',
  ]);
});

Deno.test('weekly rule is case-insensitive', () => {
  assertEquals(datesForRule('WEEKLY:FRI', from, to), datesForRule('weekly:fri', from, to));
});

Deno.test('monthly rule fires once per month on the given day', () => {
  assertEquals(datesForRule('monthly:15', from, to), ['2026-08-15']);
  assertEquals(
    datesForRule('monthly:15', new Date('2026-08-01T00:00:00Z'), new Date('2026-10-31T00:00:00Z')),
    ['2026-08-15', '2026-09-15', '2026-10-15']
  );
});

Deno.test('a monthly day that some months lack simply skips those months', () => {
  // No 31st in September or November.
  assertEquals(
    datesForRule('monthly:31', new Date('2026-08-01T00:00:00Z'), new Date('2026-11-30T00:00:00Z')),
    ['2026-08-31', '2026-10-31']
  );
});

Deno.test('an unrecognised rule yields nothing rather than guessing', () => {
  assertEquals(datesForRule('every-other-tuesday', from, to), []);
  assertEquals(datesForRule('weekly:funday', from, to), []);
  assertEquals(datesForRule('monthly:0', from, to), []);
  assertEquals(datesForRule('monthly:32', from, to), []);
  assertEquals(datesForRule('', from, to), []);
});

Deno.test('range boundaries are inclusive', () => {
  // 2026-08-07 is itself a Friday and is both the start and end of the range.
  const friday = new Date('2026-08-07T00:00:00Z');
  assertEquals(datesForRule('weekly:fri', friday, friday), ['2026-08-07']);
});

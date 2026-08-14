import { getTodayMissions } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'gte', 'lte']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.then = jest.fn((resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }));
  return { supabase: { from: jest.fn(() => builder) } };
});

describe('getTodayMissions', () => {
  it('scopes the query to the given day so the Today screen is not every assigned mission ever', async () => {
    const day = '2026-08-06';
    await getTodayMissions('house-1', 'member-1', day);

    const builder = (supabase.from as jest.Mock).mock.results[0].value;
    const dueDateFilters = builder.eq.mock.calls.filter((c: unknown[]) => c[0] === 'due_date');

    expect(dueDateFilters).toEqual([['due_date', day]]);
  });
});

import { createTemplate, deleteTemplate, generateRecurringMissions } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

describe('template writes', () => {
  // mission_templates grants authenticated select only, so these must never
  // reach the table directly or RLS rejects them.
  it('creates through the Edge Function rather than a direct insert', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { template: { id: 'tpl1' } },
      error: null,
    });

    await createTemplate({
      house_id: 'h1',
      title: 'Dishes',
      category: 'dishes',
      points: 10,
      recurrence_rule: 'weekly:fri',
    });

    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.functions.invoke).toHaveBeenCalledWith('manage-mission-template', {
      body: {
        action: 'create',
        house_id: 'h1',
        title: 'Dishes',
        category: 'dishes',
        points: 10,
        recurrence_rule: 'weekly:fri',
      },
    });
  });

  it('deletes through the Edge Function, scoped to the house', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { deleted: true }, error: null });

    await deleteTemplate('h1', 'tpl1');

    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.functions.invoke).toHaveBeenCalledWith('manage-mission-template', {
      body: { action: 'delete', house_id: 'h1', template_id: 'tpl1' },
    });
  });

  it('surfaces unsupported_recurrence_rule from the server', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'unsupported_recurrence_rule' }) },
      },
    });

    await expect(
      createTemplate({ house_id: 'h1', title: 'X', category: 'other', points: 1, recurrence_rule: 'every-tuesday' })
    ).rejects.toThrow('unsupported_recurrence_rule');
  });
});

describe('generateRecurringMissions', () => {
  it('omits the range when none is given, letting the server pick its horizon', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { created: 4 }, error: null });

    const result = await generateRecurringMissions('h1');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('generate-recurring-missions', {
      body: { house_id: 'h1' },
    });
    expect(result.created).toBe(4);
  });
});

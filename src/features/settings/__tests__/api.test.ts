import { getHouseSettings, updateHouseSettings } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.maybeSingle = jest.fn();
  return {
    supabase: {
      from: jest.fn(() => builder),
      functions: { invoke: jest.fn() },
    },
  };
});

describe('updateHouseSettings', () => {
  it('sends only the fields that changed', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { house: { id: 'h1', assignment_strategy: 'round_robin' }, members: [] },
      error: null,
    });

    await updateHouseSettings('h1', { assignment_strategy: 'round_robin' });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('update-house-settings', {
      body: { house_id: 'h1', assignment_strategy: 'round_robin' },
    });
  });

  it('sends member weights when provided', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { house: { id: 'h1' }, members: [] },
      error: null,
    });

    await updateHouseSettings('h1', { member_weights: [{ member_id: 'm1', weight: 0.5 }] });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('update-house-settings', {
      body: { house_id: 'h1', member_weights: [{ member_id: 'm1', weight: 0.5 }] },
    });
  });

  it('surfaces the server error code, so a non-admin caller sees admin_only', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'admin_only' }) },
      },
    });

    await expect(updateHouseSettings('h1', { balance_day: 3 })).rejects.toThrow('admin_only');
  });
});

describe('getHouseSettings', () => {
  it('throws when the house row cannot be read', async () => {
    const builder = (supabase.from as jest.Mock)();
    builder.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(getHouseSettings('h1')).rejects.toThrow('boom');
  });
});

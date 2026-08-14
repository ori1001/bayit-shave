import { editMissionSchedule } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

describe('editMissionSchedule', () => {
  beforeEach(() => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { mission: {} }, error: null });
  });

  it('sends only the date when reschduling without a reassignment', async () => {
    await editMissionSchedule('mi1', '2026-08-20');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('edit-mission-schedule', {
      body: { mission_instance_id: 'mi1', due_date: '2026-08-20' },
    });
  });

  it('omits due_date entirely when only reassigning, so the day is left untouched', async () => {
    await editMissionSchedule('mi1', null, 'member-2');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('edit-mission-schedule', {
      body: { mission_instance_id: 'mi1', assigned_to: 'member-2' },
    });
  });

  it('sends both when the day and the assignee change together', async () => {
    await editMissionSchedule('mi1', '2026-08-20', 'member-2');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('edit-mission-schedule', {
      body: { mission_instance_id: 'mi1', due_date: '2026-08-20', assigned_to: 'member-2' },
    });
  });

  it('surfaces the server error code when the target is outside the house', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'target_not_in_house' }) },
      },
    });

    await expect(editMissionSchedule('mi1', null, 'outsider')).rejects.toThrow('target_not_in_house');
  });
});

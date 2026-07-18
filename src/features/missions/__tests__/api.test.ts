import {
  suggestMission,
  editMissionPoints,
  resolveSuggestion,
  completeMission,
  getTodayMissions,
  getSuggestions,
  getMyMembership,
} from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
    },
  },
}));

describe('suggestMission', () => {
  it('invokes suggest-mission with the given input', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { mission: { id: 'm1', status: 'open' } },
      error: null,
    });
    const result = await suggestMission({
      house_id: 'h1',
      category: 'dishes',
      title: 'Wash dishes',
      points: 15,
      due_date: '2026-07-20',
      assignment_mode: 'auto',
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('suggest-mission', {
      body: {
        house_id: 'h1',
        category: 'dishes',
        title: 'Wash dishes',
        points: 15,
        due_date: '2026-07-20',
        assignment_mode: 'auto',
      },
    });
    expect(result.mission.id).toBe('m1');
  });

  it('throws the extracted error body on failure', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { json: async () => ({ error: 'not_a_member_of_this_house' }) } },
    });
    await expect(
      suggestMission({
        house_id: 'h1',
        category: 'dishes',
        title: 'Wash dishes',
        points: 15,
        due_date: '2026-07-20',
        assignment_mode: 'auto',
      })
    ).rejects.toThrow('not_a_member_of_this_house');
  });
});

describe('editMissionPoints', () => {
  it('invokes edit-mission-points', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { mission: { id: 'm1', proposed_points: 20 } },
      error: null,
    });
    const result = await editMissionPoints('m1', 20);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('edit-mission-points', {
      body: { mission_instance_id: 'm1', points: 20 },
    });
    expect(result.mission.proposed_points).toBe(20);
  });
});

describe('resolveSuggestion', () => {
  it('invokes resolve-suggestion with type/id/decision', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { mission: { id: 'm1', status: 'open' } },
      error: null,
    });
    const result = await resolveSuggestion('new_mission', 'm1', 'approve');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('resolve-suggestion', {
      body: { suggestion_type: 'new_mission', mission_instance_id: 'm1', decision: 'approve' },
    });
    expect(result.mission.status).toBe('open');
  });
});

describe('completeMission', () => {
  it('invokes complete-mission', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { mission: { id: 'm1', status: 'done' } },
      error: null,
    });
    const result = await completeMission('m1');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('complete-mission', {
      body: { mission_instance_id: 'm1' },
    });
    expect(result.mission.status).toBe('done');
  });
});

function mockSelectChain(finalResult: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(finalResult),
    then: (resolve: (value: { data: unknown; error: unknown }) => void) => resolve(finalResult),
  };
  return chain;
}

describe('getTodayMissions', () => {
  it('queries mission_instances filtered to the member and assigned status', async () => {
    const chain = mockSelectChain({ data: [{ id: 'm1' }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getTodayMissions('h1', 'mem1');
    expect(supabase.from).toHaveBeenCalledWith('mission_instances');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    expect(chain.eq).toHaveBeenCalledWith('assigned_to', 'mem1');
    expect(chain.eq).toHaveBeenCalledWith('status', 'assigned');
    expect(result).toEqual([{ id: 'm1' }]);
  });
});

describe('getMyMembership', () => {
  it('returns the member row for the current user in a house', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user1' } },
      error: null,
    });
    const chain = mockSelectChain({ data: { id: 'mem1', role: 'admin' }, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getMyMembership('h1');
    expect(supabase.from).toHaveBeenCalledWith('members');
    expect(chain.select).toHaveBeenCalledWith('id, role');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user1');
    expect(result).toEqual({ id: 'mem1', role: 'admin' });
  });
});

describe('getSuggestions', () => {
  it('queries mission_instances for pending or proposed-points rows', async () => {
    const chain = mockSelectChain({ data: [{ id: 'm1' }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getSuggestions('h1');
    expect(supabase.from).toHaveBeenCalledWith('mission_instances');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    expect(chain.or).toHaveBeenCalledWith('status.eq.pending_approval,proposed_points.not.is.null');
    expect(result).toEqual([{ id: 'm1' }]);
  });
});

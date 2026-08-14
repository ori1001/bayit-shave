import {
  suggestMission,
  editMissionPoints,
  resolveSuggestion,
  completeMission,
  getTodayMissions,
  getSuggestions,
  getMyMembership,
  getMyHouseId,
  getHouseMembers,
  editMissionSchedule,
  getMonthMissions,
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

describe('editMissionSchedule', () => {
  it('invokes edit-mission-schedule with mission id and due date', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { mission: { id: 'm1', proposed_due_date: '2026-08-01' } },
      error: null,
    });
    const result = await editMissionSchedule('m1', '2026-08-01');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('edit-mission-schedule', {
      body: { mission_instance_id: 'm1', due_date: '2026-08-01' },
    });
    expect(result.mission.proposed_due_date).toBe('2026-08-01');
  });
});

function mockSelectChain(finalResult: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
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

describe('getMonthMissions', () => {
  it('queries mission_instances within the given month, excluding rejected', async () => {
    const chain = mockSelectChain({ data: [{ id: 'm1' }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getMonthMissions('h1', 2026, 8);
    expect(supabase.from).toHaveBeenCalledWith('mission_instances');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    expect(chain.neq).toHaveBeenCalledWith('status', 'rejected');
    expect(chain.gte).toHaveBeenCalledWith('due_date', '2026-08-01');
    expect(chain.lte).toHaveBeenCalledWith('due_date', '2026-08-31');
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
  it('queries mission_instances for pending, proposed-points, proposed-due-date or proposed-assignee rows', async () => {
    const chain = mockSelectChain({ data: [{ id: 'm1' }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getSuggestions('h1');
    expect(supabase.from).toHaveBeenCalledWith('mission_instances');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    // proposed_assigned_to must be part of the filter or a reassignment
    // proposal would never reach the admin's inbox.
    expect(chain.or).toHaveBeenCalledWith(
      'status.eq.pending_approval,proposed_points.not.is.null,proposed_due_date.not.is.null,proposed_assigned_to.not.is.null'
    );
    expect(result).toEqual([{ id: 'm1' }]);
  });
});

describe('getMyHouseId', () => {
  it("returns the house_id of the caller's membership row", async () => {
    (supabase.auth.getUser as jest.Mock) = jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });
    const chain = mockSelectChain({ data: { house_id: 'h1' }, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getMyHouseId();
    expect(result).toBe('h1');
  });

  it('returns null when there is no session', async () => {
    (supabase.auth.getUser as jest.Mock) = jest.fn().mockResolvedValue({ data: { user: null } });
    const result = await getMyHouseId();
    expect(result).toBeNull();
  });
});

describe('getHouseMembers', () => {
  it('returns the members of a house', async () => {
    const chain = mockSelectChain({
      data: [
        { id: 'mem1', name: 'Noa', role: 'admin' },
        { id: 'mem2', name: 'Itai', role: 'member' },
      ],
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getHouseMembers('h1');
    expect(supabase.from).toHaveBeenCalledWith('members');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    expect(result).toEqual([
      { id: 'mem1', name: 'Noa', role: 'admin' },
      { id: 'mem2', name: 'Itai', role: 'member' },
    ]);
  });
});

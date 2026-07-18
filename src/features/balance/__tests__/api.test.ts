import { runBalance, assignMission, getPointsPool, getOpenMissions } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    from: jest.fn(),
  },
}));

function mockSelectChain(finalResult: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    then: (resolve: (value: { data: unknown; error: unknown }) => void) => resolve(finalResult),
  };
  return chain;
}

describe('runBalance', () => {
  it('invokes run-balance with the house id', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { assigned: [{ mission_id: 'm1', member_id: 'mem1' }] },
      error: null,
    });
    const result = await runBalance('h1');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('run-balance', { body: { house_id: 'h1' } });
    expect(result.assigned).toHaveLength(1);
  });

  it('throws the extracted error body on failure', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { json: async () => ({ error: 'admin_only' }) } },
    });
    await expect(runBalance('h1')).rejects.toThrow('admin_only');
  });
});

describe('assignMission', () => {
  it('invokes assign-mission with mission and member ids', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { mission: { id: 'm1', assigned_to: 'mem1' } },
      error: null,
    });
    await assignMission('m1', 'mem1');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('assign-mission', {
      body: { mission_instance_id: 'm1', member_id: 'mem1' },
    });
  });
});

describe('getPointsPool', () => {
  it('joins members and points_ledger client-side', async () => {
    const membersChain = mockSelectChain({
      data: [
        { id: 'mem1', name: 'Noa' },
        { id: 'mem2', name: 'Itai' },
      ],
      error: null,
    });
    const ledgerChain = mockSelectChain({
      data: [{ member_id: 'mem1', points_earned: 10, points_target: 15, debt: 0 }],
      error: null,
    });
    (supabase.from as jest.Mock).mockImplementation((table: string) => (table === 'members' ? membersChain : ledgerChain));

    const result = await getPointsPool('h1');

    expect(result).toEqual([
      { member_id: 'mem1', name: 'Noa', points_earned: 10, points_target: 15, debt: 0 },
      { member_id: 'mem2', name: 'Itai', points_earned: 0, points_target: 0, debt: 0 },
    ]);
  });
});

describe('getOpenMissions', () => {
  it('queries open, unassigned mission_instances for the house', async () => {
    const chain = mockSelectChain({ data: [{ id: 'm1', title: 'Wash dishes', points: 15 }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getOpenMissions('h1');
    expect(supabase.from).toHaveBeenCalledWith('mission_instances');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    expect(chain.eq).toHaveBeenCalledWith('status', 'open');
    expect(chain.is).toHaveBeenCalledWith('assigned_to', null);
    expect(result).toEqual([{ id: 'm1', title: 'Wash dishes', points: 15 }]);
  });
});

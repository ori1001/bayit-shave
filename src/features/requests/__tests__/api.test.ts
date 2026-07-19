import {
  suggestSwap,
  respondSwap,
  resolveSwap,
  suggestUnavailability,
  resolveUnavailability,
  getMyIncomingSwaps,
  getPendingSwapsForAdmin,
  getPendingUnavailability,
} from '../api';
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
    then: (resolve: (value: { data: unknown; error: unknown }) => void) => resolve(finalResult),
  };
  return chain;
}

describe('suggestSwap', () => {
  it('invokes suggest-swap with mission and target member ids', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { swap: { id: 's1', status: 'pending' } }, error: null });
    const result = await suggestSwap('m1', 'mem2');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('suggest-swap', {
      body: { mission_instance_id: 'm1', to_member_id: 'mem2' },
    });
    expect(result.swap.status).toBe('pending');
  });
});

describe('respondSwap', () => {
  it('invokes respond-swap with the decision', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { swap: { id: 's1', status: 'accepted' } }, error: null });
    await respondSwap('s1', 'accept');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('respond-swap', {
      body: { swap_request_id: 's1', decision: 'accept' },
    });
  });
});

describe('resolveSwap', () => {
  it('invokes resolve-swap with the decision', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { swap: { id: 's1', status: 'approved' } }, error: null });
    await resolveSwap('s1', 'approve');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('resolve-swap', {
      body: { swap_request_id: 's1', decision: 'approve' },
    });
  });
});

describe('suggestUnavailability', () => {
  it('invokes suggest-unavailability with the date range and reason', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { unavailability: { id: 'u1', status: 'pending' } },
      error: null,
    });
    await suggestUnavailability('h1', '2026-08-01', '2026-08-05', 'Trip');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('suggest-unavailability', {
      body: { house_id: 'h1', period_start: '2026-08-01', period_end: '2026-08-05', reason: 'Trip' },
    });
  });
});

describe('resolveUnavailability', () => {
  it('invokes resolve-unavailability with the decision', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { unavailability: { id: 'u1', status: 'approved' } },
      error: null,
    });
    await resolveUnavailability('u1', 'approve');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('resolve-unavailability', {
      body: { unavailability_request_id: 'u1', decision: 'approve' },
    });
  });
});

describe('getMyIncomingSwaps', () => {
  it('queries pending swaps addressed to the member', async () => {
    const chain = mockSelectChain({ data: [{ id: 's1' }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getMyIncomingSwaps('h1', 'mem1');
    expect(supabase.from).toHaveBeenCalledWith('swap_requests');
    expect(chain.eq).toHaveBeenCalledWith('house_id', 'h1');
    expect(chain.eq).toHaveBeenCalledWith('to_member', 'mem1');
    expect(chain.eq).toHaveBeenCalledWith('status', 'pending');
    expect(result).toEqual([{ id: 's1' }]);
  });
});

describe('getPendingSwapsForAdmin', () => {
  it('queries accepted swaps ready for admin approval', async () => {
    const chain = mockSelectChain({ data: [{ id: 's1' }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getPendingSwapsForAdmin('h1');
    expect(chain.eq).toHaveBeenCalledWith('status', 'accepted');
    expect(result).toEqual([{ id: 's1' }]);
  });
});

describe('getPendingUnavailability', () => {
  it('queries pending unavailability requests', async () => {
    const chain = mockSelectChain({ data: [{ id: 'u1' }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const result = await getPendingUnavailability('h1');
    expect(supabase.from).toHaveBeenCalledWith('unavailability_requests');
    expect(chain.eq).toHaveBeenCalledWith('status', 'pending');
    expect(result).toEqual([{ id: 'u1' }]);
  });
});

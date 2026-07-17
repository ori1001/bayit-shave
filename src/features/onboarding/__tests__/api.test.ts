import { createHouse, joinHouse } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
    functions: {
      invoke: jest.fn(),
    },
  },
}));

describe('createHouse', () => {
  it('returns house and member on success', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { house: { id: 'h1', invite_code: 'ABC123' }, member: { id: 'm1', role: 'admin' } },
      error: null,
    });

    const result = await createHouse('My House', 'Noa');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('create-house', {
      body: { house_name: 'My House', admin_name: 'Noa' },
    });
    expect(result.house.id).toBe('h1');
    expect(result.member.role).toBe('admin');
  });

  it('throws with the server error code on failure', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'house_creation_failed' }) },
      },
    });

    await expect(createHouse('My House', 'Noa')).rejects.toThrow('house_creation_failed');
  });
});

describe('joinHouse', () => {
  it('returns the member on success', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { member: { id: 'm2', role: 'member', house_id: 'h1' } },
      error: null,
    });

    const result = await joinHouse('ABC123', 'Itai');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('join-house', {
      body: { invite_code: 'ABC123', name: 'Itai' },
    });
    expect(result.member.role).toBe('member');
  });

  it('throws "invalid_invite_code" for a bad code', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'invalid_invite_code' }) },
      },
    });

    await expect(joinHouse('NOPE99', 'Ghost')).rejects.toThrow('invalid_invite_code');
  });
});

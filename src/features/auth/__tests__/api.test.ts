import { signUp, signIn } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: { auth: { signUp: jest.fn(), signInWithPassword: jest.fn() } },
}));

describe('signUp', () => {
  it('returns the session data on success', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 'tok' } },
      error: null,
    });
    const result = await signUp('a@example.com', 'Test1234!');
    expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: 'a@example.com', password: 'Test1234!' });
    expect(result.session?.access_token).toBe('tok');
  });

  it('throws the Supabase error message on failure', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Password should be at least 6 characters' },
    });
    await expect(signUp('a@example.com', '123')).rejects.toThrow('Password should be at least 6 characters');
  });
});

describe('signIn', () => {
  it('returns the session data on success', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 'tok2' } },
      error: null,
    });
    const result = await signIn('a@example.com', 'Test1234!');
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@example.com', password: 'Test1234!' });
    expect(result.session?.access_token).toBe('tok2');
  });

  it('throws the Supabase error message on failure', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });
    await expect(signIn('a@example.com', 'wrong')).rejects.toThrow('Invalid login credentials');
  });
});

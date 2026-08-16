import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { signUp, signIn, signInWithGoogle, parseAuthFragment, resendConfirmation, openMailApp } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('expo-linking', () => ({ createURL: jest.fn(), canOpenURL: jest.fn(), openURL: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signInWithOAuth: jest.fn(),
      setSession: jest.fn(),
      resend: jest.fn(),
    },
  },
}));

describe('signUp', () => {
  it('returns the session data on success', async () => {
    (Linking.createURL as jest.Mock).mockReturnValue('bayitshave://auth/callback');
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 'tok' } },
      error: null,
    });
    const result = await signUp('a@example.com', 'Test1234!');
    expect(result.session?.access_token).toBe('tok');
  });

  it('sends the confirmation link back to this app, not the project Site URL', async () => {
    // The Supabase project is shared with another app, so relying on the
    // default Site URL opened that app when confirming here.
    (Linking.createURL as jest.Mock).mockReturnValue('bayitshave://auth/callback');
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1' }, session: null },
      error: null,
    });

    await signUp('a@example.com', 'Test1234!');

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'Test1234!',
      options: { emailRedirectTo: 'bayitshave://auth/callback' },
    });
  });

  it('throws the Supabase error message on failure', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Password should be at least 6 characters' },
    });
    await expect(signUp('a@example.com', '123')).rejects.toThrow('Password should be at least 6 characters');
  });

  it('reports when the account was created but needs email confirmation', async () => {
    // What a project with "Confirm email" switched on returns: a user, no
    // session. Without a flag the caller cannot tell this from a no-op, which
    // is why sign-up appeared to silently do nothing.
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@example.com' }, session: null },
      error: null,
    });

    const result = await signUp('a@example.com', 'Test1234!');

    expect(result.needsEmailConfirmation).toBe(true);
    expect(result.session).toBeNull();
  });

  it('does not flag confirmation when a session comes back', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 'tok' } },
      error: null,
    });

    const result = await signUp('a@example.com', 'Test1234!');

    expect(result.needsEmailConfirmation).toBe(false);
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

describe('signInWithGoogle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Linking.createURL as jest.Mock).mockReturnValue('bayitshave://auth/callback');
    (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
      data: { url: 'https://accounts.google.com/o/oauth2/auth?x=1' },
      error: null,
    });
    (supabase.auth.setSession as jest.Mock).mockResolvedValue({ error: null });
  });

  it('drives the browser itself rather than letting Supabase redirect', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'bayitshave://auth/callback#access_token=at1&refresh_token=rt1',
    });

    await expect(signInWithGoogle()).resolves.toBe(true);

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'bayitshave://auth/callback', skipBrowserRedirect: true },
    });
    // Tokens arrive in the fragment and must be applied by hand, because
    // detectSessionInUrl is off for native.
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'at1', refresh_token: 'rt1' });
  });

  it('returns false when the user dismisses the browser', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'dismiss' });

    await expect(signInWithGoogle()).resolves.toBe(false);
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('surfaces an error Google sent back instead of a generic failure', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'bayitshave://auth/callback#error_description=Access%20blocked',
    });

    await expect(signInWithGoogle()).rejects.toThrow('Access blocked');
  });

  it('parses tokens from a query string as well as a fragment', () => {
    expect(parseAuthFragment('app://cb?code=abc#access_token=tok')).toEqual({
      code: 'abc',
      access_token: 'tok',
    });
  });
});

describe('confirmation helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resends the confirmation with this app as the return target', async () => {
    (Linking.createURL as jest.Mock).mockReturnValue('bayitshave://auth/callback');
    (supabase.auth.resend as jest.Mock).mockResolvedValue({ error: null });

    await resendConfirmation('a@b.com');

    expect(supabase.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'a@b.com',
      options: { emailRedirectTo: 'bayitshave://auth/callback' },
    });
  });

  it('surfaces a rate-limit message rather than failing silently', async () => {
    (supabase.auth.resend as jest.Mock).mockResolvedValue({
      error: { message: 'For security purposes, you can only request this once every 60 seconds' },
    });
    await expect(resendConfirmation('a@b.com')).rejects.toThrow(/60 seconds/);
  });

  it('opens the first mail target the device can handle', async () => {
    (Linking.canOpenURL as jest.Mock).mockImplementation((u: string) => Promise.resolve(u.startsWith('https://')));
    (Linking.openURL as jest.Mock).mockResolvedValue(undefined);

    await expect(openMailApp()).resolves.toBe(true);
    expect(Linking.openURL).toHaveBeenCalledWith('https://mail.google.com');
  });

  it('reports false when nothing can open mail, instead of throwing', async () => {
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
    await expect(openMailApp()).resolves.toBe(false);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});

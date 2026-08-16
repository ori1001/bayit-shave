import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export interface SignUpResult {
  user: User | null;
  session: Session | null;
  /**
   * True when the account was created but no session came back, which is what
   * a project with "Confirm email" enabled returns. Callers must surface this:
   * it is indistinguishable from a silent no-op otherwise, and the sign-up
   * screen simply sat there looking broken.
   */
  needsEmailConfirmation: boolean;
}

export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Must be explicit. Without it Supabase sends the confirmation link to
      // the project's Site URL, and this project is shared with another app --
      // so confirming here opened that app instead of this one.
      emailRedirectTo: Linking.createURL('auth/callback'),
    },
  });
  if (error) {
    throw new Error(error.message);
  }
  return {
    user: data.user,
    session: data.session,
    needsEmailConfirmation: !!data.user && !data.session,
  };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

/**
 * Google sign-in through Supabase's OAuth flow.
 *
 * Supabase redirects back to the app's own scheme with the tokens in the URL
 * fragment, so the session has to be established manually from them --
 * detectSessionInUrl is deliberately off (it is browser-only and would crash
 * on native). Returns false when the user dismisses the browser, which is a
 * cancellation rather than an error worth surfacing.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // We drive the browser ourselves so the flow works identically on
      // native, where an automatic redirect has nowhere to go.
      skipBrowserRedirect: true,
    },
  });
  if (error) {
    throw new Error(error.message);
  }
  if (!data?.url) {
    throw new Error('google_oauth_no_url');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) {
    return false;
  }

  const { access_token, refresh_token, error_description } = parseAuthFragment(result.url);
  if (error_description) {
    throw new Error(error_description);
  }
  if (!access_token || !refresh_token) {
    throw new Error('google_oauth_missing_tokens');
  }

  const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
  if (sessionError) {
    throw new Error(sessionError.message);
  }
  return true;
}

/** Re-sends the confirmation link for an address that has not confirmed yet. */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    // Same reason as signUp: without this the resent link points at the
    // project's Site URL, which belongs to a different app.
    options: { emailRedirectTo: Linking.createURL('auth/callback') },
  });
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Opens the device's mail app.
 *
 * Android exposes an intent for "an app that can read mail", which is more
 * reliable than guessing at Gmail or a mailto: link that would start a
 * *compose* window rather than the inbox. Returns false when nothing handles
 * it, so the caller can stay quiet rather than showing a failure.
 */
export async function openMailApp(): Promise<boolean> {
  const candidates =
    Platform.OS === 'android'
      ? ['content://com.android.email.provider', 'https://mail.google.com']
      : ['message://', 'https://mail.google.com'];

  for (const url of candidates) {
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      // Try the next candidate rather than failing the whole action.
    }
  }
  return false;
}

/** Tokens come back in the fragment (#a=b&c=d), not the query string. */
export function parseAuthFragment(url: string): Record<string, string> {
  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const out: Record<string, string> = {};
  for (const part of [fragment, query]) {
    if (!part) continue;
    for (const pair of part.split('&')) {
      const [k, v] = pair.split('=');
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
    }
  }
  return out;
}

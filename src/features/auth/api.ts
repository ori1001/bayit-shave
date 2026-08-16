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
  const { data, error } = await supabase.auth.signUp({ email, password });
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

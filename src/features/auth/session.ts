import { supabase } from '../../lib/supabase';
import { clearScreenData } from '../../lib/screen-data';

export interface Membership {
  id: string;
  role: 'admin' | 'member';
}

let userIdCache: { value: string | null } | null = null;
let houseIdCache: { value: string | null } | null = null;
const membershipCache = new Map<string, Membership | null>();

/**
 * The signed-in user's id, from the locally stored session.
 *
 * Deliberately getSession() and not getUser(): getUser() is an HTTPS round trip
 * to /auth/v1/user on *every* call, and the screens called it two or three
 * times per load, so a mission list that needed 3 queries was paying for 5
 * sequential requests. Nothing is trusted on the strength of this id -- it only
 * picks which rows to ask for, and Postgres re-validates the same JWT under RLS
 * before returning any of them.
 */
export async function getCurrentUserId(): Promise<string | null> {
  if (userIdCache) {
    return userIdCache.value;
  }
  const { data } = await supabase.auth.getSession();
  userIdCache = { value: data.session?.user.id ?? null };
  return userIdCache.value;
}

/**
 * Which house the user belongs to. Cached for the session: a member belongs to
 * one house and cannot change that from inside the app, so re-reading it on
 * every screen and every refresh was pure latency.
 *
 * A null answer is never cached. "No house yet" is precisely the value that
 * changes while the app is open -- it is what the entry screen sees before the
 * user creates or joins one, and caching it would strand them on the create/join
 * screen for the rest of the session.
 */
export async function getCachedHouseId(read: () => Promise<string | null>): Promise<string | null> {
  if (houseIdCache) {
    return houseIdCache.value;
  }
  const value = await read();
  if (value !== null) {
    houseIdCache = { value };
  }
  return value;
}

/**
 * The admin flag as already known, without waiting.
 *
 * Undefined means "not established yet", which is not the same as "not an
 * admin". The tab bar needs the difference: an admin gets a fifth tab, and
 * every tab is flex-sized, so guessing false while a screen loads made the
 * whole bar reflow -- tabs visibly changing width mid-navigation.
 */
export function peekIsAdmin(houseId: string): boolean | undefined {
  const cached = membershipCache.get(houseId);
  return cached ? cached.role === 'admin' : undefined;
}

/** Same reasoning for the membership row, which carries the admin flag. */
export async function getCachedMembership(
  houseId: string,
  read: () => Promise<Membership | null>
): Promise<Membership | null> {
  const cached = membershipCache.get(houseId);
  if (cached) {
    return cached;
  }
  const value = await read();
  if (value !== null) {
    membershipCache.set(houseId, value);
  }
  return value;
}

/**
 * Drops everything derived from the session.
 *
 * Called on any auth change. Without it a sign-out followed by a sign-in as
 * someone else would serve the first account's house and admin rights.
 */
export function clearSessionCaches(): void {
  userIdCache = null;
  houseIdCache = null;
  membershipCache.clear();
  // The screens' own cached payloads are derived from this session too -- a
  // sign-out that left them behind would paint the previous account's chores.
  clearScreenData();
}

// Optional-chained because unit tests mock the Supabase client with only the
// handful of methods they exercise.
supabase.auth?.onAuthStateChange?.(() => {
  clearSessionCaches();
});

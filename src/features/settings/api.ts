import { supabase } from '../../lib/supabase';

export type AssignmentStrategy = 'round_robin' | 'points_based' | 'manual';
export type BalancePeriod = 'weekly' | 'monthly';

export interface HouseSettings {
  id: string;
  name: string;
  assignment_strategy: AssignmentStrategy;
  balance_period: BalancePeriod;
  /** 0 = Sunday .. 6 = Saturday */
  balance_day: number;
}

export interface MemberWeight {
  id: string;
  name: string;
  role: 'admin' | 'member';
  weight: number;
}

export interface HouseSettingsUpdate {
  assignment_strategy?: AssignmentStrategy;
  balance_period?: BalancePeriod;
  balance_day?: number;
  member_weights?: { member_id: string; weight: number }[];
}

export async function getHouseSettings(houseId: string): Promise<{ house: HouseSettings; members: MemberWeight[] }> {
  const { data: house, error: houseError } = await supabase
    .from('houses')
    .select('id, name, assignment_strategy, balance_period, balance_day')
    .eq('id', houseId)
    .maybeSingle();
  if (houseError) {
    throw new Error(houseError.message);
  }
  if (!house) {
    throw new Error('house_not_found');
  }

  const { data: members, error: membersError } = await supabase
    .from('members')
    .select('id, name, role, weight')
    .eq('house_id', houseId);
  if (membersError) {
    throw new Error(membersError.message);
  }

  return { house: house as HouseSettings, members: (members ?? []) as MemberWeight[] };
}

/**
 * Writes go through an Edge Function rather than the table: `houses` has no
 * RLS update policy, and `members` only lets a member update their own row, so
 * an admin could not set another member's weight from the client. The function
 * re-checks that the caller is this house's admin.
 */
export async function updateHouseSettings(
  houseId: string,
  update: HouseSettingsUpdate
): Promise<{ house: HouseSettings; members: MemberWeight[] }> {
  const { data, error } = await supabase.functions.invoke('update-house-settings', {
    body: { house_id: houseId, ...update },
  });
  if (error) {
    const body = error.context ? await error.context.json().catch(() => null) : null;
    throw new Error(body?.error ?? error.message);
  }
  return data;
}

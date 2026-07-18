import { supabase } from '../../lib/supabase';

export interface PointsPoolEntry {
  member_id: string;
  name: string;
  points_earned: number;
  points_target: number;
  debt: number;
}

export interface OpenMission {
  id: string;
  title: string;
  points: number;
}

async function throwFromInvokeError(error: { message: string; context?: Response }): Promise<never> {
  const body = error.context ? await error.context.json().catch(() => null) : null;
  throw new Error((body as { error?: string } | null)?.error ?? error.message);
}

export async function runBalance(houseId: string): Promise<{ assigned: { mission_id: string; member_id: string }[] }> {
  const { data, error } = await supabase.functions.invoke('run-balance', { body: { house_id: houseId } });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function assignMission(missionInstanceId: string, memberId: string): Promise<{ mission: unknown }> {
  const { data, error } = await supabase.functions.invoke('assign-mission', {
    body: { mission_instance_id: missionInstanceId, member_id: memberId },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function getPointsPool(houseId: string): Promise<PointsPoolEntry[]> {
  const { data: members, error: membersError } = await supabase
    .from('members')
    .select('id, name')
    .eq('house_id', houseId);
  if (membersError) {
    throw new Error(membersError.message);
  }
  const { data: ledger, error: ledgerError } = await supabase
    .from('points_ledger')
    .select('member_id, points_earned, points_target, debt')
    .eq('house_id', houseId);
  if (ledgerError) {
    throw new Error(ledgerError.message);
  }
  const ledgerByMember = new Map(
    (ledger ?? []).map((row: { member_id: string; points_earned: number; points_target: number; debt: number }) => [
      row.member_id,
      row,
    ])
  );
  return (members ?? []).map((m: { id: string; name: string }) => {
    const row = ledgerByMember.get(m.id);
    return {
      member_id: m.id,
      name: m.name,
      points_earned: row?.points_earned ?? 0,
      points_target: row?.points_target ?? 0,
      debt: row?.debt ?? 0,
    };
  });
}

export async function getOpenMissions(houseId: string): Promise<OpenMission[]> {
  const { data, error } = await supabase
    .from('mission_instances')
    .select('id, title, points')
    .eq('house_id', houseId)
    .eq('status', 'open')
    .is('assigned_to', null);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as OpenMission[];
}

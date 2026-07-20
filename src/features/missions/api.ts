import { supabase } from '../../lib/supabase';

export type MissionCategory = 'dishes' | 'clean' | 'laundry' | 'trash' | 'shop' | 'pets' | 'garden' | 'bath' | 'other';
export type AssignmentMode = 'auto' | 'direct';

export interface Mission {
  id: string;
  house_id: string;
  title: string;
  category: MissionCategory;
  points: number;
  proposed_points: number | null;
  proposed_due_date: string | null;
  proposed_by: string | null;
  due_date: string;
  assigned_to: string | null;
  status: 'pending_approval' | 'open' | 'assigned' | 'done' | 'rejected';
  created_by: string;
  assignment_mode: AssignmentMode;
  approved_by: string | null;
  approved_at: string | null;
}

export interface SuggestMissionInput {
  house_id: string;
  category: MissionCategory;
  title: string;
  points: number;
  due_date: string;
  assignment_mode: AssignmentMode;
  target_member_id?: string;
}

async function throwFromInvokeError(data: unknown, error: { message: string; context?: Response }): Promise<never> {
  const body = error.context ? await error.context.json().catch(() => null) : null;
  throw new Error((body as { error?: string } | null)?.error ?? error.message);
}

export async function suggestMission(input: SuggestMissionInput): Promise<{ mission: Mission }> {
  const { data, error } = await supabase.functions.invoke('suggest-mission', { body: input });
  if (error) {
    return throwFromInvokeError(data, error);
  }
  return data;
}

export async function editMissionPoints(missionInstanceId: string, points: number): Promise<{ mission: Mission }> {
  const { data, error } = await supabase.functions.invoke('edit-mission-points', {
    body: { mission_instance_id: missionInstanceId, points },
  });
  if (error) {
    return throwFromInvokeError(data, error);
  }
  return data;
}

export async function editMissionSchedule(missionInstanceId: string, dueDate: string): Promise<{ mission: Mission }> {
  const { data, error } = await supabase.functions.invoke('edit-mission-schedule', {
    body: { mission_instance_id: missionInstanceId, due_date: dueDate },
  });
  if (error) {
    return throwFromInvokeError(data, error);
  }
  return data;
}

export async function resolveSuggestion(
  suggestionType: 'new_mission' | 'points_edit' | 'schedule_edit',
  missionInstanceId: string,
  decision: 'approve' | 'reject'
): Promise<{ mission: Mission }> {
  const { data, error } = await supabase.functions.invoke('resolve-suggestion', {
    body: { suggestion_type: suggestionType, mission_instance_id: missionInstanceId, decision },
  });
  if (error) {
    return throwFromInvokeError(data, error);
  }
  return data;
}

export async function completeMission(missionInstanceId: string): Promise<{ mission: Mission }> {
  const { data, error } = await supabase.functions.invoke('complete-mission', {
    body: { mission_instance_id: missionInstanceId },
  });
  if (error) {
    return throwFromInvokeError(data, error);
  }
  return data;
}

export async function getTodayMissions(houseId: string, memberId: string): Promise<Mission[]> {
  const { data, error } = await supabase
    .from('mission_instances')
    .select('*')
    .eq('house_id', houseId)
    .eq('assigned_to', memberId)
    .eq('status', 'assigned');
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Mission[];
}

export async function getMonthMissions(houseId: string, year: number, month: number): Promise<Mission[]> {
  const monthStr = String(month).padStart(2, '0');
  const daysInMonth = new Date(year, month, 0).getDate();
  const start = `${year}-${monthStr}-01`;
  const end = `${year}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('mission_instances')
    .select('*')
    .eq('house_id', houseId)
    .neq('status', 'rejected')
    .gte('due_date', start)
    .lte('due_date', end);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Mission[];
}

export async function getSuggestions(houseId: string): Promise<Mission[]> {
  const { data, error } = await supabase
    .from('mission_instances')
    .select('*')
    .eq('house_id', houseId)
    .or('status.eq.pending_approval,proposed_points.not.is.null,proposed_due_date.not.is.null');
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Mission[];
}

export async function getMyMembership(houseId: string): Promise<{ id: string; role: 'admin' | 'member' } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  const { data, error } = await supabase
    .from('members')
    .select('id, role')
    .eq('house_id', houseId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function getHouseMembers(
  houseId: string
): Promise<{ id: string; name: string; role: 'admin' | 'member' }[]> {
  const { data, error } = await supabase.from('members').select('id, name, role').eq('house_id', houseId);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as { id: string; name: string; role: 'admin' | 'member' }[];
}

export async function getMyHouseId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  const { data, error } = await supabase.from('members').select('house_id').eq('user_id', user.id).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.house_id ?? null;
}

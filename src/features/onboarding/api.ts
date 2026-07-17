import { supabase } from '../../lib/supabase';

export interface House {
  id: string;
  invite_code: string;
}

export interface Member {
  id: string;
  role: 'admin' | 'member';
  house_id?: string;
}

export async function createHouse(
  houseName: string,
  adminName: string
): Promise<{ house: House; member: Member }> {
  const { data, error } = await supabase.functions.invoke('create-house', {
    body: { house_name: houseName, admin_name: adminName },
  });
  if (error) {
    throw new Error(data?.error ?? error.message);
  }
  return data;
}

export async function joinHouse(
  inviteCode: string,
  name: string
): Promise<{ member: Member }> {
  const { data, error } = await supabase.functions.invoke('join-house', {
    body: { invite_code: inviteCode, name },
  });
  if (error) {
    throw new Error(data?.error ?? error.message);
  }
  return data;
}

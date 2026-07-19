import { supabase } from '../../lib/supabase';

export interface SwapRequest {
  id: string;
  house_id: string;
  mission_instance_id: string;
  from_member: string;
  to_member: string;
  status: 'pending' | 'accepted' | 'approved' | 'rejected';
  approved_by: string | null;
}

export interface UnavailabilityRequest {
  id: string;
  house_id: string;
  member_id: string;
  period_start: string;
  period_end: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
}

async function throwFromInvokeError(error: { message: string; context?: Response }): Promise<never> {
  const body = error.context ? await error.context.json().catch(() => null) : null;
  throw new Error((body as { error?: string } | null)?.error ?? error.message);
}

export async function suggestSwap(missionInstanceId: string, toMemberId: string): Promise<{ swap: SwapRequest }> {
  const { data, error } = await supabase.functions.invoke('suggest-swap', {
    body: { mission_instance_id: missionInstanceId, to_member_id: toMemberId },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function respondSwap(
  swapRequestId: string,
  decision: 'accept' | 'decline'
): Promise<{ swap: SwapRequest }> {
  const { data, error } = await supabase.functions.invoke('respond-swap', {
    body: { swap_request_id: swapRequestId, decision },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function resolveSwap(
  swapRequestId: string,
  decision: 'approve' | 'reject'
): Promise<{ swap: SwapRequest }> {
  const { data, error } = await supabase.functions.invoke('resolve-swap', {
    body: { swap_request_id: swapRequestId, decision },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function suggestUnavailability(
  houseId: string,
  periodStart: string,
  periodEnd: string,
  reason?: string
): Promise<{ unavailability: UnavailabilityRequest }> {
  const { data, error } = await supabase.functions.invoke('suggest-unavailability', {
    body: { house_id: houseId, period_start: periodStart, period_end: periodEnd, reason },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function resolveUnavailability(
  unavailabilityRequestId: string,
  decision: 'approve' | 'reject'
): Promise<{ unavailability: UnavailabilityRequest }> {
  const { data, error } = await supabase.functions.invoke('resolve-unavailability', {
    body: { unavailability_request_id: unavailabilityRequestId, decision },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data;
}

export async function getMyIncomingSwaps(houseId: string, memberId: string): Promise<SwapRequest[]> {
  const { data, error } = await supabase
    .from('swap_requests')
    .select('*')
    .eq('house_id', houseId)
    .eq('to_member', memberId)
    .eq('status', 'pending');
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as SwapRequest[];
}

export async function getPendingSwapsForAdmin(houseId: string): Promise<SwapRequest[]> {
  const { data, error } = await supabase
    .from('swap_requests')
    .select('*')
    .eq('house_id', houseId)
    .eq('status', 'accepted');
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as SwapRequest[];
}

export async function getPendingUnavailability(houseId: string): Promise<UnavailabilityRequest[]> {
  const { data, error } = await supabase
    .from('unavailability_requests')
    .select('*')
    .eq('house_id', houseId)
    .eq('status', 'pending');
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as UnavailabilityRequest[];
}

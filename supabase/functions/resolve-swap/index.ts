import { createClient } from 'npm:@supabase/supabase-js@2';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { swap_request_id, decision } = await req.json();
  if (!swap_request_id || !decision) {
    return new Response(JSON.stringify({ error: 'swap_request_id_and_decision_required' }), { status: 400 });
  }
  if (decision !== 'approve' && decision !== 'reject') {
    return new Response(JSON.stringify({ error: 'invalid_decision' }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'invalid_session' }), { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'bayit_shave' } });

  const { data: swap, error: swapError } = await admin
    .from('swap_requests')
    .select('id, house_id, mission_instance_id, to_member, status, created_at')
    .eq('id', swap_request_id)
    .maybeSingle();
  if (swapError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!swap) {
    return new Response(JSON.stringify({ error: 'swap_not_found' }), { status: 404 });
  }

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id, role')
    .eq('house_id', swap.house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember || callerMember.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403 });
  }

  if (swap.status !== 'accepted') {
    return new Response(JSON.stringify({ error: 'not_accepted_yet' }), { status: 409 });
  }

  const ageMs = Date.now() - new Date(swap.created_at).getTime();
  if (ageMs > SEVEN_DAYS_MS) {
    await admin.from('swap_requests').update({ status: 'rejected' }).eq('id', swap_request_id);
    return new Response(JSON.stringify({ error: 'swap_expired' }), { status: 410 });
  }

  if (decision === 'reject') {
    const { data: updated, error: updateError } = await admin
      .from('swap_requests')
      .update({ status: 'rejected', approved_by: callerMember.id })
      .eq('id', swap_request_id)
      .select()
      .single();
    if (updateError) {
      return new Response(JSON.stringify({ error: 'resolve_failed' }), { status: 500 });
    }
    return new Response(JSON.stringify({ swap: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { error: missionUpdateError } = await admin
    .from('mission_instances')
    .update({ assigned_to: swap.to_member })
    .eq('id', swap.mission_instance_id);
  if (missionUpdateError) {
    return new Response(JSON.stringify({ error: 'mission_transfer_failed' }), { status: 500 });
  }

  const { data: updated, error: updateError } = await admin
    .from('swap_requests')
    .update({ status: 'approved', approved_by: callerMember.id })
    .eq('id', swap_request_id)
    .select()
    .single();
  if (updateError) {
    return new Response(JSON.stringify({ error: 'resolve_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ swap: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

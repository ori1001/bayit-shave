import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { unavailability_request_id, decision } = await req.json();
  if (!unavailability_request_id || !decision) {
    return new Response(JSON.stringify({ error: 'unavailability_request_id_and_decision_required' }), { status: 400 });
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

  const { data: unavailability, error: fetchError } = await admin
    .from('unavailability_requests')
    .select('id, house_id, status')
    .eq('id', unavailability_request_id)
    .maybeSingle();
  if (fetchError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!unavailability) {
    return new Response(JSON.stringify({ error: 'unavailability_not_found' }), { status: 404 });
  }

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id, role')
    .eq('house_id', unavailability.house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember || callerMember.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403 });
  }

  if (unavailability.status !== 'pending') {
    return new Response(JSON.stringify({ error: 'not_pending' }), { status: 409 });
  }

  const { data: updated, error: updateError } = await admin
    .from('unavailability_requests')
    .update({ status: decision === 'approve' ? 'approved' : 'rejected', approved_by: callerMember.id })
    .eq('id', unavailability_request_id)
    .select()
    .single();
  if (updateError) {
    return new Response(JSON.stringify({ error: 'resolve_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ unavailability: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { house_id, period_start, period_end, reason } = await req.json();
  if (!house_id || !period_start || !period_end) {
    return new Response(JSON.stringify({ error: 'house_id_period_start_and_period_end_required' }), { status: 400 });
  }
  if (period_end < period_start) {
    return new Response(JSON.stringify({ error: 'period_end_before_period_start' }), { status: 400 });
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

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id')
    .eq('house_id', house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember) {
    return new Response(JSON.stringify({ error: 'not_a_member_of_this_house' }), { status: 403 });
  }

  const { data: unavailability, error: insertError } = await admin
    .from('unavailability_requests')
    .insert({
      house_id,
      member_id: callerMember.id,
      period_start,
      period_end,
      reason: reason ?? null,
      status: 'pending',
    })
    .select()
    .single();
  if (insertError) {
    return new Response(JSON.stringify({ error: 'unavailability_creation_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ unavailability }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

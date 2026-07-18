import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { mission_instance_id } = await req.json();
  if (!mission_instance_id) {
    return new Response(JSON.stringify({ error: 'mission_instance_id_required' }), { status: 400 });
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

  const { data: mission, error: missionError } = await admin
    .from('mission_instances')
    .select('id, house_id, status, assigned_to, points')
    .eq('id', mission_instance_id)
    .maybeSingle();
  if (missionError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!mission) {
    return new Response(JSON.stringify({ error: 'mission_not_found' }), { status: 404 });
  }

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id')
    .eq('house_id', mission.house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember || mission.assigned_to !== callerMember.id) {
    return new Response(JSON.stringify({ error: 'not_assigned_to_you' }), { status: 403 });
  }
  if (mission.status !== 'assigned') {
    return new Response(JSON.stringify({ error: 'not_assigned_status' }), { status: 409 });
  }

  const { data: updated, error: updateError } = await admin
    .from('mission_instances')
    .update({ status: 'done' })
    .eq('id', mission_instance_id)
    .select()
    .single();
  if (updateError) {
    return new Response(JSON.stringify({ error: 'complete_failed' }), { status: 500 });
  }

  const { data: existingLedger } = await admin
    .from('points_ledger')
    .select('points_earned')
    .eq('house_id', mission.house_id)
    .eq('member_id', callerMember.id)
    .maybeSingle();

  if (existingLedger) {
    const { error: ledgerError } = await admin
      .from('points_ledger')
      .update({ points_earned: existingLedger.points_earned + mission.points })
      .eq('house_id', mission.house_id)
      .eq('member_id', callerMember.id);
    if (ledgerError) {
      await admin.from('mission_instances').update({ status: 'assigned' }).eq('id', mission_instance_id);
      return new Response(JSON.stringify({ error: 'ledger_update_failed' }), { status: 500 });
    }
  } else {
    const { error: ledgerInsertError } = await admin
      .from('points_ledger')
      .insert({ house_id: mission.house_id, member_id: callerMember.id, points_earned: mission.points });
    if (ledgerInsertError) {
      await admin.from('mission_instances').update({ status: 'assigned' }).eq('id', mission_instance_id);
      return new Response(JSON.stringify({ error: 'ledger_insert_failed' }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ mission: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { mission_instance_id, due_date, assigned_to } = await req.json();
  if (!mission_instance_id) {
    return new Response(JSON.stringify({ error: 'mission_instance_id_required' }), { status: 400 });
  }
  // A schedule edit may move the day, the assignee, or both -- but not neither.
  if (!due_date && !assigned_to) {
    return new Response(JSON.stringify({ error: 'due_date_or_assigned_to_required' }), { status: 400 });
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
    .select('id, house_id, assigned_to')
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
    .select('id, role')
    .eq('house_id', mission.house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember) {
    return new Response(JSON.stringify({ error: 'not_a_member_of_this_house' }), { status: 403 });
  }

  const isAdmin = callerMember.role === 'admin';
  if (!isAdmin && mission.assigned_to !== callerMember.id) {
    return new Response(JSON.stringify({ error: 'not_assigned_to_you' }), { status: 403 });
  }

  // A mission may only be handed to someone in the same house. Checked server
  // side because the client's member list is just a rendering convenience.
  if (assigned_to) {
    const { data: target, error: targetError } = await admin
      .from('members')
      .select('id')
      .eq('id', assigned_to)
      .eq('house_id', mission.house_id)
      .maybeSingle();
    if (targetError) {
      return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
    }
    if (!target) {
      return new Response(JSON.stringify({ error: 'target_not_in_house' }), { status: 400 });
    }
  }

  const applied: Record<string, unknown> = {
    proposed_due_date: null,
    proposed_assigned_to: null,
    proposed_by: null,
    approved_by: callerMember.id,
    approved_at: new Date().toISOString(),
  };
  if (due_date) applied.due_date = due_date;
  if (assigned_to) applied.assigned_to = assigned_to;

  const proposed: Record<string, unknown> = { proposed_by: callerMember.id };
  if (due_date) proposed.proposed_due_date = due_date;
  if (assigned_to) proposed.proposed_assigned_to = assigned_to;

  const { data: updated, error: updateError } = await admin
    .from('mission_instances')
    .update(isAdmin ? applied : proposed)
    .eq('id', mission_instance_id)
    .select()
    .single();

  if (updateError) {
    return new Response(JSON.stringify({ error: 'schedule_edit_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ mission: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

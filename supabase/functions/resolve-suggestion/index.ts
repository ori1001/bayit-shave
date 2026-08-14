import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { suggestion_type, mission_instance_id, decision } = await req.json();
  if (!suggestion_type || !mission_instance_id || !decision) {
    return new Response(JSON.stringify({ error: 'missing_required_fields' }), { status: 400 });
  }
  if (suggestion_type !== 'new_mission' && suggestion_type !== 'points_edit' && suggestion_type !== 'schedule_edit') {
    return new Response(JSON.stringify({ error: 'invalid_suggestion_type' }), { status: 400 });
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

  const { data: mission, error: missionError } = await admin
    .from('mission_instances')
    .select('*')
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
  if (!callerMember || callerMember.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403 });
  }

  let updatePayload: Record<string, unknown>;

  if (suggestion_type === 'new_mission') {
    if (mission.status !== 'pending_approval') {
      return new Response(JSON.stringify({ error: 'mission_not_pending' }), { status: 409 });
    }
    updatePayload =
      decision === 'approve'
        ? {
            status: mission.assignment_mode === 'direct' ? 'assigned' : 'open',
            approved_by: callerMember.id,
            approved_at: new Date().toISOString(),
          }
        : { status: 'rejected', approved_by: callerMember.id, approved_at: new Date().toISOString() };
  } else if (suggestion_type === 'points_edit') {
    if (mission.proposed_points === null || mission.proposed_points === undefined) {
      return new Response(JSON.stringify({ error: 'no_pending_points_edit' }), { status: 409 });
    }
    updatePayload =
      decision === 'approve'
        ? {
            points: mission.proposed_points,
            proposed_points: null,
            proposed_by: null,
            approved_by: callerMember.id,
            approved_at: new Date().toISOString(),
          }
        : { proposed_points: null, proposed_by: null };
  } else {
    // A schedule edit carries a new day, a new assignee, or both.
    if (!mission.proposed_due_date && !mission.proposed_assigned_to) {
      return new Response(JSON.stringify({ error: 'no_pending_schedule_edit' }), { status: 409 });
    }
    if (decision === 'approve') {
      updatePayload = {
        proposed_due_date: null,
        proposed_assigned_to: null,
        proposed_by: null,
        approved_by: callerMember.id,
        approved_at: new Date().toISOString(),
      };
      if (mission.proposed_due_date) {
        updatePayload.due_date = mission.proposed_due_date;
      }
      if (mission.proposed_assigned_to) {
        updatePayload.assigned_to = mission.proposed_assigned_to;
      }
    } else {
      updatePayload = { proposed_due_date: null, proposed_assigned_to: null, proposed_by: null };
    }
  }

  const { data: updated, error: updateError } = await admin
    .from('mission_instances')
    .update(updatePayload)
    .eq('id', mission_instance_id)
    .select()
    .single();

  if (updateError) {
    return new Response(JSON.stringify({ error: 'resolve_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ mission: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

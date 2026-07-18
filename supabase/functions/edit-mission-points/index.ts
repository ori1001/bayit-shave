import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { mission_instance_id, points } = await req.json();
  if (!mission_instance_id || !points) {
    return new Response(JSON.stringify({ error: 'mission_instance_id_and_points_required' }), { status: 400 });
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
    .select('id, house_id, status')
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

  const { data: updated, error: updateError } = await admin
    .from('mission_instances')
    .update(
      isAdmin
        ? { points, proposed_points: null, proposed_by: null, approved_by: callerMember.id, approved_at: new Date().toISOString() }
        : { proposed_points: points, proposed_by: callerMember.id }
    )
    .eq('id', mission_instance_id)
    .select()
    .single();

  if (updateError) {
    return new Response(JSON.stringify({ error: 'points_edit_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ mission: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

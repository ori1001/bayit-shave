import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { house_id, category, title, points, due_date, assignment_mode, target_member_id } = await req.json();
  if (!house_id || !category || !title || !points || !due_date || !assignment_mode) {
    return new Response(JSON.stringify({ error: 'missing_required_fields' }), { status: 400 });
  }
  if (assignment_mode !== 'auto' && assignment_mode !== 'direct') {
    return new Response(JSON.stringify({ error: 'invalid_assignment_mode' }), { status: 400 });
  }
  if (assignment_mode === 'direct' && !target_member_id) {
    return new Response(JSON.stringify({ error: 'target_member_id_required_for_direct' }), { status: 400 });
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
    .select('id, role')
    .eq('house_id', house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember) {
    return new Response(JSON.stringify({ error: 'not_a_member_of_this_house' }), { status: 403 });
  }

  if (assignment_mode === 'direct') {
    const { data: targetMember, error: targetError } = await admin
      .from('members')
      .select('id')
      .eq('house_id', house_id)
      .eq('id', target_member_id)
      .maybeSingle();
    if (targetError) {
      return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
    }
    if (!targetMember) {
      return new Response(JSON.stringify({ error: 'target_member_not_in_house' }), { status: 400 });
    }
  }

  const isAdmin = callerMember.role === 'admin';
  const status = isAdmin ? (assignment_mode === 'direct' ? 'assigned' : 'open') : 'pending_approval';
  const assigned_to = assignment_mode === 'direct' ? target_member_id : null;

  const { data: mission, error: insertError } = await admin
    .from('mission_instances')
    .insert({
      house_id,
      title,
      category,
      points,
      due_date,
      status,
      created_by: callerMember.id,
      assignment_mode,
      assigned_to,
      approved_by: isAdmin ? callerMember.id : null,
      approved_at: isAdmin ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (insertError) {
    return new Response(JSON.stringify({ error: 'mission_creation_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ mission }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

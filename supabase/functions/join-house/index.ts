import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { invite_code, name } = await req.json();
  if (!invite_code || !name) {
    return new Response(JSON.stringify({ error: 'invite_code_and_name_required' }), { status: 400 });
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

  const { data: house, error: houseError } = await admin
    .from('houses')
    .select('id')
    .eq('invite_code', invite_code)
    .maybeSingle();

  if (houseError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!house) {
    return new Response(JSON.stringify({ error: 'invalid_invite_code' }), { status: 404 });
  }

  const { data: existing } = await admin
    .from('members')
    .select('id')
    .eq('house_id', house.id)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ error: 'already_a_member' }), { status: 409 });
  }

  const { data: member, error: insertError } = await admin
    .from('members')
    .insert({ house_id: house.id, user_id: userData.user.id, name, role: 'member' })
    .select()
    .single();

  if (insertError) {
    return new Response(JSON.stringify({ error: 'join_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ member }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

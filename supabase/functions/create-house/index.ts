import { createClient } from 'npm:@supabase/supabase-js@2';

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (no 0/O, 1/I)
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
  return code;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { house_name, admin_name } = await req.json();
  if (!house_name || !admin_name) {
    return new Response(JSON.stringify({ error: 'house_name_and_admin_name_required' }), { status: 400 });
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

  let house: { id: string; invite_code: string; admin_id: string | null } | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    const invite_code = generateInviteCode();
    const { data, error } = await admin
      .from('houses')
      .insert({ name: house_name, invite_code })
      .select()
      .single();
    if (!error) {
      house = data;
      break;
    }
    if (error.code !== '23505') {
      return new Response(JSON.stringify({ error: 'house_creation_failed' }), { status: 500 });
    }
    // 23505 = unique_violation on invite_code — retry with a fresh code
  }
  if (!house) {
    return new Response(JSON.stringify({ error: 'could_not_generate_unique_code' }), { status: 500 });
  }

  const { data: member, error: memberError } = await admin
    .from('members')
    .insert({ house_id: house.id, user_id: userData.user.id, name: admin_name, role: 'admin' })
    .select()
    .single();

  if (memberError) {
    await admin.from('houses').delete().eq('id', house.id);
    return new Response(JSON.stringify({ error: 'admin_member_creation_failed' }), { status: 500 });
  }

  const { error: adminIdError } = await admin
    .from('houses')
    .update({ admin_id: member.id })
    .eq('id', house.id);

  if (adminIdError) {
    return new Response(JSON.stringify({ error: 'admin_id_update_failed' }), { status: 500 });
  }

  house.admin_id = member.id;

  return new Response(JSON.stringify({ house, member }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

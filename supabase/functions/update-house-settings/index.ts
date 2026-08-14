import { createClient } from 'npm:@supabase/supabase-js@2';

const ASSIGNMENT_STRATEGIES = ['round_robin', 'points_based', 'manual'];
const BALANCE_PERIODS = ['weekly', 'monthly'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { house_id, assignment_strategy, balance_period, balance_day, member_weights } = await req.json();
  if (!house_id) {
    return new Response(JSON.stringify({ error: 'house_id_required' }), { status: 400 });
  }

  if (assignment_strategy !== undefined && !ASSIGNMENT_STRATEGIES.includes(assignment_strategy)) {
    return new Response(JSON.stringify({ error: 'invalid_assignment_strategy' }), { status: 400 });
  }
  if (balance_period !== undefined && !BALANCE_PERIODS.includes(balance_period)) {
    return new Response(JSON.stringify({ error: 'invalid_balance_period' }), { status: 400 });
  }
  if (balance_day !== undefined && (!Number.isInteger(balance_day) || balance_day < 0 || balance_day > 6)) {
    return new Response(JSON.stringify({ error: 'invalid_balance_day' }), { status: 400 });
  }
  if (member_weights !== undefined) {
    if (!Array.isArray(member_weights)) {
      return new Response(JSON.stringify({ error: 'invalid_member_weights' }), { status: 400 });
    }
    for (const entry of member_weights) {
      if (!entry?.member_id || typeof entry.weight !== 'number' || !(entry.weight > 0)) {
        return new Response(JSON.stringify({ error: 'invalid_member_weights' }), { status: 400 });
      }
    }
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
  // House configuration is admin-only per the spec. Enforced here rather than
  // in the client, since the client cannot be trusted and RLS grants members
  // no update path on houses at all.
  if (callerMember.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403 });
  }

  const houseUpdate: Record<string, unknown> = {};
  if (assignment_strategy !== undefined) houseUpdate.assignment_strategy = assignment_strategy;
  if (balance_period !== undefined) houseUpdate.balance_period = balance_period;
  if (balance_day !== undefined) houseUpdate.balance_day = balance_day;

  let house = null;
  if (Object.keys(houseUpdate).length > 0) {
    const { data, error } = await admin.from('houses').update(houseUpdate).eq('id', house_id).select().single();
    if (error) {
      return new Response(JSON.stringify({ error: 'house_update_failed' }), { status: 500 });
    }
    house = data;
  } else {
    const { data } = await admin.from('houses').select().eq('id', house_id).maybeSingle();
    house = data;
  }

  // Weight only ever affects future points_target increments -- the ledger is
  // deliberately left alone so a weight change never retroactively rebalances
  // targets already accrued.
  if (member_weights?.length) {
    for (const entry of member_weights) {
      const { error } = await admin
        .from('members')
        .update({ weight: entry.weight })
        .eq('id', entry.member_id)
        .eq('house_id', house_id);
      if (error) {
        return new Response(JSON.stringify({ error: 'member_weight_update_failed' }), { status: 500 });
      }
    }
  }

  const { data: members } = await admin
    .from('members')
    .select('id, name, role, weight')
    .eq('house_id', house_id);

  return new Response(JSON.stringify({ house, members: members ?? [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

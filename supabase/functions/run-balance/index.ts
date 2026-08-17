import { createClient } from 'npm:@supabase/supabase-js@2';
import { planBalanceRun, type LedgerRow } from '../_shared/balance-strategy.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { house_id } = await req.json();
  if (!house_id) {
    return new Response(JSON.stringify({ error: 'house_id_required' }), { status: 400 });
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
    .select('id, assignment_strategy, round_robin_cursor')
    .eq('id', house_id)
    .maybeSingle();
  if (houseError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!house) {
    return new Response(JSON.stringify({ error: 'house_not_found' }), { status: 404 });
  }

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id, role')
    .eq('house_id', house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember || callerMember.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403 });
  }

  const { data: openMissions, error: missionsError } = await admin
    .from('mission_instances')
    .select('id, points, template_id')
    .eq('house_id', house_id)
    .eq('status', 'open')
    .is('assigned_to', null)
    .order('id', { ascending: true });
  if (missionsError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }

  const { data: members, error: membersError } = await admin
    .from('members')
    .select('id, weight')
    .eq('house_id', house_id)
    .order('id', { ascending: true });
  if (membersError || !members || members.length === 0) {
    return new Response(JSON.stringify({ error: 'no_members_found' }), { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: activeUnavailability, error: unavailabilityError } = await admin
    .from('unavailability_requests')
    .select('member_id')
    .eq('house_id', house_id)
    .eq('status', 'approved')
    .lte('period_start', today)
    .gte('period_end', today);
  if (unavailabilityError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }

  // A template may restrict its rotation to a subset of the house. Null means
  // everyone, which is why this is a lookup rather than a default-empty set.
  const { data: templateRows, error: templateError } = await admin
    .from('mission_templates')
    .select('id, eligible_members')
    .eq('house_id', house_id);
  if (templateError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }

  const { data: ledgerRows } = await admin
    .from('points_ledger')
    .select('member_id, points_earned, points_target, debt')
    .eq('house_id', house_id);

  // Everything above is a read; everything below is the plan and its writes.
  // The decision itself lives in _shared/balance-strategy.ts so it can be
  // tested without a database.
  const plan = planBalanceRun({
    strategy: house.assignment_strategy,
    members: members.map((m) => ({ id: m.id, weight: Number(m.weight) })),
    unavailableMemberIds: (activeUnavailability ?? []).map((u) => u.member_id),
    missions: openMissions ?? [],
    eligibleByTemplate: Object.fromEntries((templateRows ?? []).map((t) => [t.id, t.eligible_members ?? null])),
    ledger: (ledgerRows ?? []) as LedgerRow[],
    roundRobinCursor: house.round_robin_cursor,
  });

  // One call, one transaction, one advisory lock on the house. Claiming the
  // missions and advancing the ledger have to happen together: separately, a
  // second run overlapping this one claims nothing but still credits a whole
  // pool's worth of targets. It returns only the assignments it actually won.
  const poolPoints = (openMissions ?? []).reduce((sum, m) => sum + m.points, 0);
  const { data: assigned, error: applyError } = await admin.rpc('apply_balance_run', {
    target_house_id: house_id,
    assignments: plan.assignments,
    entries: plan.ledgerEntries,
    pool_points: poolPoints,
  });
  if (applyError) {
    return new Response(JSON.stringify({ error: 'balance_apply_failed' }), { status: 500 });
  }

  const claimed = (assigned ?? []) as { mission_id: string; member_id: string }[];

  if (house.assignment_strategy === 'round_robin' && claimed.length > 0) {
    await admin.from('houses').update({ round_robin_cursor: plan.roundRobinCursor }).eq('id', house_id);
  }

  return new Response(JSON.stringify({ assigned: claimed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

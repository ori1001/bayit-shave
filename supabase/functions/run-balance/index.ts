import { createClient } from 'npm:@supabase/supabase-js@2';

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

  if (house.assignment_strategy === 'manual') {
    return new Response(JSON.stringify({ assigned: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
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
  if (!openMissions || openMissions.length === 0) {
    return new Response(JSON.stringify({ assigned: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
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
  const unavailableMemberIds = new Set((activeUnavailability ?? []).map((u) => u.member_id));
  const availableMembers = members.filter((m) => !unavailableMemberIds.has(m.id));

  // A template may restrict its rotation to a subset of the house. Null means
  // everyone, which is why this is a lookup rather than a default-empty set.
  const { data: templateRows, error: templateError } = await admin
    .from('mission_templates')
    .select('id, eligible_members')
    .eq('house_id', house_id);
  if (templateError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  const eligibleByTemplate = new Map<string, string[] | null>(
    (templateRows ?? []).map((t) => [t.id, t.eligible_members ?? null])
  );

  function candidatesFor(mission: { template_id?: string | null }): typeof availableMembers {
    const eligible = mission.template_id ? eligibleByTemplate.get(mission.template_id) : null;
    if (!eligible || eligible.length === 0) {
      return availableMembers;
    }
    return availableMembers.filter((m) => eligible.includes(m.id));
  }

  const assigned: { mission_id: string; member_id: string }[] = [];

  if (availableMembers.length === 0) {
    // Everyone eligible to receive missions is currently unavailable — nothing to assign
    // this run, but the target/debt accounting below still needs to run for everyone.
  } else if (house.assignment_strategy === 'round_robin') {
    let startIndex = 0;
    if (house.round_robin_cursor) {
      const cursorIndex = availableMembers.findIndex((m) => m.id === house.round_robin_cursor);
      startIndex = cursorIndex >= 0 ? (cursorIndex + 1) % availableMembers.length : 0;
    }
    let cursor = startIndex;
    for (const mission of openMissions) {
      const candidates = candidatesFor(mission);
      if (candidates.length === 0) {
        // Nobody in this template's subset is available; leave it in the pool
        // rather than handing it to someone who is not eligible for it.
        continue;
      }
      // Keep the house-wide rotation, but skip past anyone outside this
      // template's subset so restricted chores don't reset the cursor.
      let member = availableMembers[cursor];
      for (let step = 0; step < availableMembers.length; step++) {
        const candidate = availableMembers[(cursor + step) % availableMembers.length];
        if (candidates.some((c) => c.id === candidate.id)) {
          member = candidate;
          cursor = (cursor + step) % availableMembers.length;
          break;
        }
      }
      const { error: assignError } = await admin
        .from('mission_instances')
        .update({ assigned_to: member.id, status: 'assigned' })
        .eq('id', mission.id);
      if (!assignError) {
        assigned.push({ mission_id: mission.id, member_id: member.id });
      }
      cursor = (cursor + 1) % availableMembers.length;
    }
    const lastAssignedMemberId = assigned.length > 0 ? assigned[assigned.length - 1].member_id : house.round_robin_cursor;
    await admin.from('houses').update({ round_robin_cursor: lastAssignedMemberId }).eq('id', house_id);
  } else {
    const { data: ledgerRows } = await admin
      .from('points_ledger')
      .select('member_id, points_earned, points_target, debt')
      .eq('house_id', house_id);

    const ledgerByMember = new Map((ledgerRows ?? []).map((r) => [r.member_id, r]));
    const totalWeight = members.reduce((sum, m) => sum + Number(m.weight), 0);
    const poolPoints = openMissions.reduce((sum, m) => sum + m.points, 0);

    const projectedDeficit = new Map<string, number>();
    for (const member of availableMembers) {
      const ledger = ledgerByMember.get(member.id);
      const earned = ledger?.points_earned ?? 0;
      const target = ledger?.points_target ?? 0;
      const debt = ledger?.debt ?? 0;
      const shareOfPool = (Number(member.weight) / totalWeight) * poolPoints;
      const newTarget = Number(target) + shareOfPool;
      projectedDeficit.set(member.id, newTarget + Number(debt) - Number(earned));
    }

    for (const mission of openMissions) {
      const candidates = candidatesFor(mission);
      if (candidates.length === 0) {
        // No eligible member available: leave it open rather than assigning
        // outside the template's subset just because someone is furthest behind.
        continue;
      }
      let pickedMember = candidates[0];
      let highestDeficit = -Infinity;
      for (const member of candidates) {
        const deficit = projectedDeficit.get(member.id) ?? 0;
        if (deficit > highestDeficit) {
          highestDeficit = deficit;
          pickedMember = member;
        }
      }
      const { error: assignError } = await admin
        .from('mission_instances')
        .update({ assigned_to: pickedMember.id, status: 'assigned' })
        .eq('id', mission.id);
      if (!assignError) {
        assigned.push({ mission_id: mission.id, member_id: pickedMember.id });
        projectedDeficit.set(pickedMember.id, (projectedDeficit.get(pickedMember.id) ?? 0) - mission.points);
      }
    }
  }

  if (house.assignment_strategy === 'points_based') {
    const { data: ledgerRows } = await admin
      .from('points_ledger')
      .select('member_id, points_earned, points_target, debt')
      .eq('house_id', house_id);
    const ledgerByMember = new Map((ledgerRows ?? []).map((r) => [r.member_id, r]));
    const totalWeight = members.reduce((sum, m) => sum + Number(m.weight), 0);
    const poolPoints = openMissions.reduce((sum, m) => sum + m.points, 0);

    for (const member of members) {
      const shareOfPool = (Number(member.weight) / totalWeight) * poolPoints;
      const existing = ledgerByMember.get(member.id);
      const isUnavailable = unavailableMemberIds.has(member.id);

      if (existing) {
        const update = isUnavailable
          ? { debt: Number(existing.debt) + Math.round(shareOfPool) }
          : { points_target: Number(existing.points_target) + shareOfPool };
        await admin.from('points_ledger').update(update).eq('house_id', house_id).eq('member_id', member.id);
      } else {
        await admin.from('points_ledger').insert({
          house_id,
          member_id: member.id,
          points_earned: 0,
          points_target: isUnavailable ? 0 : shareOfPool,
          debt: isUnavailable ? Math.round(shareOfPool) : 0,
        });
      }
    }
  }

  return new Response(JSON.stringify({ assigned }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

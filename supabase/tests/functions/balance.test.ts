import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'bayit_shave' } });

async function signUpAndSignIn(email: string): Promise<string> {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const password = 'Test1234!';
  await client.auth.signUp({ email, password });
  const { data } = await client.auth.signInWithPassword({ email, password });
  return data.session!.access_token;
}

async function seedHouseWithStrategy(strategy: 'round_robin' | 'points_based' | 'manual') {
  const adminToken = await signUpAndSignIn(`admin+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Balance Test House', admin_name: 'Admin' }),
  });
  const { house, member: adminMember } = await createRes.json();

  const memberToken = await signUpAndSignIn(`member+${crypto.randomUUID()}@example.com`);
  const joinRes = await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: house.invite_code, name: 'Member' }),
  });
  const { member } = await joinRes.json();

  await admin.from('houses').update({ assignment_strategy: strategy }).eq('id', house.id);

  return { house, adminToken, adminMember, memberToken, member };
}

async function seedOpenMission(houseId: string, adminToken: string, points: number, title: string) {
  const res = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: houseId,
      category: 'other',
      title,
      points,
      due_date: '2026-07-25',
      assignment_mode: 'auto',
    }),
  });
  const { mission } = await res.json();
  return mission;
}

Deno.test('run-balance: manual strategy is a no-op', async () => {
  const { house, adminToken } = await seedHouseWithStrategy('manual');
  await seedOpenMission(house.id, adminToken, 10, 'Wash dishes');

  const res = await fetch(`${FUNCTIONS_URL}/run-balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id }),
  });
  assertEquals(res.status, 200);
  const { assigned } = await res.json();
  assertEquals(assigned.length, 0);

  const { data: mission } = await admin.from('mission_instances').select('status').eq('house_id', house.id).single();
  assertEquals(mission!.status, 'open');
});

Deno.test('run-balance: round_robin alternates between the two house members', async () => {
  const { house, adminToken, adminMember, member } = await seedHouseWithStrategy('round_robin');
  await seedOpenMission(house.id, adminToken, 10, 'Mission A');
  await seedOpenMission(house.id, adminToken, 10, 'Mission B');

  const res = await fetch(`${FUNCTIONS_URL}/run-balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id }),
  });
  assertEquals(res.status, 200);
  const { assigned } = await res.json();
  assertEquals(assigned.length, 2);

  const assignedMemberIds = new Set(assigned.map((a: { member_id: string }) => a.member_id));
  assertEquals(assignedMemberIds.size, 2);
  assertEquals(assignedMemberIds.has(adminMember.id), true);
  assertEquals(assignedMemberIds.has(member.id), true);

  const { data: houseRow } = await admin.from('houses').select('round_robin_cursor').eq('id', house.id).single();
  assertEquals(houseRow!.round_robin_cursor, assigned[1].member_id);
});

Deno.test('run-balance: points_based assigns to whoever is furthest behind', async () => {
  const { house, adminToken, adminMember, member } = await seedHouseWithStrategy('points_based');

  // Deliberately asymmetric even before this run's pool-share is added, so the
  // outcome can never land on an exact tie regardless of which member's
  // randomly-generated UUID happens to sort first in the query's `order by id`:
  // admin is already 20 points ahead of their target, member is 30 behind.
  await admin.from('points_ledger').insert({ house_id: house.id, member_id: adminMember.id, points_earned: 50, points_target: 30, debt: 0 });
  await admin.from('points_ledger').insert({ house_id: house.id, member_id: member.id, points_earned: 0, points_target: 30, debt: 0 });

  await seedOpenMission(house.id, adminToken, 15, 'Should go to the behind member');

  const res = await fetch(`${FUNCTIONS_URL}/run-balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id }),
  });
  assertEquals(res.status, 200);
  const { assigned } = await res.json();
  assertEquals(assigned.length, 1);
  assertEquals(assigned[0].member_id, member.id);

  const { data: mission } = await admin
    .from('mission_instances')
    .select('status, assigned_to')
    .eq('id', assigned[0].mission_id)
    .single();
  assertEquals(mission!.status, 'assigned');
  assertEquals(mission!.assigned_to, member.id);
});

Deno.test('assign-mission: admin manually assigns an open mission; non-admin is rejected', async () => {
  const { house, adminToken, memberToken, member } = await seedHouseWithStrategy('manual');
  const mission = await seedOpenMission(house.id, adminToken, 12, 'Manual assign target');

  const forbidden = await fetch(`${FUNCTIONS_URL}/assign-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, member_id: member.id }),
  });
  assertEquals(forbidden.status, 403);

  const res = await fetch(`${FUNCTIONS_URL}/assign-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, member_id: member.id }),
  });
  assertEquals(res.status, 200);
  const { mission: assigned } = await res.json();
  assertEquals(assigned.status, 'assigned');
  assertEquals(assigned.assigned_to, member.id);
});

Deno.test('assign-mission: reassigning a done mission is rejected with 409', async () => {
  const { house, adminToken, member } = await seedHouseWithStrategy('manual');
  const mission = await seedOpenMission(house.id, adminToken, 12, 'Already done mission');

  await admin.from('mission_instances').update({ status: 'done' }).eq('id', mission.id);

  const res = await fetch(`${FUNCTIONS_URL}/assign-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, member_id: member.id }),
  });
  assertEquals(res.status, 409);

  const { data: unchanged } = await admin.from('mission_instances').select('status').eq('id', mission.id).single();
  assertEquals(unchanged!.status, 'done');
});

Deno.test('run-balance: an approved-unavailable member is excluded and their share becomes debt', async () => {
  const { house, adminToken, adminMember, member } = await seedHouseWithStrategy('points_based');

  const { data: unavailability } = await admin
    .from('unavailability_requests')
    .insert({
      house_id: house.id,
      member_id: member.id,
      period_start: '2020-01-01',
      period_end: '2999-12-31',
      status: 'approved',
    })
    .select()
    .single();

  await admin.from('points_ledger').insert({ house_id: house.id, member_id: adminMember.id, points_earned: 0, points_target: 0, debt: 0 });
  await admin.from('points_ledger').insert({ house_id: house.id, member_id: member.id, points_earned: 0, points_target: 0, debt: 0 });

  await seedOpenMission(house.id, adminToken, 10, 'Should skip the unavailable member');

  const res = await fetch(`${FUNCTIONS_URL}/run-balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id }),
  });
  assertEquals(res.status, 200);
  const { assigned } = await res.json();
  assertEquals(assigned.length, 1);
  assertEquals(assigned[0].member_id, adminMember.id);

  const { data: memberLedger } = await admin
    .from('points_ledger')
    .select('points_target, debt')
    .eq('house_id', house.id)
    .eq('member_id', member.id)
    .single();
  assertEquals(memberLedger!.points_target, 0);
  assertEquals(memberLedger!.debt, 5);

  void unavailability;
});

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

async function seedHouse(strategy: 'round_robin' | 'points_based') {
  const adminToken = await signUpAndSignIn(`elig-admin+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Eligibility House', admin_name: 'Admin' }),
  });
  const { house, member: adminMember } = await createRes.json();

  const memberToken = await signUpAndSignIn(`elig-member+${crypto.randomUUID()}@example.com`);
  const joinRes = await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: house.invite_code, name: 'Member' }),
  });
  const { member } = await joinRes.json();

  await admin.from('houses').update({ assignment_strategy: strategy }).eq('id', house.id);
  return { house, adminToken, adminMember, member };
}

/** A template restricted to `eligibleMemberIds`, plus one open instance of it. */
async function seedRestrictedTemplateMission(houseId: string, adminMemberId: string, eligibleMemberIds: string[]) {
  const { data: template } = await admin
    .from('mission_templates')
    .insert({
      house_id: houseId,
      title: 'Restricted chore',
      category: 'other',
      points: 10,
      recurrence_rule: 'weekly:fri',
      eligible_members: eligibleMemberIds,
    })
    .select()
    .single();

  const { data: mission } = await admin
    .from('mission_instances')
    .insert({
      template_id: template!.id,
      house_id: houseId,
      title: 'Restricted chore',
      category: 'other',
      points: 10,
      due_date: '2026-08-21',
      status: 'open',
      created_by: adminMemberId,
      assignment_mode: 'auto',
    })
    .select()
    .single();

  return { template, mission };
}

Deno.test('run-balance points_based: a member outside the subset never receives the mission', async () => {
  const { house, adminToken, adminMember, member } = await seedHouse('points_based');

  // Give the admin a large head start so the plain points_based rule would
  // hand this mission to `member` -- who is deliberately not eligible for it.
  await admin.from('points_ledger').insert([
    { house_id: house.id, member_id: adminMember.id, points_earned: 0, points_target: 100, debt: 0 },
    { house_id: house.id, member_id: member.id, points_earned: 500, points_target: 0, debt: 0 },
  ]);

  await seedRestrictedTemplateMission(house.id, adminMember.id, [member.id]);

  const res = await fetch(`${FUNCTIONS_URL}/run-balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id }),
  });
  assertEquals(res.status, 200);

  const { data: rows } = await admin
    .from('mission_instances')
    .select('assigned_to, status')
    .eq('house_id', house.id);

  // Eligible set is [member], so it must go to member even though the admin is
  // the one furthest below target.
  assertEquals(rows!.length, 1);
  assertEquals(rows![0].assigned_to, member.id);
  assertEquals(rows![0].status, 'assigned');
});

Deno.test('run-balance round_robin: rotation skips members outside the subset', async () => {
  const { house, adminToken, adminMember } = await seedHouse('round_robin');

  // Only the admin is eligible, so every instance must land on the admin
  // regardless of where the rotation cursor happens to sit.
  await seedRestrictedTemplateMission(house.id, adminMember.id, [adminMember.id]);

  const res = await fetch(`${FUNCTIONS_URL}/run-balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id }),
  });
  assertEquals(res.status, 200);

  const { data: rows } = await admin
    .from('mission_instances')
    .select('assigned_to')
    .eq('house_id', house.id);
  assertEquals(rows!.length, 1);
  assertEquals(rows![0].assigned_to, adminMember.id);
});

Deno.test('run-balance: a mission whose eligible members are all unavailable stays open', async () => {
  const { house, adminToken, adminMember, member } = await seedHouse('points_based');

  await admin.from('unavailability_requests').insert({
    house_id: house.id,
    member_id: member.id,
    period_start: '2020-01-01',
    period_end: '2099-12-31',
    status: 'approved',
  });

  await seedRestrictedTemplateMission(house.id, adminMember.id, [member.id]);

  const res = await fetch(`${FUNCTIONS_URL}/run-balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id }),
  });
  assertEquals(res.status, 200);

  const { data: rows } = await admin
    .from('mission_instances')
    .select('assigned_to, status')
    .eq('house_id', house.id);

  // Better to leave it in the pool than hand it to someone ineligible.
  assertEquals(rows![0].assigned_to, null);
  assertEquals(rows![0].status, 'open');
});

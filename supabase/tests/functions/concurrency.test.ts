import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * The ledger used to be updated read-modify-write across two HTTP round trips,
 * so two overlapping writes both read the same value and one of them was lost.
 * These drive the functions concurrently and assert nothing goes missing.
 *
 * Requires a local Supabase (`npx supabase start`); run with
 * `deno test --allow-net --allow-env supabase/tests/functions/concurrency.test.ts`.
 */

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

async function seedHouse(strategy: 'points_based' | 'round_robin' = 'points_based') {
  const adminToken = await signUpAndSignIn(`admin+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Concurrency House', admin_name: 'Admin' }),
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

async function seedAssignedMission(houseId: string, adminToken: string, memberId: string, points: number) {
  const res = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: houseId,
      category: 'other',
      title: `Chore ${crypto.randomUUID()}`,
      points,
      due_date: '2026-07-25',
      assignment_mode: 'direct',
      target_member_id: memberId,
    }),
  });
  const { mission } = await res.json();
  return mission;
}

Deno.test('complete-mission: simultaneous completions both land on the ledger', async () => {
  const { house, adminToken, adminMember, memberToken, member } = await seedHouse();

  const adminMission = await seedAssignedMission(house.id, adminToken, adminMember.id, 30);
  const memberMission = await seedAssignedMission(house.id, adminToken, member.id, 20);

  // Fired together on purpose: the old read-then-write dropped whichever
  // update landed second.
  await Promise.all([
    fetch(`${FUNCTIONS_URL}/complete-mission`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mission_instance_id: adminMission.id }),
    }),
    fetch(`${FUNCTIONS_URL}/complete-mission`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mission_instance_id: memberMission.id }),
    }),
  ]);

  const { data: rows } = await admin
    .from('points_ledger')
    .select('member_id, points_earned')
    .eq('house_id', house.id);

  const earned = Object.fromEntries((rows ?? []).map((r) => [r.member_id, r.points_earned]));
  assertEquals(earned[adminMember.id], 30);
  assertEquals(earned[member.id], 20);
});

Deno.test('complete-mission: the same mission completed twice credits its points once', async () => {
  const { house, adminToken, adminMember } = await seedHouse();
  const mission = await seedAssignedMission(house.id, adminToken, adminMember.id, 25);

  const send = () =>
    fetch(`${FUNCTIONS_URL}/complete-mission`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mission_instance_id: mission.id }),
    });

  // A double tap, or the offline queue draining while the first request is
  // still in flight. The assigned -> done transition is conditional, so only
  // one of these may credit anything.
  await Promise.all([send(), send()]);

  const { data: row } = await admin
    .from('points_ledger')
    .select('points_earned')
    .eq('house_id', house.id)
    .eq('member_id', adminMember.id)
    .maybeSingle();

  assertEquals(row?.points_earned, 25);
});

Deno.test('run-balance: two overlapping runs never assign one mission twice', async () => {
  const { house, adminToken, adminMember, member } = await seedHouse();

  for (let i = 0; i < 6; i++) {
    await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        house_id: house.id,
        category: 'other',
        title: `Pool chore ${i}`,
        points: 10,
        due_date: '2026-07-25',
        assignment_mode: 'auto',
      }),
    });
  }

  const run = () =>
    fetch(`${FUNCTIONS_URL}/run-balance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ house_id: house.id }),
    }).then((r) => r.json());

  const [first, second] = await Promise.all([run(), run()]);

  // Between them they may claim every mission, but never the same one twice.
  const claimed = [...first.assigned, ...second.assigned].map((a: { mission_id: string }) => a.mission_id);
  assertEquals(new Set(claimed).size, claimed.length);

  const { data: missions } = await admin
    .from('mission_instances')
    .select('id, assigned_to, status')
    .eq('house_id', house.id);
  assertEquals((missions ?? []).every((m) => m.assigned_to !== null && m.status === 'assigned'), true);

  // And the pool is distributed once, not twice: six 10-point chores means the
  // two members' targets total 60, not 120.
  const { data: ledger } = await admin
    .from('points_ledger')
    .select('member_id, points_target')
    .eq('house_id', house.id);
  const totalTarget = (ledger ?? []).reduce((sum, r) => sum + Number(r.points_target), 0);
  assertEquals(Math.round(totalTarget), 60);

  assertEquals([adminMember.id, member.id].every((id) => (ledger ?? []).some((r) => r.member_id === id)), true);
});

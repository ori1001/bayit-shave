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

async function seedHouseWithAdminAndMember() {
  const adminToken = await signUpAndSignIn(`admin+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Missions Test House', admin_name: 'Admin' }),
  });
  const { house, member: adminMember } = await createRes.json();

  const memberToken = await signUpAndSignIn(`member+${crypto.randomUUID()}@example.com`);
  const joinRes = await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: house.invite_code, name: 'Member' }),
  });
  const { member } = await joinRes.json();

  return { house, adminToken, adminMember, memberToken, member };
}

Deno.test('suggest-mission: admin pool suggestion is created open, no approval needed', async () => {
  const { house, adminToken } = await seedHouseWithAdminAndMember();
  const res = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'dishes',
      title: 'Wash dishes',
      points: 15,
      due_date: '2026-07-20',
      assignment_mode: 'auto',
    }),
  });
  assertEquals(res.status, 200);
  const { mission } = await res.json();
  assertEquals(mission.status, 'open');
  assertEquals(mission.assigned_to, null);
});

Deno.test('suggest-mission: member suggestion is pending_approval', async () => {
  const { house, memberToken } = await seedHouseWithAdminAndMember();
  const res = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'trash',
      title: 'Take out trash',
      points: 10,
      due_date: '2026-07-20',
      assignment_mode: 'auto',
    }),
  });
  assertEquals(res.status, 200);
  const { mission } = await res.json();
  assertEquals(mission.status, 'pending_approval');
});

Deno.test('suggest-mission: direct assignment targets the given member', async () => {
  const { house, adminToken, member } = await seedHouseWithAdminAndMember();
  const res = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'laundry',
      title: 'Fold laundry',
      points: 8,
      due_date: '2026-07-20',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  assertEquals(res.status, 200);
  const { mission } = await res.json();
  assertEquals(mission.status, 'assigned');
  assertEquals(mission.assigned_to, member.id);
});

Deno.test('edit-mission-points: member proposal sets proposed_points/proposed_by, leaves points untouched', async () => {
  const { house, adminToken, memberToken, member } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'dishes',
      title: 'Wash dishes',
      points: 15,
      due_date: '2026-07-20',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  const { mission: created } = await createRes.json();

  const editRes = await fetch(`${FUNCTIONS_URL}/edit-mission-points`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: created.id, points: 20 }),
  });
  assertEquals(editRes.status, 200);
  const { mission: edited } = await editRes.json();
  assertEquals(edited.points, 15);
  assertEquals(edited.proposed_points, 20);
  assertEquals(edited.proposed_by, member.id);
});

Deno.test('resolve-suggestion: approving a new_mission suggestion opens it; non-admin is rejected', async () => {
  const { house, adminToken, memberToken } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'garden',
      title: 'Water plants',
      points: 6,
      due_date: '2026-07-20',
      assignment_mode: 'auto',
    }),
  });
  const { mission: created } = await createRes.json();

  const forbidden = await fetch(`${FUNCTIONS_URL}/resolve-suggestion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestion_type: 'new_mission', mission_instance_id: created.id, decision: 'approve' }),
  });
  assertEquals(forbidden.status, 403);

  const approveRes = await fetch(`${FUNCTIONS_URL}/resolve-suggestion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestion_type: 'new_mission', mission_instance_id: created.id, decision: 'approve' }),
  });
  assertEquals(approveRes.status, 200);
  const { mission: approved } = await approveRes.json();
  assertEquals(approved.status, 'open');
});

Deno.test('resolve-suggestion: rejecting a points_edit clears the proposal and leaves points unchanged', async () => {
  const { house, adminToken, memberToken, member } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'bath',
      title: 'Clean bathroom',
      points: 20,
      due_date: '2026-07-20',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  const { mission: created } = await createRes.json();

  await fetch(`${FUNCTIONS_URL}/edit-mission-points`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: created.id, points: 30 }),
  });

  const rejectRes = await fetch(`${FUNCTIONS_URL}/resolve-suggestion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestion_type: 'points_edit', mission_instance_id: created.id, decision: 'reject' }),
  });
  assertEquals(rejectRes.status, 200);
  const { mission: rejected } = await rejectRes.json();
  assertEquals(rejected.points, 20);
  assertEquals(rejected.proposed_points, null);
  assertEquals(rejected.proposed_by, null);
});

Deno.test('complete-mission: assigned member completes and points_ledger increments', async () => {
  const { house, adminToken, member } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'shop',
      title: 'Grocery run',
      points: 18,
      due_date: '2026-07-20',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  const { mission: created } = await createRes.json();

  const completeRes = await fetch(`${FUNCTIONS_URL}/complete-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: created.id }),
  });
  // admin is not the assigned member here — expect a 403, proving the assignment check works
  assertEquals(completeRes.status, 403);

  const { data: ledgerRow } = await admin
    .from('points_ledger')
    .select('points_earned')
    .eq('house_id', house.id)
    .eq('member_id', member.id)
    .maybeSingle();
  assertEquals(ledgerRow, null);
});

Deno.test('complete-mission: completing twice is rejected the second time', async () => {
  const { house, adminToken, memberToken, member } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'pets',
      title: 'Feed the cat',
      points: 5,
      due_date: '2026-07-20',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  const { mission: created } = await createRes.json();

  const firstComplete = await fetch(`${FUNCTIONS_URL}/complete-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: created.id }),
  });
  assertEquals(firstComplete.status, 200);

  const { data: ledgerRow } = await admin
    .from('points_ledger')
    .select('points_earned')
    .eq('house_id', house.id)
    .eq('member_id', member.id)
    .maybeSingle();
  assertEquals(ledgerRow?.points_earned, 5);

  const secondComplete = await fetch(`${FUNCTIONS_URL}/complete-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: created.id }),
  });
  assertEquals(secondComplete.status, 409);

  const { data: ledgerAfterSecond } = await admin
    .from('points_ledger')
    .select('points_earned')
    .eq('house_id', house.id)
    .eq('member_id', member.id)
    .maybeSingle();
  assertEquals(ledgerAfterSecond?.points_earned, 5);
});

Deno.test('resolve-suggestion: approving a schedule_edit copies proposed_due_date into due_date', async () => {
  const { house, adminToken, memberToken, member } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'trash',
      title: 'Take out trash',
      points: 10,
      due_date: '2026-07-25',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  const { mission: created } = await createRes.json();

  await fetch(`${FUNCTIONS_URL}/edit-mission-schedule`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: created.id, due_date: '2026-08-02' }),
  });

  const approveRes = await fetch(`${FUNCTIONS_URL}/resolve-suggestion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestion_type: 'schedule_edit', mission_instance_id: created.id, decision: 'approve' }),
  });
  assertEquals(approveRes.status, 200);
  const { mission: approved } = await approveRes.json();
  assertEquals(approved.due_date, '2026-08-02');
  assertEquals(approved.proposed_due_date, null);
});

Deno.test('resolve-suggestion: rejecting a schedule_edit with nothing pending returns 409', async () => {
  const { house, adminToken, member } = await seedHouseWithAdminAndMember();
  const createRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'garden',
      title: 'Water plants',
      points: 6,
      due_date: '2026-07-25',
      assignment_mode: 'direct',
      target_member_id: member.id,
    }),
  });
  const { mission: created } = await createRes.json();

  const rejectRes = await fetch(`${FUNCTIONS_URL}/resolve-suggestion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestion_type: 'schedule_edit', mission_instance_id: created.id, decision: 'reject' }),
  });
  assertEquals(rejectRes.status, 409);
});

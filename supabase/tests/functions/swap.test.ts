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

async function seedHouseWithTwoMembersAndAssignedMission() {
  const adminToken = await signUpAndSignIn(`admin+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Swap Test House', admin_name: 'Admin' }),
  });
  const { house, member: adminMember } = await createRes.json();

  const memberToken = await signUpAndSignIn(`member+${crypto.randomUUID()}@example.com`);
  const joinRes = await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: house.invite_code, name: 'Member' }),
  });
  const { member } = await joinRes.json();

  const missionRes = await fetch(`${FUNCTIONS_URL}/suggest-mission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      house_id: house.id,
      category: 'dishes',
      title: 'Wash dishes',
      points: 15,
      due_date: '2026-07-25',
      assignment_mode: 'direct',
      target_member_id: adminMember.id,
    }),
  });
  const { mission } = await missionRes.json();

  return { house, adminToken, adminMember, memberToken, member, mission };
}

Deno.test('swap flow: suggest -> accept -> admin approve transfers the mission', async () => {
  const { adminToken, adminMember, memberToken, member, mission } = await seedHouseWithTwoMembersAndAssignedMission();

  const suggestRes = await fetch(`${FUNCTIONS_URL}/suggest-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, to_member_id: member.id }),
  });
  assertEquals(suggestRes.status, 200);
  const { swap } = await suggestRes.json();
  assertEquals(swap.status, 'pending');

  const acceptRes = await fetch(`${FUNCTIONS_URL}/respond-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ swap_request_id: swap.id, decision: 'accept' }),
  });
  assertEquals(acceptRes.status, 200);
  const { swap: accepted } = await acceptRes.json();
  assertEquals(accepted.status, 'accepted');

  const approveRes = await fetch(`${FUNCTIONS_URL}/resolve-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ swap_request_id: swap.id, decision: 'approve' }),
  });
  assertEquals(approveRes.status, 200);

  const { data: updatedMission } = await admin.from('mission_instances').select('assigned_to').eq('id', mission.id).single();
  assertEquals(updatedMission!.assigned_to, member.id);

  void adminMember;
});

Deno.test('resolve-swap: admin cannot approve a swap the target member has not accepted yet', async () => {
  const { adminToken, member, mission } = await seedHouseWithTwoMembersAndAssignedMission();

  const suggestRes = await fetch(`${FUNCTIONS_URL}/suggest-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, to_member_id: member.id }),
  });
  const { swap } = await suggestRes.json();

  const approveRes = await fetch(`${FUNCTIONS_URL}/resolve-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ swap_request_id: swap.id, decision: 'approve' }),
  });
  assertEquals(approveRes.status, 409);
});

Deno.test('suggest-swap: non-assignee cannot suggest a swap on the mission', async () => {
  const { memberToken, mission } = await seedHouseWithTwoMembersAndAssignedMission();

  const res = await fetch(`${FUNCTIONS_URL}/suggest-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, to_member_id: mission.assigned_to }),
  });
  assertEquals(res.status, 403);
});

Deno.test('respond-swap: only the target member can accept/decline', async () => {
  const { adminToken, member, mission } = await seedHouseWithTwoMembersAndAssignedMission();

  const suggestRes = await fetch(`${FUNCTIONS_URL}/suggest-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, to_member_id: member.id }),
  });
  const { swap } = await suggestRes.json();

  const wrongCallerRes = await fetch(`${FUNCTIONS_URL}/respond-swap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ swap_request_id: swap.id, decision: 'accept' }),
  });
  assertEquals(wrongCallerRes.status, 403);
});

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

async function seedHouseWithAssignedMission() {
  const adminToken = await signUpAndSignIn(`admin+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Schedule Test House', admin_name: 'Admin' }),
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
      target_member_id: member.id,
    }),
  });
  const { mission } = await missionRes.json();

  return { house, adminToken, adminMember, memberToken, member, mission };
}

Deno.test('edit-mission-schedule: admin applies the new date immediately', async () => {
  const { adminToken, mission } = await seedHouseWithAssignedMission();

  const res = await fetch(`${FUNCTIONS_URL}/edit-mission-schedule`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, due_date: '2026-07-30' }),
  });
  assertEquals(res.status, 200);
  const { mission: updated } = await res.json();
  assertEquals(updated.due_date, '2026-07-30');
  assertEquals(updated.proposed_due_date, null);
});

Deno.test('edit-mission-schedule: assignee proposes a date, live due_date unchanged', async () => {
  const { memberToken, member, mission } = await seedHouseWithAssignedMission();

  const res = await fetch(`${FUNCTIONS_URL}/edit-mission-schedule`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, due_date: '2026-08-01' }),
  });
  assertEquals(res.status, 200);
  const { mission: updated } = await res.json();
  assertEquals(updated.due_date, '2026-07-25');
  assertEquals(updated.proposed_due_date, '2026-08-01');
  assertEquals(updated.proposed_by, member.id);
});

Deno.test('edit-mission-schedule: non-assignee, non-admin member is rejected', async () => {
  const { house, adminToken, memberToken, mission } = await seedHouseWithAssignedMission();

  const thirdToken = await signUpAndSignIn(`third+${crypto.randomUUID()}@example.com`);
  await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${thirdToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: house.invite_code, name: 'Third' }),
  });

  const res = await fetch(`${FUNCTIONS_URL}/edit-mission-schedule`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${thirdToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mission_instance_id: mission.id, due_date: '2026-08-01' }),
  });
  assertEquals(res.status, 403);

  void adminToken;
  void memberToken;
});

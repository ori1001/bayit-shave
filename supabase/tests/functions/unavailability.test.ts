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
    body: JSON.stringify({ house_name: 'Unavailability Test House', admin_name: 'Admin' }),
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

Deno.test('suggest-unavailability: creates a pending request for the caller', async () => {
  const { house, memberToken, member } = await seedHouseWithAdminAndMember();

  const res = await fetch(`${FUNCTIONS_URL}/suggest-unavailability`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id, period_start: '2026-08-01', period_end: '2026-08-05', reason: 'Trip' }),
  });
  assertEquals(res.status, 200);
  const { unavailability } = await res.json();
  assertEquals(unavailability.status, 'pending');
  assertEquals(unavailability.member_id, member.id);
});

Deno.test('suggest-unavailability: rejects period_end before period_start', async () => {
  const { house, memberToken } = await seedHouseWithAdminAndMember();

  const res = await fetch(`${FUNCTIONS_URL}/suggest-unavailability`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id, period_start: '2026-08-05', period_end: '2026-08-01' }),
  });
  assertEquals(res.status, 400);
});

Deno.test('resolve-unavailability: admin approves; non-admin is rejected', async () => {
  const { house, adminToken, memberToken, member } = await seedHouseWithAdminAndMember();

  const suggestRes = await fetch(`${FUNCTIONS_URL}/suggest-unavailability`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: house.id, period_start: '2026-08-01', period_end: '2026-08-05' }),
  });
  const { unavailability } = await suggestRes.json();

  const forbidden = await fetch(`${FUNCTIONS_URL}/resolve-unavailability`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ unavailability_request_id: unavailability.id, decision: 'approve' }),
  });
  assertEquals(forbidden.status, 403);

  const approveRes = await fetch(`${FUNCTIONS_URL}/resolve-unavailability`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ unavailability_request_id: unavailability.id, decision: 'approve' }),
  });
  assertEquals(approveRes.status, 200);
  const { unavailability: approved } = await approveRes.json();
  assertEquals(approved.status, 'approved');

  const { data: dbRow } = await admin.from('unavailability_requests').select('status').eq('id', unavailability.id).single();
  assertEquals(dbRow!.status, 'approved');

  void member;
});

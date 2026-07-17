import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

async function signUpAndSignIn(email: string): Promise<string> {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const password = 'Test1234!';
  await client.auth.signUp({ email, password });
  const { data } = await client.auth.signInWithPassword({ email, password });
  return data.session!.access_token;
}

Deno.test('join-house: valid invite code adds a member', async () => {
  const adminToken = await signUpAndSignIn(`admin+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Test House', admin_name: 'Noa' }),
  });
  const { house } = await createRes.json();

  const memberToken = await signUpAndSignIn(`member+${crypto.randomUUID()}@example.com`);
  const joinRes = await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: house.invite_code, name: 'Itai' }),
  });
  assertEquals(joinRes.status, 200);
  const { member } = await joinRes.json();
  assertEquals(member.role, 'member');
  assertEquals(member.house_id, house.id);
});

Deno.test('join-house: invalid invite code is rejected', async () => {
  const token = await signUpAndSignIn(`nobody+${crypto.randomUUID()}@example.com`);
  const res = await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: 'NOPE99', name: 'Ghost' }),
  });
  assertEquals(res.status, 404);
});

Deno.test('join-house: joining the same house twice is rejected', async () => {
  const adminToken = await signUpAndSignIn(`admin2+${crypto.randomUUID()}@example.com`);
  const createRes = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Dup House', admin_name: 'Dana' }),
  });
  const { house } = await createRes.json();

  const memberToken = await signUpAndSignIn(`member2+${crypto.randomUUID()}@example.com`);
  const headers = { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' };
  const body = JSON.stringify({ invite_code: house.invite_code, name: 'Yoni' });

  await fetch(`${FUNCTIONS_URL}/join-house`, { method: 'POST', headers, body });
  const secondJoin = await fetch(`${FUNCTIONS_URL}/join-house`, { method: 'POST', headers, body });
  assertEquals(secondJoin.status, 409);
});

Deno.test('create-house: admin_id is set on the house after creation', async () => {
  const adminToken = await signUpAndSignIn(`admin3+${crypto.randomUUID()}@example.com`);
  const res = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Admin Check House', admin_name: 'Admin' }),
  });
  const { house, member } = await res.json();
  assertEquals(member.role, 'admin');
  assertEquals(house.admin_id, member.id);
  assertEquals(typeof house.invite_code, 'string');
  assertEquals(house.invite_code.length, 6);
});

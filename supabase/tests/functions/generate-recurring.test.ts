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

async function seedHouse() {
  const adminToken = await signUpAndSignIn(`gen-admin+${crypto.randomUUID()}@example.com`);
  const res = await fetch(`${FUNCTIONS_URL}/create-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_name: 'Generate House', admin_name: 'Admin' }),
  });
  const { house } = await res.json();
  return { house, adminToken };
}

async function generate(houseId: string, token: string, from: string, to: string) {
  const res = await fetch(`${FUNCTIONS_URL}/generate-recurring-missions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ house_id: houseId, from, to }),
  });
  return { status: res.status, body: await res.json() };
}

Deno.test('generate-recurring-missions instantiates a weekly template across the range', async () => {
  const { house, adminToken } = await seedHouse();

  await admin.from('mission_templates').insert({
    house_id: house.id,
    title: 'Bins',
    category: 'trash',
    points: 10,
    recurrence_rule: 'weekly:fri',
  });

  // Fridays in August 2026: 7, 14, 21, 28.
  const first = await generate(house.id, adminToken, '2026-08-01', '2026-08-31');
  assertEquals(first.status, 200);
  assertEquals(first.body.created, 4);

  const { data: rows } = await admin
    .from('mission_instances')
    .select('due_date')
    .eq('house_id', house.id)
    .order('due_date', { ascending: true });
  assertEquals(
    rows!.map((r) => r.due_date),
    ['2026-08-07', '2026-08-14', '2026-08-21', '2026-08-28']
  );
});

Deno.test('generating twice over the same range is a no-op, not a duplicate set of chores', async () => {
  const { house, adminToken } = await seedHouse();

  await admin.from('mission_templates').insert({
    house_id: house.id,
    title: 'Bins',
    category: 'trash',
    points: 10,
    recurrence_rule: 'weekly:fri',
  });

  await generate(house.id, adminToken, '2026-08-01', '2026-08-31');
  const second = await generate(house.id, adminToken, '2026-08-01', '2026-08-31');

  assertEquals(second.status, 200);
  // The (template_id, due_date) unique index makes the re-run insert nothing.
  assertEquals(second.body.created, 0);

  const { count } = await admin
    .from('mission_instances')
    .select('id', { count: 'exact', head: true })
    .eq('house_id', house.id);
  assertEquals(count, 4);
});

Deno.test('a non-admin cannot generate', async () => {
  const { house } = await seedHouse();
  const memberToken = await signUpAndSignIn(`gen-member+${crypto.randomUUID()}@example.com`);
  await fetch(`${FUNCTIONS_URL}/join-house`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: house.invite_code, name: 'Member' }),
  });

  const res = await generate(house.id, memberToken, '2026-08-01', '2026-08-31');
  assertEquals(res.status, 403);
  assertEquals(res.body.error, 'admin_only');
});

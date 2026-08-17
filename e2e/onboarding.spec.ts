import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { gotoSignIn } from './support/app';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'bayit_shave' } });

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

/**
 * Fixtures are unique per run. These specs used fixed names ('Playwright Test
 * House', invite code 'PWJOIN'), so the DB assertions passed only against a
 * pristine database: a second run left two houses of the same name and
 * `.single()` returned null, and the seeded invite code collided on its unique
 * index. The UI flow was fine both times -- only the assertions were.
 */
const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

/** Invite codes are six chars from an unambiguous alphabet, so mint one to match. */
function uniqueInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function signUpThroughUI(page: import('@playwright/test').Page, email: string) {
  await gotoSignIn(page);
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-password-input').fill('Test1234!');
  await page.getByTestId('auth-submit').click();
}

test.describe('onboarding', () => {
  test('sign up, then create a house', async ({ page }) => {
    const houseName = `Playwright Test House ${runId}`;
    await signUpThroughUI(page, uniqueEmail('create'));

    await expect(page.getByTestId('welcome-create-house')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('welcome-create-house').click();

    await expect(page).toHaveURL(/onboarding\/create-house/);
    await page.getByTestId('house-name-input').fill(houseName);
    await page.getByTestId('admin-name-input').fill('Playwright Admin');
    await page.getByTestId('create-house-submit').click();

    // Creating a house now stops on the invite code rather than redirecting
    // straight past it -- without seeing this code nobody can join the house.
    await expect(page.getByTestId('create-house-success')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('invite-code-value')).not.toBeEmpty();
    await page.getByTestId('create-house-continue').click();

    // Landing on '/' is momentary: the entry screen sees the house and sends
    // you into it. Asserting the intermediate URL raced the redirect.
    await expect(page).toHaveURL(/\/today$/);

    const { data: house } = await admin
      .from('houses')
      .select('id, name, invite_code, admin_id')
      .eq('name', houseName)
      .single();
    expect(house).toBeTruthy();
    expect(house!.admin_id).toBeTruthy();
  });

  test('sign up, then join a house with a valid invite code', async ({ page }) => {
    const { data: house } = await admin
      .from('houses')
      .insert({ name: `Seeded Join House ${runId}`, invite_code: uniqueInviteCode() })
      .select()
      .single();

    const joinerName = `Playwright Joiner ${runId}`;
    await signUpThroughUI(page, uniqueEmail('join'));

    await expect(page.getByTestId('welcome-join-house')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('welcome-join-house').click();

    await expect(page).toHaveURL(/onboarding\/join-house/);
    await page.getByTestId('invite-code-input').fill(house!.invite_code);
    await page.getByTestId('join-name-input').fill(joinerName);
    await page.getByTestId('join-house-submit').click();

    // Joining a house puts you in it, which is the outcome worth asserting.
    await expect(page).toHaveURL(/\/today$/);

    const { data: member } = await admin
      .from('members')
      .select('role, house_id')
      .eq('house_id', house!.id)
      .eq('name', joinerName)
      .maybeSingle();
    expect(member?.role).toBe('member');
  });

  test('join house: invalid invite code shows an error', async ({ page }) => {
    await signUpThroughUI(page, uniqueEmail('badcode'));

    await expect(page.getByTestId('welcome-join-house')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('welcome-join-house').click();

    await page.getByTestId('invite-code-input').fill('NOPE99');
    await page.getByTestId('join-name-input').fill('Nobody');
    await page.getByTestId('join-house-submit').click();

    await expect(page.getByTestId('join-house-error')).toBeVisible();
  });
});

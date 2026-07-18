import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'bayit_shave' } });

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUpThroughUI(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await expect(page.getByTestId('auth-email-input')).toBeVisible();
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-password-input').fill('Test1234!');
  await page.getByTestId('auth-submit').click();
}

test.describe('onboarding', () => {
  test('sign up, then create a house', async ({ page }) => {
    await signUpThroughUI(page, uniqueEmail('create'));

    await expect(page.getByTestId('welcome-create-house')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('welcome-create-house').click();

    await expect(page).toHaveURL(/onboarding\/create-house/);
    await page.getByTestId('house-name-input').fill('Playwright Test House');
    await page.getByTestId('admin-name-input').fill('Playwright Admin');
    await page.getByTestId('create-house-submit').click();

    await expect(page).toHaveURL('http://localhost:8081/');

    const { data: house } = await admin
      .from('houses')
      .select('id, name, invite_code, admin_id')
      .eq('name', 'Playwright Test House')
      .single();
    expect(house).toBeTruthy();
    expect(house!.admin_id).toBeTruthy();
  });

  test('sign up, then join a house with a valid invite code', async ({ page }) => {
    const { data: house } = await admin
      .from('houses')
      .insert({ name: 'Seeded Join House', invite_code: 'PWJOIN' })
      .select()
      .single();

    await signUpThroughUI(page, uniqueEmail('join'));

    await expect(page.getByTestId('welcome-join-house')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('welcome-join-house').click();

    await expect(page).toHaveURL(/onboarding\/join-house/);
    await page.getByTestId('invite-code-input').fill(house!.invite_code);
    await page.getByTestId('join-name-input').fill('Playwright Joiner');
    await page.getByTestId('join-house-submit').click();

    await expect(page).toHaveURL('http://localhost:8081/');

    const { data: member } = await admin
      .from('members')
      .select('role, house_id')
      .eq('house_id', house!.id)
      .eq('name', 'Playwright Joiner')
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

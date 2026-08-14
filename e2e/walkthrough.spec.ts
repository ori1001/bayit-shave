import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * A recorded end-to-end walkthrough of the normal user journey, used to
 * produce footage of the app rather than to assert behaviour. It still uses
 * real assertions so that a broken step fails the recording instead of
 * silently producing a video of a stuck screen.
 */

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'bayit_shave' } });

/** Pauses so the recording is watchable at human speed. */
async function beat(page: Page, ms = 900) {
  await page.waitForTimeout(ms);
}

/**
 * Scrolls an element into frame before interacting with it.
 *
 * Once the mission list has content the Today screen's nav buttons sit below
 * the fold, where a plain visibility check fails even though the control is
 * perfectly reachable.
 */
async function reveal(page: Page, testId: string, timeout = 60_000) {
  // Scoped to :visible because expo-router keeps the previous screen mounted in
  // the DOM on web -- a bare testId lookup can match the stale hidden copy.
  const el = page.locator(`[data-testid="${testId}"]:visible`).first();
  await el.waitFor({ state: 'visible', timeout });
  await el.scrollIntoViewIfNeeded({ timeout });
  await beat(page, 350);
  return el;
}

async function tap(page: Page, testId: string, timeout = 60_000) {
  const el = await reveal(page, testId, timeout);
  await el.click();
  return el;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.use({
  video: { mode: 'on', size: { width: 900, height: 1400 } },
  viewport: { width: 900, height: 1400 },
});

test('a household member sets up a house and works through a day', async ({ page }) => {
  test.setTimeout(420_000);

  const email = `demo-${Date.now()}@example.com`;

  // --- Sign up -------------------------------------------------------------
  await page.goto('/');
  await expect(page.getByTestId('auth-email-input')).toBeVisible({ timeout: 60_000 });
  await beat(page);

  await page.getByTestId('auth-email-input').fill(email);
  await beat(page, 400);
  await page.getByTestId('auth-password-input').fill('Test1234!');
  await beat(page, 400);
  await page.getByTestId('auth-submit').click();

  // --- Create the house, and read the invite code --------------------------
  await tap(page, 'welcome-create-house');

  await (await reveal(page, 'house-name-input')).fill('Bayit Shave Demo');
  await beat(page, 400);
  await (await reveal(page, 'admin-name-input')).fill('Ori');
  await beat(page, 400);
  await tap(page, 'create-house-submit', 60_000);

  await reveal(page, 'create-house-success');
  const inviteCode = await (await reveal(page, 'invite-code-value')).innerText();
  expect(inviteCode.trim().length).toBeGreaterThan(0);
  await beat(page, 1400);

  await tap(page, 'copy-invite-code');
  await beat(page, 900);
  await tap(page, 'create-house-continue');

  // --- Land on Today -------------------------------------------------------
  await reveal(page, 'today-suggest-mission');
  await beat(page, 1200);

  // --- Suggest a mission due today ----------------------------------------
  await tap(page, 'today-suggest-mission');
  await reveal(page, 'mission-title-input', 60_000);
  await beat(page);

  await tap(page, 'category-dishes', 60_000);
  await beat(page, 500);
  await (await reveal(page, 'mission-title-input')).fill('Wash the dishes');
  await beat(page, 400);
  await (await reveal(page, 'mission-points-input')).fill('15');
  await beat(page, 400);
  await (await reveal(page, 'mission-due-date-input')).fill(today());
  await beat(page, 600);
  await tap(page, 'suggest-mission-submit', 60_000);

  await reveal(page, 'today-balance');
  await beat(page, 1200);

  // --- Balance: run the assignment ----------------------------------------
  await tap(page, 'today-balance');
  await reveal(page, 'balance-house-summary', 60_000);
  await beat(page, 1600);

  await tap(page, 'run-balance', 60_000);
  await beat(page, 2000);

  // --- Back to Today, complete the mission --------------------------------
  await page.goBack();
  await page.reload();
  await reveal(page, 'today-suggest-mission');
  await beat(page, 1400);

  const missionRow = page.locator('[data-testid^="mission-row-"]:visible').first();
  if (await missionRow.count()) {
    await missionRow.scrollIntoViewIfNeeded();
    await beat(page, 900);
    await missionRow.click();
    await beat(page, 1800);
  }

  // --- Calendar ------------------------------------------------------------
  await tap(page, 'today-calendar');
  await reveal(page, 'calendar-next-month', 60_000);
  await beat(page, 1400);

  const dayCell = page.locator('[data-testid^="calendar-day-"]:visible').first();
  await dayCell.scrollIntoViewIfNeeded();
  await dayCell.click();
  await beat(page, 1400);
  await tap(page, 'calendar-next-month', 60_000);
  await beat(page, 1000);
  await tap(page, 'calendar-prev-month', 60_000);
  await beat(page, 1200);

  // --- Recurring chores ----------------------------------------------------
  await page.goBack();
  await tap(page, 'today-templates');

  await reveal(page, 'template-title-input', 60_000);
  await beat(page, 1200);
  await (await reveal(page, 'template-title-input')).fill('Take out the bins');
  await beat(page, 400);
  await tap(page, 'template-category-trash', 60_000);
  await beat(page, 400);
  await tap(page, 'template-frequency-weekly', 60_000);
  await beat(page, 400);
  await tap(page, 'template-weekday-fri', 60_000);
  await beat(page, 700);
  await tap(page, 'template-add', 60_000);
  await beat(page, 1800);

  await tap(page, 'templates-generate', 60_000);
  await reveal(page, 'templates-generated', 60_000);
  await beat(page, 2000);

  // --- House settings ------------------------------------------------------
  await page.goBack();
  await tap(page, 'today-settings');

  await reveal(page, 'strategy-points_based', 60_000);
  await beat(page, 1200);
  await tap(page, 'strategy-round_robin', 60_000);
  await beat(page, 700);
  await tap(page, 'period-monthly', 60_000);
  await beat(page, 700);
  await tap(page, 'balance-day-2', 60_000);
  await beat(page, 900);
  await tap(page, 'settings-save', 60_000);
  await reveal(page, 'settings-saved', 60_000);
  await beat(page, 2200);

  // Confirm the walkthrough actually changed real state, not just pixels.
  // Newest first: repeated recordings leave several houses of the same name
  // behind, so a single-row lookup by name would find none of them.
  const { data: houses } = await admin
    .from('houses')
    .select('assignment_strategy, balance_period, balance_day, created_at')
    .eq('name', 'Bayit Shave Demo')
    .order('created_at', { ascending: false })
    .limit(1);
  const house = houses?.[0];
  expect(house?.assignment_strategy).toBe('round_robin');
  expect(house?.balance_period).toBe('monthly');
  expect(house?.balance_day).toBe(2);
});

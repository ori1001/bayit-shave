import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { gotoSignIn } from './support/app';

/**
 * Switching tabs should change the content and nothing else.
 *
 * Tab taps used to animate as a stack push: the incoming screen slid in from
 * the edge, and since every screen draws its own tab bar, the bar slid out with
 * the old screen and back in with the new one. It read as the page jumping
 * rather than changing. These assert the two things that made it feel that way
 * -- the bar moving, and the header moving -- so a future default animation
 * cannot quietly bring it back.
 */

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'bayit_shave' } });

const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

/**
 * Scoped to the visible copy on purpose.
 *
 * expo-router keeps the outgoing screen mounted in the DOM on web, so a bare
 * testId matches two tab bars -- the live one and the stale one behind it.
 */
function visible(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]:visible`).first();
}

async function box(page: Page, testId: string) {
  const el = visible(page, testId);
  await el.waitFor({ state: 'visible', timeout: 60_000 });
  return el.boundingBox();
}

/** Taps a tab and waits for the cross-fade to finish. */
async function switchTo(page: Page, testId: string) {
  await visible(page, testId).click();
  await page.waitForTimeout(700);
}

/**
 * Signs up and creates a house, landing on Today.
 *
 * A fresh account per test: each Playwright test gets its own browser context
 * with empty storage, so they cannot share a session, and reusing one address
 * across them just fails the second sign-up.
 */
let accounts = 0;
async function enterHouse(page: Page) {
  const who = `smooth-${runId}-${accounts++}`;
  await gotoSignIn(page);
  await page.getByTestId('auth-email-input').fill(`${who}@example.com`);
  await page.getByTestId('auth-password-input').fill('Test1234!');
  await page.getByTestId('auth-submit').click();

  await page.getByTestId('welcome-create-house').click({ timeout: 60_000 });
  await page.getByTestId('house-name-input').fill(`Smoothness House ${who}`);
  await page.getByTestId('admin-name-input').fill('Smooth Admin');
  await page.getByTestId('create-house-submit').click();
  await page.getByTestId('create-house-continue').click({ timeout: 60_000 });

  await expect(page).toHaveURL(/\/today$/, { timeout: 60_000 });
  await page.getByTestId('tab-today').waitFor({ state: 'visible', timeout: 60_000 });
  // Wait for the first load to finish before measuring anything. The admin flag
  // arrives with it and adds the inbox tab, so the bar legitimately relays once
  // on entry; these tests are about what happens when moving between tabs
  // afterwards, which must not move it at all.
  await page.getByTestId('today-suggest-mission').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(1500);
}

test.describe('navigation smoothness', () => {
  test('the tab bar stays put while moving between tabs', async ({ page }) => {
    test.setTimeout(240_000);
    await enterHouse(page);

    const before = await box(page, 'tab-today');
    expect(before).not.toBeNull();

    for (const tab of ['tab-calendar', 'tab-balance', 'tab-today'] as const) {
      // Well past the 180ms cross-fade, so this measures the settled position
      // rather than a frame mid-transition.
      await switchTo(page, tab);

      const after = await box(page, 'tab-today');
      expect(after).not.toBeNull();
      // The bar is redrawn by each screen, so it is never literally the same
      // element -- but it must land in exactly the same place every time.
      expect(after!.x).toBeCloseTo(before!.x, 0);
      expect(after!.y).toBeCloseTo(before!.y, 0);
      expect(after!.width).toBeCloseTo(before!.width, 0);
      expect(after!.height).toBeCloseTo(before!.height, 0);
    }
  });

  test('a tab is still on screen mid-transition, never a blank frame', async ({ page }) => {
    test.setTimeout(240_000);
    await enterHouse(page);

    await visible(page, 'tab-calendar').click();
    // Sampled inside the cross-fade. A slide would have carried the bar off
    // toward the edge by now; a fade leaves it exactly where it was.
    await page.waitForTimeout(90);
    const mid = await box(page, 'tab-today');
    expect(mid).not.toBeNull();

    await page.waitForTimeout(700);
    const settled = await box(page, 'tab-today');
    expect(mid!.x).toBeCloseTo(settled!.x, 0);
    expect(mid!.y).toBeCloseTo(settled!.y, 0);
  });

  test('returning to a tab shows its content immediately, with no reload', async ({ page }) => {
    test.setTimeout(240_000);
    await enterHouse(page);

    // Prime the calendar, then leave and come back.
    await switchTo(page, 'tab-calendar');
    await visible(page, 'calendar-next').waitFor({ state: 'visible', timeout: 60_000 });
    await switchTo(page, 'tab-today');

    await visible(page, 'tab-calendar').click();
    // 250ms is the cross-fade plus a frame. The month grid has to be there
    // already -- a skeleton here would mean the screen refetched from nothing.
    await page.waitForTimeout(250);
    await expect(visible(page, 'calendar-next')).toBeVisible();
    await expect(page.locator('[data-testid="screen-loading"]:visible')).toHaveCount(0);
  });

  test.afterAll(async () => {
    await admin.from('houses').delete().like('name', `Smoothness House ${runId}%`);
  });
});

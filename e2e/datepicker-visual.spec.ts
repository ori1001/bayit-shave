import { test, expect } from '@playwright/test';

/**
 * The picker opens on the time-off screen, which needs no house or auth to
 * reach, so it can be exercised without seeding data.
 *
 * Checked in both languages: month and weekday names come from the active
 * locale, and the month-step chevrons are direction-aware.
 */
for (const lang of ['en', 'he'] as const) {
  test(`date range picker renders in ${lang}`, async ({ browser }) => {
    test.setTimeout(150_000);
    const context = await browser.newContext({
      viewport: { width: 900, height: 1500 },
      locale: lang === 'he' ? 'he-IL' : 'en-US',
    });
    const page = await context.newPage();

    await page.goto('http://localhost:8081/unavailability/suggest');
    const field = page.getByTestId('unavailability-range');
    await expect(field).toBeVisible({ timeout: 60_000 });

    await field.click();
    const grid = page.getByTestId('unavailability-range-grid');
    await expect(grid).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `test-results/picker-${lang}-open.png` });

    // Two taps make a range; the field should then summarise both ends.
    await page.getByTestId('unavailability-range-grid-day-10').click();
    await page.waitForTimeout(400);
    await page.getByTestId('unavailability-range-grid-day-18').click();
    await page.waitForTimeout(900);

    await expect(grid).toHaveCount(0);
    await page.screenshot({ path: `test-results/picker-${lang}-picked.png` });

    await context.close();
  });
}

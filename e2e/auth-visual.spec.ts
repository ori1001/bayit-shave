import { test, expect } from '@playwright/test';

/** Captures the signed-out screen for visual review, in both themes. */
test.use({ viewport: { width: 900, height: 1400 } });

for (const scheme of ['light', 'dark'] as const) {
  test(`welcome screen renders in ${scheme}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 900, height: 1400 } });
    const page = await context.newPage();

    await page.goto('http://localhost:8081/');
    await expect(page.getByTestId('auth-email-input')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `test-results/welcome-${scheme}.png` });
    await context.close();
  });
}

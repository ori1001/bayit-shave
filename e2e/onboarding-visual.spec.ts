import { test, expect } from '@playwright/test';

/**
 * Captures the onboarding pages in both languages.
 *
 * Hebrew drives an RTL layout, so a pager that reads correctly in English can
 * still advance the wrong way or clip its copy. Both are walked every time.
 */
const VIEWPORT = { width: 900, height: 1500 };

for (const lang of ['en', 'he'] as const) {
  test(`onboarding renders in ${lang}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({
      viewport: VIEWPORT,
      locale: lang === 'he' ? 'he-IL' : 'en-US',
    });
    const page = await context.newPage();

    await page.goto('http://localhost:8081/onboarding/intro');
    await expect(page.getByTestId('intro-pager')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `test-results/intro-${lang}-1.png` });

    // Walk to the last page via the dots, which are the stable control.
    for (const step of [2, 3, 4, 5]) {
      await page.getByTestId(`intro-dot-${step}`).click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `test-results/intro-${lang}-${step}.png` });
    }

    // The final page swaps Next for Get started and drops Skip.
    await expect(page.getByTestId('intro-get-started')).toBeVisible();
    await expect(page.getByTestId('intro-skip')).toHaveCount(0);

    await context.close();
  });
}

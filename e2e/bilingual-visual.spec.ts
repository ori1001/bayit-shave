import { test, expect, type Page } from '@playwright/test';
import { gotoSignIn } from './support/app';

/**
 * Captures the app in both languages.
 *
 * Hebrew is the default locale and drives an RTL layout, so a change that looks
 * right in English can still land mirrored, clipped or with directional icons
 * pointing the wrong way. Both are checked every time rather than English only.
 */

const VIEWPORT = { width: 900, height: 1500 };

async function setLanguage(page: Page, lang: 'he' | 'en') {
  await page.addInitScript((code) => {
    // i18n resolves from the device locale; override it before the app boots.
    Object.defineProperty(navigator, 'language', { get: () => code });
    Object.defineProperty(navigator, 'languages', { get: () => [code] });
  }, lang === 'he' ? 'he-IL' : 'en-US');
}

for (const lang of ['en', 'he'] as const) {
  test(`welcome screen renders in ${lang}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: VIEWPORT, locale: lang === 'he' ? 'he-IL' : 'en-US' });
    const page = await context.newPage();
    await setLanguage(page, lang);

    await gotoSignIn(page);
    await expect(page.getByTestId('auth-email-input')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);

    // The logo must render in both — it is an SVG, not a font glyph.
    await expect(page.getByTestId('logo-mark')).toBeVisible();

    await page.screenshot({ path: `test-results/lang-${lang}-welcome.png` });
    await context.close();
  });
}

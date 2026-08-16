import { test, expect } from '@playwright/test';

/**
 * Regression guard for invisible input text.
 *
 * app.json sets userInterfaceStyle "automatic", and the inputs style only set a
 * white backgroundColor with no explicit text color. On a device in dark mode
 * React Native defaults input text to white, so everything typed -- including
 * the password dots -- was white on white.
 */
test.use({ colorScheme: 'dark', viewport: { width: 900, height: 1400 } });

test('input text stays readable in dark mode', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('/');
  const email = page.getByTestId('auth-email-input');
  await expect(email).toBeVisible({ timeout: 60_000 });

  await email.fill('someone@example.com');
  await page.getByTestId('auth-password-input').fill('hunter2hunter2');

  // The rendered colour must not be white-on-white.
  for (const id of ['auth-email-input', 'auth-password-input']) {
    const { color, background } = await page.getByTestId(id).evaluate((el) => {
      const cs = getComputedStyle(el as HTMLElement);
      return { color: cs.color, background: cs.backgroundColor };
    });
    expect(color, `${id} text colour`).not.toBe('rgb(255, 255, 255)');
    expect(color, `${id} must differ from its background`).not.toBe(background);
  }

  await page.screenshot({ path: 'test-results/darkmode-inputs.png' });
});

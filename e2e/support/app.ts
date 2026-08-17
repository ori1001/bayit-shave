import { expect, type Page } from '@playwright/test';

/**
 * Opens the app at the sign-in screen.
 *
 * A first launch redirects `/` to the five-screen intro before the sign-up
 * form, and every Playwright context is a first launch -- storage is empty, so
 * `hasSeenIntro()` is false every time. Specs written before the intro existed
 * went straight to `/` and waited for a field that was never going to appear,
 * so the whole suite has been failing on a 60s timeout rather than on anything
 * real. Anything that needs the auth form should come through here.
 */
export async function gotoSignIn(page: Page, timeout = 60_000): Promise<void> {
  await page.goto('/');

  const intro = page.getByTestId('intro-skip');
  const email = page.getByTestId('auth-email-input');

  // Whichever lands first: the intro on a cold start, or the form if the
  // intro has already been dismissed in this context.
  await expect(intro.or(email).first()).toBeVisible({ timeout });

  if (await intro.isVisible().catch(() => false)) {
    await intro.click();
  }

  await expect(email).toBeVisible({ timeout });
}

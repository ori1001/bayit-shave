import { test, expect } from '@playwright/test';

/**
 * Verifies the Google OAuth wiring at the level that can actually break:
 * the provider being enabled on Supabase, and Google accepting the client and
 * redirect URI.
 *
 * Deliberately not a UI click-through. On web, expo-web-browser opens a popup
 * after an await, which headless Chromium fails to navigate -- that is a
 * limitation of driving the web build headlessly, not of the app. The native
 * flow is exercised on a device/emulator instead.
 */

const PROJECT = 'https://nqiauqgwpygsibwxiuov.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xaWF1cWd3cHlnc2lid3hpdW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NDc5ODIsImV4cCI6MjA4NzAyMzk4Mn0.qhi157iEn08RYIPZSuhz5qrRFT0fscKp0hFSwMmHLxk';

test('Supabase issues a Google redirect carrying the app scheme', async ({ request }) => {
  const res = await request.get(
    `${PROJECT}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent('bayitshave://auth/callback')}`,
    { headers: { apikey: ANON }, maxRedirects: 0 }
  );

  expect(res.status(), 'provider must be enabled').toBe(302);

  const location = res.headers()['location'] ?? '';
  expect(location).toContain('accounts.google.com');
  // Google must be told to come back to Supabase, which then forwards to the
  // app's own scheme. Getting either wrong is what breaks this flow.
  expect(location).toContain(encodeURIComponent(`${PROJECT}/auth/v1/callback`));
  expect(location).toContain(encodeURIComponent('bayitshave://auth/callback'));
  expect(location).toMatch(/client_id=[^&]+/);
});

test('Google accepts the client rather than rejecting the redirect URI', async ({ request }) => {
  const authorize = await request.get(
    `${PROJECT}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent('bayitshave://auth/callback')}`,
    { headers: { apikey: ANON }, maxRedirects: 0 }
  );
  const googleUrl = authorize.headers()['location'];
  expect(googleUrl).toBeTruthy();

  const google = await request.get(googleUrl!);
  const body = await google.text();

  expect(body).not.toMatch(/redirect_uri_mismatch/i);
  expect(body).not.toMatch(/invalid_client|deleted_client/i);
  expect(body).toMatch(/Sign in|Gmail|accounts\.google/i);
});

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  // Metro bundles the whole app on the first request of a run, which takes the
  // better part of a minute on a cold cache -- longer than Playwright's 30s
  // default, so the first spec to touch the app timed out on page.goto rather
  // than on anything it was testing. Specs that need longer still raise it
  // themselves.
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx expo start --web --port 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

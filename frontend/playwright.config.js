// Playwright end-to-end tests (frontend/e2e). Starts two servers:
//  - the e2e backend: the real Express app on an in-memory MongoDB, seeded (backend/tests/e2e/server.js)
//  - the Vite dev server pointed at it (VITE_API_URL)
// No real database is used. See e2e/README.md.
import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);
const API_PORT = Number(process.env.E2E_PORT) || 5055;
const WEB_PORT = Number(process.env.E2E_WEB_PORT) || 5179;
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'Africa/Addis_Ababa',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // Tests never depend on the internet: Google Fonts requests fail immediately instead of
        // hanging the page 'load' event on slow or offline networks (fallback fonts are used).
        launchOptions: {
          args: ['--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND, MAP fonts.gstatic.com ~NOTFOUND'],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'node tests/e2e/server.js',
      cwd: '../backend',
      url: `${API_URL}/__e2e/ready`,
      env: { E2E_PORT: String(API_PORT) },
      reuseExistingServer: !CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npx vite --config e2e/vite.config.e2e.js --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      env: { VITE_API_URL: `${API_URL}/api`, E2E: '1' },
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});

import { defineConfig } from '@playwright/test';
import { E2E } from './env';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  // The specs share one stack and some build on earlier state, so they run in order on one worker.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: E2E.webUrl,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // CI installs its own browser; locally a pre-installed Chromium can be supplied.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: [
    {
      command: 'node s3-server.js',
      url: `${E2E.s3Url}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      ignoreHTTPSErrors: true,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 2000 },
    },
    {
      command: 'node ../apps/api/dist/main.js',
      url: `${E2E.apiUrl}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: E2E.apiEnv,
    },
    {
      command: 'pnpm --filter @dpms/web exec next start -p 3100',
      url: `${E2E.webUrl}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { API_INTERNAL_URL: E2E.apiUrl },
    },
  ],
});

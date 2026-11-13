import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { AUTH_FILE, BASE_URL, E2E_DIR, ROOT_DIR } from './support/paths';

export default defineConfig({
   testDir: E2E_DIR,
   fullyParallel: true,
   forbidOnly: process.env.CI !== undefined,
   retries: process.env.CI === undefined ? 0 : 1,
   // wrangler dev serialises requests against one local D1; parallel workers make
   // every response seconds slower and the suite flaky. One worker is the default
   // everywhere; override with E2E_WORKERS once the suite is sharded.
   workers: Number(process.env.E2E_WORKERS ?? 1),
   timeout: 45_000,
   expect: { timeout: 15_000 },
   reporter:
      process.env.CI === undefined
         ? [
              ['list'],
              ['html', { outputFolder: path.join(ROOT_DIR, 'playwright-report'), open: 'never' }],
           ]
         : [
              ['github'],
              ['html', { outputFolder: path.join(ROOT_DIR, 'playwright-report'), open: 'never' }],
           ],
   outputDir: path.join(ROOT_DIR, 'test-results'),
   use: {
      baseURL: BASE_URL,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
      // E2E_SLOW_MO=<ms> paces actions so a headed run is watchable.
      launchOptions:
         process.env.E2E_SLOW_MO === undefined ? {} : { slowMo: Number(process.env.E2E_SLOW_MO) },
   },
   projects: [
      {
         name: 'setup',
         testMatch: 'setup/*.setup.ts',
      },
      {
         name: 'chromium',
         testMatch: 'specs/*.spec.ts',
         use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1440, height: 900 },
            storageState: AUTH_FILE,
         },
         dependencies: ['setup'],
      },
   ],
   webServer: {
      command: 'pnpm e2e:serve',
      cwd: ROOT_DIR,
      url: `${BASE_URL}/api/health`,
      // Never reuse a running server: the suite must start from a fresh database.
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
   },
});

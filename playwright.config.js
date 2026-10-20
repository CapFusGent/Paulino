// End-to-end tests against the local dev server (static app + PGlite backend
// running the real migrations, in memory).
//   npm run test:e2e                     (Playwright's Chromium)
//   PW_CHANNEL=chrome npm run test:e2e   (use the installed Google Chrome)
import { defineConfig } from '@playwright/test';

const PORT = 4321;
export default defineConfig({
  testDir: 'test/e2e',
  outputDir: 'test-results/pw', // screenshots for review go to test-results/screens (kept between runs)
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 360, height: 760 },
    hasTouch: true,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server/dev-server.mjs',
    url: `http://localhost:${PORT}/index.html`,
    env: { PORT: String(PORT), MEMORY: '1', SEED: '0' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

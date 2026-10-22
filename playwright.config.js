// Browser tests for Paulino (no backend: a static file server is all it needs).
//   npm test                     (Playwright's Chromium: npx playwright install chromium)
//   PW_CHANNEL=chrome npm test   (use the installed Google Chrome instead)
import { defineConfig } from '@playwright/test';

const PORT = 4321;
export default defineConfig({
  testDir: 'test',
  testMatch: '*.spec.js',
  outputDir: 'test-results/pw',
  // CI runners are 2-3x slower than a laptop: give them room instead of retrying timeouts
  timeout: process.env.CI ? 90_000 : 45_000,
  expect: { timeout: process.env.CI ? 15_000 : 8_000 },
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  // 'github' turns each failure into an annotation on the run (readable without signing in)
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 360, height: 760 },
    hasTouch: true,
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node test/serve.mjs',
    url: `http://localhost:${PORT}/index.html`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
  },
});

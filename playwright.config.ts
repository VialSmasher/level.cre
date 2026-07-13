import { defineConfig } from '@playwright/test';

const baseURL = process.env.LEVELCRE_UX_BASE_URL || 'http://localhost:5175';

export default defineConfig({
  testDir: './tests/ux',
  testMatch: '**/broker-*.ux.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  outputDir: 'artifacts/ux-benchmark/test-results-local',
  reporter: [
    ['list'],
    ['./tests/ux/support/benchmark-reporter.ts'],
    ['html', { outputFolder: 'artifacts/ux-benchmark/playwright-local', open: 'never' }],
  ],
  use: {
    baseURL,
    channel: 'chrome',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm.cmd --workspace @apps/web run dev -- --port 5175 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_DEMO_MODE: 'true',
      VITE_RUNTIME_OVERLAY: 'false',
    },
  },
  projects: [
    {
      name: 'broker-desktop',
      testMatch: '**/broker-journeys.ux.spec.ts',
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'broker-mobile',
      testMatch: '**/broker-mobile.ux.spec.ts',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
      },
    },
  ],
});

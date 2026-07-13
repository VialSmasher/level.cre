import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ux',
  testMatch: '**/real-map.ux.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  outputDir: 'artifacts/ux-benchmark/test-results-map',
  reporter: [
    ['list'],
    ['./tests/ux/support/benchmark-reporter.ts'],
    ['html', { outputFolder: 'artifacts/ux-benchmark/playwright-map', open: 'never' }],
  ],
  use: {
    baseURL: process.env.LEVELCRE_REAL_MAP_BASE_URL || 'https://level-cre.vercel.app',
    channel: 'chrome',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'real-map' }],
});

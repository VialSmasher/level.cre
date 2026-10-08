import { defineConfig } from 'playwright/test';

const baseURL = 'http://127.0.0.1:5176';

export default defineConfig({
  testDir: './tests/calling',
  testMatch: 'calling.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  outputDir: 'work/calling-playwright/results',
  reporter: [['list']],
  use: {
    baseURL,
    channel: 'chrome',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm.cmd --workspace @apps/web run dev -- --host 127.0.0.1 --port 5176 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, VITE_DEMO_MODE: 'true', VITE_RUNTIME_OVERLAY: 'false' },
  },
  projects: [
    { name: 'calling-desktop', use: { viewport: { width: 1536, height: 1024 } } },
    { name: 'calling-mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
});

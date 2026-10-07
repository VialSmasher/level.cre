import { defineConfig } from 'playwright/test';

// The API is a separately started, memory-only PostgreSQL snapshot harness.
// This configuration never starts or proxies the production API.
const baseURL = 'http://127.0.0.1:5177';

export default defineConfig({
  testDir: './tests/calling',
  testMatch: 'calling-simulation.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: 'work/calling-simulation/private/browser-results',
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
    command: 'npm.cmd --workspace @apps/web run dev -- --host 127.0.0.1 --port 5177 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, VITE_DEMO_MODE: 'false', VITE_RUNTIME_OVERLAY: 'false' },
  },
  projects: [
    { name: 'simulation-desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'simulation-mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
});

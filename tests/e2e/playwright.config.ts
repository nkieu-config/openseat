import { defineConfig, devices } from '@playwright/test';
import { stackServers, WEB } from './stack';

export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['html', { outputFolder: 'report', open: 'never' }], ['list']]
    : [['list']],
  use: {
    baseURL: WEB,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: stackServers,
});

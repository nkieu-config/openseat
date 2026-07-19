import { defineConfig, devices } from '@playwright/test';
import { stackServers, WEB } from './stack';

export default defineConfig({
  testDir: './capture',
  testMatch: /.*\.capture\.ts$/,
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: WEB,
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: stackServers,
});

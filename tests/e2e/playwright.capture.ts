import { defineConfig, devices } from '@playwright/test';

const WEB = 'http://localhost:3000';
const API = 'http://localhost:4000';
const PAYMOCK = 'http://localhost:4100';
const GATE = 'http://localhost:4200';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://openseat:openseat@localhost:5432/openseat';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

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
  webServer: [
    {
      command: 'pnpm --filter api start:prod',
      url: `${API}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        DATABASE_URL,
        REDIS_URL,
        PORT: '4000',
        JWT_SECRET: process.env.JWT_SECRET ?? 'e2e-jwt-secret',
        PAYMOCK_WEBHOOK_SECRET: 'paymock-dev-webhook-secret',
        GATE_ADMISSION_SECRET: 'gate-dev-admission-secret',
        PAYMOCK_URL: PAYMOCK,
        API_PUBLIC_URL: API,
        WEB_ORIGIN: WEB,
        APP_ORIGIN: WEB,
      },
    },
    {
      command: 'go run .',
      cwd: '../../services/paymock',
      url: `${PAYMOCK}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: '4100',
        PAYMOCK_WEBHOOK_SECRET: 'paymock-dev-webhook-secret',
        PAYMOCK_API_KEY: 'paymock-dev-key',
        API_PUBLIC_URL: API,
      },
    },
    {
      command: 'go run .',
      cwd: '../../services/gate',
      url: `${GATE}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: '4200',
        REDIS_URL,
        GATE_ADMISSION_SECRET: 'gate-dev-admission-secret',
        WEB_ORIGIN: WEB,
      },
    },
    {
      command: 'pnpm --filter web start',
      url: WEB,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: '3000',
        API_PROXY_TARGET: API,
        NEXT_PUBLIC_API_ORIGIN: API,
        NEXT_PUBLIC_GATE_ORIGIN: GATE,
      },
    },
  ],
});

import type { PlaywrightTestConfig } from '@playwright/test';

type WebServer = Extract<
  NonNullable<PlaywrightTestConfig['webServer']>,
  readonly unknown[]
>[number];

export const WEB = 'http://localhost:3000';
export const API = 'http://localhost:4000';
export const PAYMOCK = 'http://localhost:4100';
export const GATE = 'http://localhost:4200';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://openseat:openseat@localhost:5432/openseat';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const shared = {
  reuseExistingServer: false,
  timeout: 120_000,
  stdout: 'pipe',
  stderr: 'pipe',
} as const;

export const stackServers: WebServer[] = [
  {
    ...shared,
    command: 'pnpm --filter api start:prod',
    url: `${API}/api/health`,
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
    ...shared,
    command: 'go run .',
    cwd: '../../services/paymock',
    url: `${PAYMOCK}/health`,
    env: {
      PORT: '4100',
      PAYMOCK_WEBHOOK_SECRET: 'paymock-dev-webhook-secret',
      PAYMOCK_API_KEY: 'paymock-dev-key',
      API_PUBLIC_URL: API,
    },
  },
  {
    ...shared,
    command: 'go run .',
    cwd: '../../services/gate',
    url: `${GATE}/health`,
    env: {
      PORT: '4200',
      REDIS_URL,
      GATE_ADMISSION_SECRET: 'gate-dev-admission-secret',
      WEB_ORIGIN: WEB,
    },
  },
  {
    ...shared,
    command: 'pnpm --filter web start',
    url: WEB,
    env: {
      PORT: '3000',
      API_PROXY_TARGET: API,
      NEXT_PUBLIC_API_ORIGIN: API,
      NEXT_PUBLIC_GATE_ORIGIN: GATE,
    },
  },
];

import type { PoolConfig } from 'pg';

const DEFAULT_POOL_MAX = 10;
const DEFAULT_STATEMENT_TIMEOUT_MS = 10_000;

export const CONNECTION_ACQUIRE_TIMEOUT_MS = 5_000;
export const IDLE_CLIENT_TIMEOUT_MS = 10_000;
export const TRANSACTION_MAX_WAIT_MS = 5_000;
export const TRANSACTION_TIMEOUT_MS = 10_000;
export const IDLE_IN_TRANSACTION_TIMEOUT_MS = 15_000;

type Env = Record<string, string | undefined>;

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function poolMax(env: Env = process.env): number {
  return positiveInt(env.DATABASE_POOL_MAX, DEFAULT_POOL_MAX);
}

export function statementTimeoutMs(env: Env = process.env): number {
  return positiveInt(
    env.DATABASE_STATEMENT_TIMEOUT_MS,
    DEFAULT_STATEMENT_TIMEOUT_MS,
  );
}

export function databasePoolConfig(env: Env = process.env): PoolConfig {
  return {
    connectionString: env.DATABASE_URL,
    application_name: 'openseat-api',
    max: poolMax(env),
    connectionTimeoutMillis: CONNECTION_ACQUIRE_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_CLIENT_TIMEOUT_MS,
    statement_timeout: statementTimeoutMs(env),
    idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
  };
}

export const transactionOptions = {
  maxWait: TRANSACTION_MAX_WAIT_MS,
  timeout: TRANSACTION_TIMEOUT_MS,
};

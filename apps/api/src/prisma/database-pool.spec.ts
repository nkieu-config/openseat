import {
  CONNECTION_ACQUIRE_TIMEOUT_MS,
  IDLE_IN_TRANSACTION_TIMEOUT_MS,
  TRANSACTION_TIMEOUT_MS,
  databasePoolConfig,
  poolMax,
  statementTimeoutMs,
  transactionOptions,
} from './database-pool';

const LOCAL = 'postgresql://openseat:openseat@localhost:5432/openseat';

describe('database pool', () => {
  describe('the timeout ladder', () => {
    it('kills a single statement before Postgres kills the session holding it', () => {
      expect(statementTimeoutMs({})).toBeLessThan(
        IDLE_IN_TRANSACTION_TIMEOUT_MS,
      );
    });

    it('lets Prisma abort its own transaction before Postgres drops it', () => {
      expect(TRANSACTION_TIMEOUT_MS).toBeLessThan(
        IDLE_IN_TRANSACTION_TIMEOUT_MS,
      );
    });

    it('gives up waiting for a connection sooner than it would give up on a query', () => {
      expect(CONNECTION_ACQUIRE_TIMEOUT_MS).toBeLessThanOrEqual(
        statementTimeoutMs({}),
      );
    });
  });

  describe('configuration', () => {
    it('bounds the wait for a free connection instead of waiting forever', () => {
      const config = databasePoolConfig({ DATABASE_URL: LOCAL });

      expect(config.connectionTimeoutMillis).toBeGreaterThan(0);
      expect(config.statement_timeout).toBeGreaterThan(0);
      expect(config.idle_in_transaction_session_timeout).toBeGreaterThan(0);
    });

    it('names the connection so it is identifiable in pg_stat_activity', () => {
      expect(databasePoolConfig({ DATABASE_URL: LOCAL }).application_name).toBe(
        'openseat-api',
      );
    });

    it('takes an operator override for the two knobs worth tuning', () => {
      const env = {
        DATABASE_URL: LOCAL,
        DATABASE_POOL_MAX: '4',
        DATABASE_STATEMENT_TIMEOUT_MS: '3000',
      };

      expect(poolMax(env)).toBe(4);
      expect(statementTimeoutMs(env)).toBe(3000);
      expect(databasePoolConfig(env).max).toBe(4);
    });

    it('falls back rather than disabling a timeout when the override is nonsense', () => {
      for (const bad of ['', 'abc', '0', '-5', '1.5']) {
        expect(statementTimeoutMs({ DATABASE_STATEMENT_TIMEOUT_MS: bad })).toBe(
          10_000,
        );
        expect(poolMax({ DATABASE_POOL_MAX: bad })).toBe(10);
      }
    });
  });

  it('keeps the transaction options in step with the ladder', () => {
    expect(transactionOptions.timeout).toBe(TRANSACTION_TIMEOUT_MS);
    expect(transactionOptions.maxWait).toBeLessThanOrEqual(
      transactionOptions.timeout,
    );
  });
});

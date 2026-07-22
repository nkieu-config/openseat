import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  function build(queryRaw: () => Promise<unknown>, redisUrl?: string) {
    const config = { get: () => redisUrl } as unknown as ConfigService;
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new HealthService(config, prisma);
    service.onModuleInit();
    return service;
  }

  it('reports ready when the database answers', async () => {
    const service = build(() => Promise.resolve([{ '?column?': 1 }]));

    const report = await service.report();

    expect(report.status).toBe('ready');
    expect(report.checks.database.status).toBe('up');
    expect(report.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports degraded when the database refuses', async () => {
    const service = build(() =>
      Promise.reject(new Error('connection refused')),
    );

    const report = await service.report();

    expect(report.status).toBe('degraded');
    expect(report.checks.database.status).toBe('down');
  });

  it('skips Redis rather than failing when none is configured', async () => {
    const service = build(() => Promise.resolve([]));

    const report = await service.report();

    expect(report.checks.redis.status).toBe('skipped');
    expect(report.status).toBe('ready');
  });

  it('does not hang forever on a dependency that never answers', async () => {
    jest.useFakeTimers();
    const service = build(() => new Promise(() => {}));

    const pending = service.report();
    await jest.advanceTimersByTimeAsync(2_000);
    const report = await pending;

    expect(report.checks.database.status).toBe('down');
    expect(report.status).toBe('degraded');
    jest.useRealTimers();
  });
});

import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { HealthController } from './health.controller';
import { HealthService, type ReadinessReport } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let report: ReadinessReport;

  function responseSpy() {
    const status = jest.fn();
    return { status, response: { status } as unknown as Response };
  }

  beforeEach(async () => {
    report = {
      status: 'ready',
      checks: {
        database: { status: 'up', latencyMs: 1 },
        redis: { status: 'up', latencyMs: 1 },
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: { report: () => Promise.resolve(report) },
        },
      ],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('answers liveness without touching a dependency', () => {
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('answers 200 while every dependency is reachable', async () => {
    const { status, response } = responseSpy();

    const result = await controller.ready(response);

    expect(status).toHaveBeenCalledWith(200);
    expect(result.status).toBe('ready');
  });

  it('answers 503 so a balancer can take the instance out of rotation', async () => {
    report = {
      status: 'degraded',
      checks: { database: { status: 'down' }, redis: { status: 'up' } },
    };
    const { status, response } = responseSpy();

    const result = await controller.ready(response);

    expect(status).toHaveBeenCalledWith(503);
    expect(result.checks.database.status).toBe('down');
  });
});

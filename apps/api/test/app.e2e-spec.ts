import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/health returns ok', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    const body = response.body as { status: string };
    expect(body.status).toBe('ok');
  });

  it('GET /api/health/ready reaches the database it claims to be ready for', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200);
    const body = response.body as {
      status: string;
      checks: Record<string, { status: string; latencyMs?: number }>;
    };

    expect(body.status).toBe('ready');
    expect(body.checks.database.status).toBe('up');
    expect(body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(['up', 'skipped']).toContain(body.checks.redis.status);
  });
});

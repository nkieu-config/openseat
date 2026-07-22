import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

const CHECK_TIMEOUT_MS = 2_000;

export type DependencyStatus = 'up' | 'down' | 'skipped';

export type DependencyCheck = {
  status: DependencyStatus;
  latencyMs?: number;
};

export type ReadinessReport = {
  status: 'ready' | 'degraded';
  checks: {
    database: DependencyCheck;
    redis: DependencyCheck;
  };
};

@Injectable()
export class HealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private redis: Redis | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      return;
    }
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: CHECK_TIMEOUT_MS,
    });
    this.redis.on('error', (error: Error) =>
      this.logger.warn(`readiness redis connection: ${error.message}`),
    );
  }

  async onModuleDestroy() {
    const client = this.redis;
    this.redis = null;
    if (client) {
      await client.quit().catch(() => undefined);
    }
  }

  async report(): Promise<ReadinessReport> {
    const [database, redis] = await Promise.all([
      this.check('database', () => this.prisma.$queryRaw`SELECT 1`),
      this.checkRedis(),
    ]);
    const checks = { database, redis };
    const down = Object.values(checks).some((check) => check.status === 'down');
    return { status: down ? 'degraded' : 'ready', checks };
  }

  private checkRedis(): Promise<DependencyCheck> {
    const client = this.redis;
    if (!client) {
      return Promise.resolve({ status: 'skipped' });
    }
    return this.check('redis', () => client.ping());
  }

  private async check(
    name: string,
    run: () => Promise<unknown>,
  ): Promise<DependencyCheck> {
    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        run(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`)),
            CHECK_TIMEOUT_MS,
          );
        }),
      ]);
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      this.logger.error(`readiness ${name}: ${(error as Error).message}`);
      return { status: 'down' };
    } finally {
      clearTimeout(timer);
    }
  }
}

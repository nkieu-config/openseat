import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { HoldsService } from '../holds/holds.service';

const QUEUE_NAME = 'holds';
const DEFAULT_SWEEP_INTERVAL_MS = 30_000;

@Injectable()
export class HoldSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HoldSweeperService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connections: Redis[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly holds: HoldsService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set; hold sweeper disabled');
      return;
    }
    const intervalMs = Number(
      this.config.get('HOLD_SWEEP_INTERVAL_MS') ?? DEFAULT_SWEEP_INTERVAL_MS,
    );

    const queueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const workerConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.connections = [queueConnection, workerConnection];
    for (const connection of this.connections) {
      connection.on('error', (error) => {
        this.logger.warn(`Sweeper redis connection error: ${error.message}`);
      });
    }

    this.queue = new Queue(QUEUE_NAME, { connection: queueConnection });
    await this.queue.upsertJobScheduler('sweep-expired-holds', {
      every: intervalMs,
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async () => {
        const released = await this.holds.sweepExpired();
        if (released > 0) {
          this.logger.log(`Released ${released} expired holds`);
        }
      },
      { connection: workerConnection },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`Hold sweeper worker error: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await Promise.all(
      this.connections.map((connection) => connection.quit().catch(() => null)),
    );
  }
}

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { OutboxService } from '../outbox/outbox.service';

const QUEUE_NAME = 'outbox';
const DEFAULT_DISPATCH_INTERVAL_MS = 5_000;

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connections: Redis[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set; outbox dispatcher disabled');
      return;
    }
    const intervalMs = Number(
      this.config.get('OUTBOX_DISPATCH_INTERVAL_MS') ??
        DEFAULT_DISPATCH_INTERVAL_MS,
    );

    const queueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const workerConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.connections = [queueConnection, workerConnection];
    for (const connection of this.connections) {
      connection.on('error', (error) => {
        this.logger.warn(`Outbox redis connection error: ${error.message}`);
      });
    }

    this.queue = new Queue(QUEUE_NAME, { connection: queueConnection });
    await this.queue.upsertJobScheduler('dispatch-outbox', {
      every: intervalMs,
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async () => {
        await this.outbox.dispatchPending();
      },
      { connection: workerConnection },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`Outbox worker error: ${error.message}`);
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

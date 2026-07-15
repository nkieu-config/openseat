import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const ORDERS_QUEUE = 'orders';

@Injectable()
export class OrdersQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersQueueService.name);
  private queue: Queue | null = null;
  private connection: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set; order expiry scheduling disabled');
      return;
    }
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.connection.on('error', (error) => {
      this.logger.warn(`Orders queue redis error: ${error.message}`);
    });
    this.queue = new Queue(ORDERS_QUEUE, { connection: this.connection });
  }

  enqueueExpiry(orderId: string, delayMs: number) {
    void this.queue
      ?.add(
        'expire',
        { orderId },
        {
          delay: delayMs,
          jobId: `expire-${orderId}`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      )
      .catch((error: Error) => {
        this.logger.warn(
          `Could not schedule expiry for order ${orderId}: ${error.message}`,
        );
      });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit().catch(() => null);
  }
}

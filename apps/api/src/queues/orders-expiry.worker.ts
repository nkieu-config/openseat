import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { EXPIRE_JOB, ORDERS_QUEUE } from '../orders/orders.queue';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class OrdersExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersExpiryWorker.name);
  private worker: Worker | null = null;
  private connection: Redis | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly orders: OrdersService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      return;
    }
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.connection.on('error', (error) => {
      this.logger.warn(`Orders expiry redis error: ${error.message}`);
    });
    this.worker = new Worker(
      ORDERS_QUEUE,
      async (job) => {
        if (job.name !== EXPIRE_JOB) {
          const reconciled = await this.orders.reconcileExpired();
          if (reconciled > 0) {
            this.logger.log(`Reconciled ${reconciled} stranded orders`);
          }
          return;
        }
        const { orderId } = job.data as { orderId: string };
        await this.orders.expireOrder(orderId);
      },
      { connection: this.connection },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`Orders expiry worker error: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit().catch(() => null);
  }
}

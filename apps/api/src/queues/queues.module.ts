import { Module } from '@nestjs/common';
import { HoldsModule } from '../holds/holds.module';
import { OrdersModule } from '../orders/orders.module';
import { OutboxModule } from '../outbox/outbox.module';
import { HoldSweeperService } from './hold-sweeper.service';
import { OrdersExpiryWorker } from './orders-expiry.worker';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

@Module({
  imports: [HoldsModule, OrdersModule, OutboxModule],
  providers: [HoldSweeperService, OrdersExpiryWorker, OutboxDispatcherService],
})
export class QueuesModule {}

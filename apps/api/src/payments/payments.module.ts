import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PaymockClientModule } from '../paymock-client/paymock-client.module';
import { RefundsModule } from '../refunds/refunds.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [PaymockClientModule, OutboxModule, OrdersModule, RefundsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}

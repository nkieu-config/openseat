import { Module } from '@nestjs/common';
import { AdmissionModule } from '../admission/admission.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PaymockClientModule } from '../paymock-client/paymock-client.module';
import { OrdersController } from './orders.controller';
import { OrdersQueueService } from './orders.queue';
import { OrdersService } from './orders.service';

@Module({
  imports: [OutboxModule, PaymockClientModule, AdmissionModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersQueueService],
  exports: [OrdersService],
})
export class OrdersModule {}

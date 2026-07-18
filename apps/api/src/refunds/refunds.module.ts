import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PaymockClientModule } from '../paymock-client/paymock-client.module';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [OutboxModule, PaymockClientModule, AccessModule],
  controllers: [RefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}

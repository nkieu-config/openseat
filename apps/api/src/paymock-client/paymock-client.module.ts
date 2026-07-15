import { Module } from '@nestjs/common';
import { PaymockClientService } from './paymock-client.service';

@Module({
  providers: [PaymockClientService],
  exports: [PaymockClientService],
})
export class PaymockClientModule {}

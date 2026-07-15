import { Module } from '@nestjs/common';
import { HoldsModule } from '../holds/holds.module';
import { HoldSweeperService } from './hold-sweeper.service';

@Module({
  imports: [HoldsModule],
  providers: [HoldSweeperService],
})
export class QueuesModule {}

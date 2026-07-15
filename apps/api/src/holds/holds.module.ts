import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { HoldsController } from './holds.controller';
import { HoldsService } from './holds.service';

@Module({
  imports: [RealtimeModule],
  controllers: [HoldsController],
  providers: [HoldsService],
  exports: [HoldsService],
})
export class HoldsModule {}

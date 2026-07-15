import { Module } from '@nestjs/common';
import { AdmissionModule } from '../admission/admission.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { HoldsController } from './holds.controller';
import { HoldsService } from './holds.service';

@Module({
  imports: [RealtimeModule, AdmissionModule],
  controllers: [HoldsController],
  providers: [HoldsService],
  exports: [HoldsService],
})
export class HoldsModule {}

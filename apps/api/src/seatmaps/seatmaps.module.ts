import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AdmissionModule } from '../admission/admission.module';
import { SeatmapsController } from './seatmaps.controller';
import { SeatmapsService } from './seatmaps.service';

@Module({
  imports: [AdmissionModule, AccessModule],
  controllers: [SeatmapsController],
  providers: [SeatmapsService],
  exports: [SeatmapsService],
})
export class SeatmapsModule {}

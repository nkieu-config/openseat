import { Module } from '@nestjs/common';
import { AdmissionModule } from '../admission/admission.module';
import { SeatmapsController } from './seatmaps.controller';
import { SeatmapsService } from './seatmaps.service';

@Module({
  imports: [AdmissionModule],
  controllers: [SeatmapsController],
  providers: [SeatmapsService],
  exports: [SeatmapsService],
})
export class SeatmapsModule {}

import { Module } from '@nestjs/common';
import { SeatmapsController } from './seatmaps.controller';
import { SeatmapsService } from './seatmaps.service';

@Module({
  controllers: [SeatmapsController],
  providers: [SeatmapsService],
  exports: [SeatmapsService],
})
export class SeatmapsModule {}

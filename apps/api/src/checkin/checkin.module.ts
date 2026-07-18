import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';

@Module({
  imports: [AccessModule],
  controllers: [CheckinController],
  providers: [CheckinService],
})
export class CheckinModule {}

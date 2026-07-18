import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AccessModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}

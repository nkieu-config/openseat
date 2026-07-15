import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OutboxService } from './outbox.service';

@Module({
  imports: [NotificationsModule, RealtimeModule],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}

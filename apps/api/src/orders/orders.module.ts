import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [NotificationsModule, RealtimeModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

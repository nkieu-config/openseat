import { join } from 'path';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { stdSerializers } from 'pino';
import { AccessModule } from './access/access.module';
import { AuthModule } from './auth/auth.module';
import { CheckinModule } from './checkin/checkin.module';
import { GqlThrottlerGuard } from './graphql/gql-throttler.guard';
import { DashboardModule } from './dashboard/dashboard.module';
import { DemoModule } from './demo/demo.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { HoldsModule } from './holds/holds.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { OutboxModule } from './outbox/outbox.module';
import { PaymentsModule } from './payments/payments.module';
import { PaymockClientModule } from './paymock-client/paymock-client.module';
import { RefundsModule } from './refunds/refunds.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueuesModule } from './queues/queues.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SeatmapsModule } from './seatmaps/seatmaps.module';
import { TeamModule } from './team/team.module';
import { TelemetryExceptionFilter } from './telemetry/telemetry-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        autoLogging: {
          ignore: (req) => req.url === '/api/health',
        },
        serializers: {
          req: (request: Parameters<typeof stdSerializers.req>[0]) => {
            const serialized: Record<string, unknown> = {
              ...stdSerializers.req(request),
            };
            delete serialized.query;
            serialized.url = String(serialized.url).split('?')[0];
            return serialized;
          },
        },
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: 60_000,
            limit: Number(config.get('THROTTLE_LIMIT') ?? 120),
          },
        ],
      }),
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile:
        process.env.NODE_ENV === 'production'
          ? true
          : join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      path: '/api/graphql',
      playground: false,
      introspection: process.env.NODE_ENV !== 'production',
      context: ({ req }: { req: unknown }) => ({ req }),
    }),
    PrismaModule,
    AuthModule,
    AccessModule,
    TeamModule,
    DemoModule,
    EventsModule,
    DashboardModule,
    CheckinModule,
    RealtimeModule,
    HoldsModule,
    SeatmapsModule,
    OrdersModule,
    OutboxModule,
    PaymockClientModule,
    PaymentsModule,
    RefundsModule,
    QueuesModule,
    NotificationsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
    { provide: APP_FILTER, useClass: TelemetryExceptionFilter },
  ],
})
export class AppModule {}

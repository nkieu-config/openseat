import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardResolver } from './dashboard.resolver';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PrismaModule, AccessModule],
  providers: [DashboardResolver, DashboardService],
})
export class DashboardModule {}

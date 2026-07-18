import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [AccessModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}

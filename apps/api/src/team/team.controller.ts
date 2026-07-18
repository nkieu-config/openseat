import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type RequestUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards';
import { AddTeamMemberDto, UpdateTeamMemberDto } from './dto/team-member.dto';
import { TeamService } from './team.service';

@ApiTags('team')
@Controller('events/:eventId/team')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(@Param('eventId') eventId: string, @CurrentUser() user: RequestUser) {
    return this.team.list(eventId, user.id);
  }

  @Post()
  @HttpCode(201)
  add(
    @Param('eventId') eventId: string,
    @Body() dto: AddTeamMemberDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.team.add(eventId, user.id, dto);
  }

  @Patch(':memberId')
  changeRole(
    @Param('eventId') eventId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateTeamMemberDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.team.changeRole(eventId, user.id, memberId, dto.role);
  }

  @Delete(':memberId')
  @HttpCode(204)
  async remove(
    @Param('eventId') eventId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.team.remove(eventId, user.id, memberId);
  }
}

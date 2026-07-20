import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, type RequestUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards';
import { CheckinService } from './checkin.service';
import { CheckinDto, CheckinResultDto } from './dto/checkin.dto';

@ApiTags('checkin')
@ApiBearerAuth()
@Controller('events')
export class CheckinController {
  constructor(private readonly checkin: CheckinService) {}

  @Post(':id/checkin')
  @ApiCreatedResponse({ type: CheckinResultDto })
  @UseGuards(JwtAuthGuard)
  scan(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CheckinDto,
  ) {
    return this.checkin.checkIn(id, user.id, dto.qrToken);
  }

  @Get(':id/attendees.csv')
  @UseGuards(JwtAuthGuard)
  async csv(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const csv = await this.checkin.attendeesCsv(id, user.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attendees-${id}.csv"`,
    );
    res.send(csv);
  }
}

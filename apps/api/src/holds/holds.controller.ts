import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { HoldsService } from './holds.service';

class AcquireHoldDto {
  @IsString()
  @Length(1, 64)
  seatId!: string;
}

function requireHolderKey(holderKey?: string): string {
  if (!holderKey || holderKey.length < 8 || holderKey.length > 64) {
    throw new BadRequestException(
      'X-Hold-Key header of 8-64 characters is required',
    );
  }
  return holderKey;
}

@ApiTags('holds')
@Controller('events/:eventId/holds')
export class HoldsController {
  constructor(private readonly holds: HoldsService) {}

  @Post()
  @HttpCode(201)
  @ApiHeader({ name: 'X-Hold-Key', required: true })
  acquire(
    @Param('eventId') eventId: string,
    @Body() dto: AcquireHoldDto,
    @Headers('x-hold-key') holderKey?: string,
  ) {
    return this.holds.acquire(eventId, dto.seatId, requireHolderKey(holderKey));
  }

  @Get('mine')
  @ApiHeader({ name: 'X-Hold-Key', required: true })
  listMine(
    @Param('eventId') eventId: string,
    @Headers('x-hold-key') holderKey?: string,
  ) {
    return this.holds.listMine(eventId, requireHolderKey(holderKey));
  }

  @Delete(':seatId')
  @HttpCode(204)
  @ApiHeader({ name: 'X-Hold-Key', required: true })
  async release(
    @Param('eventId') eventId: string,
    @Param('seatId') seatId: string,
    @Headers('x-hold-key') holderKey?: string,
  ) {
    await this.holds.release(eventId, seatId, requireHolderKey(holderKey));
  }
}

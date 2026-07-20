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
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { AdmissionGuard } from '../admission/admission.guard';
import { HoldsService } from './holds.service';

class AcquireHoldDto {
  @ApiProperty()
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

import { HoldDto } from './dto/hold-response.dto';

@ApiTags('holds')
@Controller('events/:eventId/holds')
export class HoldsController {
  constructor(private readonly holds: HoldsService) {}

  @Post()
  @HttpCode(201)
  @ApiCreatedResponse({ type: HoldDto })
  @UseGuards(AdmissionGuard)
  @ApiHeader({ name: 'x-hold-key', required: true })
  @ApiHeader({ name: 'x-admission-token', required: false })
  acquire(
    @Param('eventId') eventId: string,
    @Body() dto: AcquireHoldDto,
    @Headers('x-hold-key') holderKey?: string,
  ) {
    return this.holds.acquire(eventId, dto.seatId, requireHolderKey(holderKey));
  }

  @Get('mine')
  @ApiOkResponse({ type: [HoldDto] })
  @ApiHeader({ name: 'x-hold-key', required: true })
  listMine(
    @Param('eventId') eventId: string,
    @Headers('x-hold-key') holderKey?: string,
  ) {
    return this.holds.listMine(eventId, requireHolderKey(holderKey));
  }

  @Delete(':seatId')
  @HttpCode(204)
  @ApiHeader({ name: 'x-hold-key', required: true })
  async release(
    @Param('eventId') eventId: string,
    @Param('seatId') seatId: string,
    @Headers('x-hold-key') holderKey?: string,
  ) {
    await this.holds.release(eventId, seatId, requireHolderKey(holderKey));
  }
}

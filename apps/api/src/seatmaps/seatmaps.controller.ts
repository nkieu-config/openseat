import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentUser, type RequestUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards';
import { SeatmapsService } from './seatmaps.service';

export class SeatMapSectionDto {
  @ApiProperty({ example: 'Front' })
  @IsString()
  @Length(1, 20)
  name!: string;

  @ApiProperty({ minimum: 1, maximum: 26 })
  @IsInt()
  @Min(1)
  @Max(26)
  rows!: number;

  @ApiProperty({ minimum: 1, maximum: 30 })
  @IsInt()
  @Min(1)
  @Max(30)
  cols!: number;

  @ApiProperty({ example: 'Front zone' })
  @IsString()
  @Length(1, 80)
  tierName!: string;
}

export class CreateSeatMapDto {
  @ApiProperty({ type: [SeatMapSectionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SeatMapSectionDto)
  sections!: SeatMapSectionDto[];
}

@ApiTags('seat-maps')
@Controller('events/:eventId/seat-map')
export class SeatmapsController {
  constructor(private readonly seatmaps: SeatmapsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  create(
    @CurrentUser() user: RequestUser,
    @Param('eventId') eventId: string,
    @Body() dto: CreateSeatMapDto,
  ) {
    return this.seatmaps.create(eventId, user.id, dto);
  }

  @Get()
  @ApiHeader({ name: 'X-Hold-Key', required: false })
  get(
    @Param('eventId') eventId: string,
    @Headers('x-hold-key') holderKey?: string,
  ) {
    return this.seatmaps.getForEvent(eventId, holderKey ?? null);
  }
}

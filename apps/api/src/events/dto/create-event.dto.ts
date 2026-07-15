import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateTicketTypeDto {
  @ApiProperty({ example: 'General admission' })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiProperty({ minimum: 1, maximum: 100_000 })
  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 100_000_000,
    description: 'Price in satang; 0 = free',
  })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceSatang!: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPerOrder?: number;
}

export class CreateEventDto {
  @ApiProperty({ example: 'Bangkok Indie Fest' })
  @IsString()
  @Length(3, 120)
  title!: string;

  @ApiPropertyOptional({ default: '' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: 'Voice Space, Bangkok' })
  @IsString()
  @Length(1, 160)
  venueName!: string;

  @ApiProperty({ example: '2026-09-01T12:00:00.000Z' })
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional({ example: '2026-09-01T16:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiProperty({ type: [CreateTicketTypeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateTicketTypeDto)
  ticketTypes!: CreateTicketTypeDto[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemInputDto {
  @ApiProperty()
  @IsString()
  ticketTypeId!: string;

  @ApiProperty({ minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

export class CreateOrderDto {
  @ApiPropertyOptional({ type: [OrderItemInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items?: OrderItemInputDto[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Seat ids currently held by the caller',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  seatIds?: string[];

  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  buyerEmail!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @Length(1, 80)
  buyerName!: string;
}

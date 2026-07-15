import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CheckinDto {
  @ApiProperty({ description: 'The scanned ticket QR token' })
  @IsString()
  @Length(1, 200)
  qrToken!: string;
}

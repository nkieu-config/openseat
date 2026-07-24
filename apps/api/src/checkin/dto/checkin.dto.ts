import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CheckinDto {
  @ApiProperty({ description: 'The scanned ticket QR token' })
  @IsString()
  @Length(1, 200)
  qrToken!: string;
}

export class CheckinResultDto {
  outcome!: 'checked_in' | 'already_checked_in';
  ticketId!: string;
  attendeeName!: string;
  ticketType!: string;
  seat!: string | null;
  status!: string;
  checkedInAt!: string | null;
}

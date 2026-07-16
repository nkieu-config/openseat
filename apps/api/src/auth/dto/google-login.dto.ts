import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google Identity Services ID token (JWT)' })
  @IsString()
  @IsNotEmpty()
  credential!: string;
}

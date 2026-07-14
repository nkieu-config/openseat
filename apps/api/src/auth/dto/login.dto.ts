import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(72)
  password!: string;
}

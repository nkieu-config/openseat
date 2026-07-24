import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn } from 'class-validator';

export class AddTeamMemberDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ['manager', 'staff'] })
  @IsIn(['manager', 'staff'])
  role!: 'manager' | 'staff';
}

export class UpdateTeamMemberDto {
  @ApiProperty({ enum: ['manager', 'staff'] })
  @IsIn(['manager', 'staff'])
  role!: 'manager' | 'staff';
}

export class TeamMemberDto {
  id!: string;
  email!: string;
  role!: string;
  linked!: boolean;
  createdAt!: string;
}

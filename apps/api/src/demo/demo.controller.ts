import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn } from 'class-validator';
import type { Response } from 'express';
import { REFRESH_COOKIE } from '../auth/auth.controller';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';
import { DemoService } from './demo.service';

class DemoLoginDto {
  @ApiProperty({ enum: ['buyer', 'organizer', 'staff'] })
  @IsIn(['buyer', 'organizer', 'staff'])
  role!: 'buyer' | 'organizer' | 'staff';
}

@ApiTags('demo')
@Controller('demo')
export class DemoController {
  constructor(
    private readonly demo: DemoService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthResponseDto })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async login(
    @Body() dto: DemoLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.demo.loginAs(dto.role);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      expires: tokens.refreshExpiresAt,
    });
    return { user, accessToken: tokens.accessToken };
  }
}

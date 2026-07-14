import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { RequestUser } from './current-user.decorator';

export const DEV_JWT_SECRET = 'dev-secret-change-me';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET') ?? DEV_JWT_SECRET,
      ignoreExpiration: false,
    });
  }

  validate(payload: { sub: string; email: string }): RequestUser {
    return { id: payload.sub, email: payload.email };
  }
}

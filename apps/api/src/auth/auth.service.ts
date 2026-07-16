import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '../generated/prisma/client';
import { Prisma } from '../generated/prisma/client';
import { MAX_DISPLAY_NAME_LENGTH } from './auth.constants';

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  isDemo: boolean;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
};

const REFRESH_TOKEN_BYTES = 48;
const DEFAULT_REFRESH_TTL_DAYS = 30;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isDemo: user.isDemo,
  };
}

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private refreshTtlMs(): number {
    const days = Number(
      this.config.get('REFRESH_TTL_DAYS') ?? DEFAULT_REFRESH_TTL_DAYS,
    );
    return days * 24 * 60 * 60 * 1000;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(input.password);
    try {
      const user = await this.prisma.user.create({
        data: { email, displayName: input.displayName.trim(), passwordHash },
      });
      return { user: toPublicUser(user), tokens: await this.issueTokens(user) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordMatches = await argon2.verify(
      user.passwordHash,
      input.password,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { user: toPublicUser(user), tokens: await this.issueTokens(user) };
  }

  async loginWithGoogle(
    credential: string,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google account could not be verified');
    }

    const email = payload.email.trim().toLowerCase();
    const displayName = (payload.name?.trim() || email.split('@')[0]).slice(
      0,
      MAX_DISPLAY_NAME_LENGTH,
    );
    const user = await this.findOrCreateGoogleUser({
      googleId: payload.sub,
      email,
      displayName,
    });
    return { user: toPublicUser(user), tokens: await this.issueTokens(user) };
  }

  private async findOrCreateGoogleUser(input: {
    googleId: string;
    email: string;
    displayName: string;
  }): Promise<User> {
    const byGoogleId = await this.prisma.user.findUnique({
      where: { googleId: input.googleId },
    });
    if (byGoogleId) {
      return byGoogleId;
    }

    const byEmail = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (byEmail) {
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: input.googleId, passwordHash: null },
      });
    }

    try {
      return await this.prisma.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          googleId: input.googleId,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.prisma.user.findFirst({
          where: {
            OR: [{ googleId: input.googleId }, { email: input.email }],
          },
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async issueTokens(user: User): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
    });
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  async rotateRefreshToken(
    presentedToken: string,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(presentedToken) },
      include: { user: true },
    });
    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return {
      user: toPublicUser(record.user),
      tokens: await this.issueTokens(record.user),
    };
  }

  async revokeRefreshToken(presentedToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(presentedToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return toPublicUser(user);
  }
}

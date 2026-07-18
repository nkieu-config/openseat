import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    teamMember: {
      updateMany: jest.fn(),
    },
  };

  const baseUser = {
    id: 'user-1',
    email: 'ada@example.com',
    displayName: 'Ada',
    passwordHash: null as string | null,
    googleId: null,
    isDemo: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('access') },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
    prisma.refreshToken.create.mockResolvedValue({});
  });

  it('registers a user and issues tokens', async () => {
    let storedPasswordHash = '';
    prisma.user.create.mockImplementation(
      (args: {
        data: { email: string; displayName: string; passwordHash: string };
      }) => {
        storedPasswordHash = args.data.passwordHash;
        return Promise.resolve({ ...baseUser, ...args.data });
      },
    );

    const result = await service.register({
      email: '  Ada@Example.com ',
      password: 'correct horse',
      displayName: 'Ada',
    });

    expect(result.user.email).toBe('ada@example.com');
    expect(result.tokens.accessToken).toBe('access');
    expect(result.tokens.refreshToken).toHaveLength(64);
    await expect(
      argon2.verify(storedPasswordHash, 'correct horse'),
    ).resolves.toBe(true);
  });

  it('maps duplicate email to a conflict error', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.register({
        email: 'ada@example.com',
        password: 'password123',
        displayName: 'Ada',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a wrong password without revealing which field failed', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      passwordHash: await argon2.hash('right password'),
    });

    await expect(
      service.login({ email: 'ada@example.com', password: 'wrong password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes the whole family when a revoked refresh token is replayed', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: baseUser.id,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: baseUser,
    });

    await expect(
      service.rotateRefreshToken('replayed-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: baseUser.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('rotates a valid refresh token and revokes the presented one', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: baseUser.id,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: baseUser,
    });
    prisma.refreshToken.update.mockResolvedValue({});

    const result = await service.rotateRefreshToken('valid-token');

    expect(result.tokens.accessToken).toBe('access');
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });
});

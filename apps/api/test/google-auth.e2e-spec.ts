import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { OAuth2Client } from 'google-auth-library';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.THROTTLE_LIMIT = '100000';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

type AuthBody = {
  user: { id: string; email: string; displayName: string };
  accessToken: string;
};

function hasRefreshCookie(res: request.Response): boolean {
  const headers = res.headers as Record<string, string[] | string | undefined>;
  const header = headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : [header ?? ''];
  return cookies.some((cookie) => cookie.startsWith('os_refresh='));
}

describe('Google sign-in (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let verifySpy: jest.SpyInstance;

  const suffix = `${process.pid}-${Date.now()}`;
  const newEmail = `g-new-${suffix}@example.com`;
  const linkEmail = `g-link-${suffix}@example.com`;
  const newSub = `sub-new-${suffix}`;
  const linkSub = `sub-link-${suffix}`;

  function mockPayload(payload: Record<string, unknown>) {
    verifySpy.mockResolvedValueOnce({ getPayload: () => payload });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    verifySpy = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [newEmail, linkEmail] } },
    });
    await app.close();
  });

  it('creates a passwordless user, then reuses it by googleId', async () => {
    mockPayload({
      sub: newSub,
      email: newEmail,
      email_verified: true,
      name: 'Grace Hopper',
    });
    const firstRes = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'token-1' })
      .expect(200);
    const first = firstRes.body as AuthBody;
    expect(first.user.email).toBe(newEmail);
    expect(first.user.displayName).toBe('Grace Hopper');
    expect(first.accessToken).toEqual(expect.any(String));
    expect(hasRefreshCookie(firstRes)).toBe(true);

    const created = await prisma.user.findUnique({
      where: { googleId: newSub },
    });
    expect(created?.passwordHash).toBeNull();

    mockPayload({
      sub: newSub,
      email: newEmail,
      email_verified: true,
      name: 'Grace Hopper',
    });
    const secondRes = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'token-2' })
      .expect(200);
    const second = secondRes.body as AuthBody;
    expect(second.user.id).toBe(first.user.id);

    const count = await prisma.user.count({ where: { email: newEmail } });
    expect(count).toBe(1);
  });

  it('links a Google identity onto an existing password account', async () => {
    const registeredRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: linkEmail,
        password: 'link-pass-1234',
        displayName: 'Ada',
      })
      .expect(201);
    const existingId = (registeredRes.body as AuthBody).user.id;

    mockPayload({
      sub: linkSub,
      email: linkEmail,
      email_verified: true,
      name: 'Ada Lovelace',
    });
    const res = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'token-link' })
      .expect(200);
    expect((res.body as AuthBody).user.id).toBe(existingId);

    const linked = await prisma.user.findUnique({ where: { id: existingId } });
    expect(linked?.googleId).toBe(linkSub);
    expect(linked?.passwordHash).toBeNull();
  });

  it('rejects a Google account with an unverified email', async () => {
    mockPayload({
      sub: `sub-bad-${suffix}`,
      email: `bad-${suffix}@example.com`,
      email_verified: false,
    });
    await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'token-bad' })
      .expect(401);
  });

  it('rejects an invalid Google credential', async () => {
    verifySpy.mockRejectedValueOnce(new Error('bad token'));
    await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'garbage' })
      .expect(401);
  });
});

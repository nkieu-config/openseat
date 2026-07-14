import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type AuthResponse = { user: { email: string }; accessToken: string };

function refreshCookieOf(res: request.Response): string {
  const headers = res.headers as Record<string, string[] | string | undefined>;
  const header = headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : [header ?? ''];
  const match = cookies.find((cookie) => cookie.startsWith('os_refresh='));
  if (!match) {
    throw new Error('missing os_refresh cookie');
  }
  return match.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const email = `auth-e2e-${process.pid}-${Date.now()}@example.com`;
  const password = 'a-strong-password';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('registers, authenticates, rotates, and detects refresh reuse', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, displayName: 'E2E Tester' })
      .expect(201);
    const registerBody = registerRes.body as AuthResponse;
    expect(registerBody.user.email).toBe(email);
    const firstCookie = refreshCookieOf(registerRes);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registerBody.accessToken}`)
      .expect(200);

    const refreshRes = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    const secondCookie = refreshCookieOf(refreshRes);
    expect(secondCookie).not.toBe(firstCookie);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', secondCookie)
      .expect(401);
  });

  it('rejects a login with the wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'not-the-password' })
      .expect(401);
  });
});

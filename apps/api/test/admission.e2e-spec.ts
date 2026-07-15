import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHmac } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.THROTTLE_LIMIT = '100000';
process.env.GATE_ADMISSION_SECRET = 'e2e-admission-secret';

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function signAdmission(
  secret: string,
  visitorId: string,
  eventId: string,
  ttlSeconds = 300,
): string {
  const header = b64url('{"alg":"HS256","typ":"JWT"}');
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      sub: visitorId,
      eventId,
      iat: now,
      exp: now + ttlSeconds,
    }),
  );
  const signature = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const SECRET = process.env.GATE_ADMISSION_SECRET;

describe('Admission gating (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let dropEventId: string;
  let dropTypeId: string;
  let openEventId: string;
  let openTypeId: string;
  const organizerEmail = `admission-${process.pid}-${Date.now()}@example.com`;

  async function makeEvent(
    title: string,
  ): Promise<{ id: string; ticketTypeId: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title,
        venueName: 'Queue Hall',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ticketTypes: [{ name: 'Pass', quantity: 100, priceSatang: 0 }],
      })
      .expect(201);
    const body = res.body as { id: string; ticketTypes: { id: string }[] };
    await request(app.getHttpServer())
      .post(`/api/events/${body.id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    return { id: body.id, ticketTypeId: body.ticketTypes[0].id };
  }

  function claim(eventId: string, ticketTypeId: string, token?: string) {
    const req = request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders`)
      .send({
        items: [{ ticketTypeId, quantity: 1 }],
        buyerEmail: 'buyer@example.com',
        buyerName: 'Buyer',
      });
    if (token) {
      return req.set('X-Admission-Token', token);
    }
    return req;
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

    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: organizerEmail,
        password: 'admission-pass',
        displayName: 'Organizer',
      })
      .expect(201);
    accessToken = (registerRes.body as { accessToken: string }).accessToken;

    const drop = await makeEvent('On-sale Drop');
    dropEventId = drop.id;
    dropTypeId = drop.ticketTypeId;
    await prisma.event.update({
      where: { id: dropEventId },
      data: { dropMode: true },
    });

    const open = await makeEvent('Regular Event');
    openEventId = open.id;
    openTypeId = open.ticketTypeId;
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { eventId: { in: [dropEventId, openEventId] } },
    });
    await prisma.order.deleteMany({
      where: { eventId: { in: [dropEventId, openEventId] } },
    });
    await prisma.event.deleteMany({
      where: { id: { in: [dropEventId, openEventId] } },
    });
    await prisma.user.deleteMany({ where: { email: organizerEmail } });
    await app.close();
  });

  it('blocks checkout on a drop event without an admission token', async () => {
    const res = await claim(dropEventId, dropTypeId);
    expect(res.status).toBe(403);
    expect((res.body as { code?: string }).code).toBe('ADMISSION_REQUIRED');
  });

  it('allows checkout on a drop event with a valid admission token', async () => {
    const token = signAdmission(SECRET, 'v:test', dropEventId);
    const res = await claim(dropEventId, dropTypeId, token);
    expect(res.status).toBe(201);
  });

  it('rejects an admission token minted for another event', async () => {
    const token = signAdmission(SECRET, 'v:test', openEventId);
    const res = await claim(dropEventId, dropTypeId, token);
    expect(res.status).toBe(403);
  });

  it('rejects an admission token signed with the wrong secret', async () => {
    const token = signAdmission('not-the-secret', 'v:test', dropEventId);
    const res = await claim(dropEventId, dropTypeId, token);
    expect(res.status).toBe(403);
  });

  it('rejects an expired admission token', async () => {
    const token = signAdmission(SECRET, 'v:test', dropEventId, -10);
    const res = await claim(dropEventId, dropTypeId, token);
    expect(res.status).toBe(403);
  });

  it('leaves non-drop events open with no admission token', async () => {
    const res = await claim(openEventId, openTypeId);
    expect(res.status).toBe(201);
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.THROTTLE_LIMIT = '100000';

type SeatMapResponse = {
  template: string;
  meta: { maxCols: number; totalRows: number };
  tiers: { name: string }[];
  seats: { section: string; x: number; y: number }[];
};

describe('Seat-map editor (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let eventId: string;
  const organizerEmail = `seatmap-${process.pid}-${Date.now()}@example.com`;

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
        password: 'seatmap-pass',
        displayName: 'Organizer',
      })
      .expect(201);
    accessToken = (registerRes.body as { accessToken: string }).accessToken;

    const eventRes = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Editor Event',
        venueName: 'Grid Hall',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ticketTypes: [{ name: 'General', quantity: 10, priceSatang: 0 }],
      })
      .expect(201);
    eventId = (eventRes.body as { id: string }).id;
  });

  afterAll(async () => {
    await prisma.seat.deleteMany({ where: { eventId } });
    await prisma.ticketType.deleteMany({ where: { eventId } });
    await prisma.seatMap.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { email: organizerEmail } });
    await app.close();
  });

  it('materializes a custom layout at the editor-placed positions', async () => {
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/seat-map`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        sections: [
          {
            name: 'Front',
            tierName: 'Front tier',
            priceSatang: 150000,
            rows: 3,
            cols: 4,
            x: 0,
            y: 0,
          },
          {
            name: 'Wing',
            tierName: 'Wing tier',
            priceSatang: 90000,
            rows: 2,
            cols: 3,
            x: 8,
            y: 5,
          },
        ],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/events/${eventId}/seat-map`)
      .expect(200);
    const map = res.body as SeatMapResponse;

    expect(map.template).toBe('custom');
    expect(map.seats).toHaveLength(3 * 4 + 2 * 3);
    expect(map.tiers.map((tier) => tier.name).sort()).toEqual([
      'Front tier',
      'Wing tier',
    ]);
    expect(map.meta.maxCols).toBe(11);
    expect(map.meta.totalRows).toBe(7);

    const wing = map.seats.filter((seat) => seat.section === 'Wing');
    expect(Math.min(...wing.map((seat) => seat.x))).toBe(8);
    expect(Math.min(...wing.map((seat) => seat.y))).toBe(5);
  });

  it('rejects a second seat map once one exists', async () => {
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/seat-map`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        sections: [
          { name: 'A', tierName: 'A tier', priceSatang: 0, rows: 1, cols: 1 },
        ],
      })
      .expect(409);
  });

  it('rejects duplicate section names', async () => {
    const otherRes = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Dup Sections',
        venueName: 'Grid Hall',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ticketTypes: [{ name: 'General', quantity: 10, priceSatang: 0 }],
      })
      .expect(201);
    const otherId = (otherRes.body as { id: string }).id;

    await request(app.getHttpServer())
      .post(`/api/events/${otherId}/seat-map`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        sections: [
          {
            name: 'Main',
            tierName: 'Tier A',
            priceSatang: 0,
            rows: 1,
            cols: 2,
            x: 0,
            y: 0,
          },
          {
            name: 'Main',
            tierName: 'Tier B',
            priceSatang: 0,
            rows: 1,
            cols: 2,
            x: 4,
            y: 0,
          },
        ],
      })
      .expect(400);

    await prisma.event.deleteMany({ where: { id: otherId } });
  });
});

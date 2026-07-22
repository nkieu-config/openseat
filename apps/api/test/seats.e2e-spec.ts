import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HoldsService } from '../src/holds/holds.service';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.THROTTLE_LIMIT = '100000';
process.env.HOLD_SWEEP_INTERVAL_MS = '600000';

type SeatMapResponse = {
  id: string;
  seats: {
    id: string;
    status: string;
    section: string;
    rowLabel: string;
    number: number;
  }[];
};

type OrderResponse = {
  id: string;
  tickets: {
    id: string;
    seat: { section: string; rowLabel: string; number: number } | null;
  }[];
};

describe('Reserved seating (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let eventId: string;
  let seatIds: string[];
  const organizerEmail = `seats-e2e-${process.pid}-${Date.now()}@example.com`;

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
    await app.listen(0);
    prisma = app.get(PrismaService);

    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: organizerEmail,
        password: 'organizer-pass',
        displayName: 'Organizer',
      })
      .expect(201);
    accessToken = (registerRes.body as { accessToken: string }).accessToken;

    const eventRes = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Seat Race Show',
        venueName: 'Race Hall',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ticketTypes: [{ name: 'GA extra', quantity: 5, priceSatang: 0 }],
      })
      .expect(201);
    eventId = (eventRes.body as { id: string }).id;

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/seat-map`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        sections: [
          {
            name: 'Front',
            rows: 2,
            cols: 8,
            tierName: 'Front zone',
            priceSatang: 0,
          },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const mapRes = await request(app.getHttpServer())
      .get(`/api/events/${eventId}/seat-map`)
      .expect(200);
    seatIds = (mapRes.body as SeatMapResponse).seats.map((seat) => seat.id);
    expect(seatIds).toHaveLength(16);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { eventId } });
    await prisma.order.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { email: organizerEmail } });
    await app.close();
  });

  it('leaves exactly one winner when 50 buyers race for one seat', async () => {
    const targetSeat = seatIds[0];

    async function attemptHold(
      index: number,
      retriesLeft: number,
    ): Promise<number> {
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/events/${eventId}/holds`)
          .set('X-Hold-Key', `race-key-${index}-pad`)
          .send({ seatId: targetSeat });
        return res.status;
      } catch (error) {
        if (retriesLeft === 0) {
          throw error;
        }
        return attemptHold(index, retriesLeft - 1);
      }
    }

    const statuses = await Promise.all(
      Array.from({ length: 50 }, (_, index) => attemptHold(index, 2)),
    );

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(49);

    const holdCount = await prisma.hold.count({
      where: { seatId: targetSeat },
    });
    expect(holdCount).toBe(1);
  }, 60_000);

  it('lets a new buyer take over an expired hold in one step', async () => {
    const seatId = seatIds[1];
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('X-Hold-Key', 'first-holder-key')
      .send({ seatId })
      .expect(201);
    await prisma.hold.updateMany({
      where: { seatId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('X-Hold-Key', 'second-holder-key')
      .send({ seatId })
      .expect(201);

    const hold = await prisma.hold.findUniqueOrThrow({
      where: { eventId_seatId: { eventId, seatId } },
    });
    expect(hold.holderKey).toBe('second-holder-key');
  });

  it('extends the expiry when the same holder re-acquires', async () => {
    const seatId = seatIds[2];
    const first = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('X-Hold-Key', 'refresh-holder-key')
      .send({ seatId })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('X-Hold-Key', 'refresh-holder-key')
      .send({ seatId })
      .expect(201);

    const firstExpiry = new Date(
      (first.body as { expiresAt: string }).expiresAt,
    ).getTime();
    const secondExpiry = new Date(
      (second.body as { expiresAt: string }).expiresAt,
    ).getTime();
    expect(secondExpiry).toBeGreaterThanOrEqual(firstExpiry);
  });

  it('converts held seats into seat-bound tickets exactly once', async () => {
    const buyerKey = 'checkout-holder-key';
    const chosen = [seatIds[3], seatIds[4]];
    for (const seatId of chosen) {
      await request(app.getHttpServer())
        .post(`/api/events/${eventId}/holds`)
        .set('X-Hold-Key', buyerKey)
        .send({ seatId })
        .expect(201);
    }

    const orderRes = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders`)
      .set('X-Hold-Key', buyerKey)
      .send({
        seatIds: chosen,
        buyerEmail: 'seatbuyer@example.com',
        buyerName: 'Seat Buyer',
      })
      .expect(201);
    const order = orderRes.body as OrderResponse;
    expect(order.tickets).toHaveLength(2);
    expect(order.tickets.every((ticket) => ticket.seat !== null)).toBe(true);

    const mapRes = await request(app.getHttpServer())
      .get(`/api/events/${eventId}/seat-map`)
      .expect(200);
    const statuses = new Map(
      (mapRes.body as SeatMapResponse).seats.map((seat) => [
        seat.id,
        seat.status,
      ]),
    );
    expect(statuses.get(chosen[0])).toBe('sold');
    expect(statuses.get(chosen[1])).toBe('sold');

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('X-Hold-Key', 'late-buyer-key')
      .send({ seatId: chosen[0] })
      .expect(409);

    const ticket = await prisma.ticket.findFirst({
      where: { seatId: chosen[0] },
    });
    await expect(
      prisma.ticket.create({
        data: {
          orderId: ticket!.orderId,
          eventId,
          ticketTypeId: ticket!.ticketTypeId,
          seatId: chosen[0],
          attendeeEmail: 'dupe@example.com',
          attendeeName: 'Dupe',
          qrToken: `dupe-${Date.now()}`,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects checkout when the hold has expired', async () => {
    const buyerKey = 'expired-checkout-key';
    const seatId = seatIds[5];
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('X-Hold-Key', buyerKey)
      .send({ seatId })
      .expect(201);
    await prisma.hold.updateMany({
      where: { seatId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders`)
      .set('X-Hold-Key', buyerKey)
      .send({
        seatIds: [seatId],
        buyerEmail: 'late@example.com',
        buyerName: 'Late Buyer',
      })
      .expect(409);

    const tickets = await prisma.ticket.count({ where: { seatId } });
    expect(tickets).toBe(0);
  });

  it('sweeps expired holds and frees their seats', async () => {
    const seatId = seatIds[6];
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('X-Hold-Key', 'sweeper-target-key')
      .send({ seatId })
      .expect(201);
    await prisma.hold.updateMany({
      where: { seatId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const holds = app.get(HoldsService);
    const swept = await holds.sweepExpired();
    expect(swept).toBeGreaterThanOrEqual(1);

    const remaining = await prisma.hold.count({ where: { seatId } });
    expect(remaining).toBe(0);
  });

  it('lets a holder release its own seat and frees it for the next buyer', async () => {
    const seatId = seatIds[7];
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('X-Hold-Key', 'release-owner-key')
      .send({ seatId })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/events/${eventId}/holds/${seatId}`)
      .set('X-Hold-Key', 'release-owner-key')
      .expect(204);

    expect(await prisma.hold.count({ where: { eventId, seatId } })).toBe(0);

    const mapRes = await request(app.getHttpServer())
      .get(`/api/events/${eventId}/seat-map`)
      .expect(200);
    const status = (mapRes.body as SeatMapResponse).seats.find(
      (seat) => seat.id === seatId,
    )?.status;
    expect(status).toBe('available');

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('X-Hold-Key', 'next-buyer-key')
      .send({ seatId })
      .expect(201);
  });

  it('will not let a different hold key release a seat it does not hold', async () => {
    const seatId = seatIds[8];
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('X-Hold-Key', 'rightful-holder-key')
      .send({ seatId })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/events/${eventId}/holds/${seatId}`)
      .set('X-Hold-Key', 'impostor-holder-key')
      .expect(204);

    const hold = await prisma.hold.findUnique({
      where: { eventId_seatId: { eventId, seatId } },
    });
    expect(hold?.holderKey).toBe('rightful-holder-key');
  });

  it('treats releasing a seat nobody holds as a no-op', async () => {
    const seatId = seatIds[9];

    await request(app.getHttpServer())
      .delete(`/api/events/${eventId}/holds/${seatId}`)
      .set('X-Hold-Key', 'nobody-here-key')
      .expect(204);

    expect(await prisma.hold.count({ where: { eventId, seatId } })).toBe(0);
  });

  it('refuses a release with no hold key', async () => {
    await request(app.getHttpServer())
      .delete(`/api/events/${eventId}/holds/${seatIds[10]}`)
      .expect(400);
  });

  it('keeps a hold that a live order depends on when its holder asks to release it', async () => {
    const seatId = seatIds[11];
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('X-Hold-Key', 'bound-order-key')
      .send({ seatId })
      .expect(201);
    await prisma.hold.update({
      where: { eventId_seatId: { eventId, seatId } },
      data: { orderId: 'order-that-reserved-this-seat' },
    });

    await request(app.getHttpServer())
      .delete(`/api/events/${eventId}/holds/${seatId}`)
      .set('X-Hold-Key', 'bound-order-key')
      .expect(204);

    const hold = await prisma.hold.findUnique({
      where: { eventId_seatId: { eventId, seatId } },
    });
    expect(hold).not.toBeNull();
    expect(hold?.orderId).toBe('order-that-reserved-this-seat');
  });
});

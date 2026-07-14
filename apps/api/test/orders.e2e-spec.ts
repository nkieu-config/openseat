import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.THROTTLE_LIMIT = '100000';

type EventResponse = {
  id: string;
  slug: string;
  ticketTypes: {
    id: string;
    name: string;
    remaining: number;
    maxPerOrder: number;
  }[];
};

type OrderResponse = {
  id: string;
  status: string;
  guestToken: string;
  tickets: { id: string; qrToken: string }[];
};

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  const organizerEmail = `orders-e2e-${process.pid}-${Date.now()}@example.com`;
  const createdEventIds: string[] = [];

  async function createPublishedEvent(
    quantity: number,
  ): Promise<EventResponse> {
    const createRes = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Race Test Concert',
        venueName: 'Test Hall',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ticketTypes: [{ name: 'GA', quantity, priceSatang: 0, maxPerOrder: 5 }],
      })
      .expect(201);
    const event = createRes.body as EventResponse;
    createdEventIds.push(event.id);
    await request(app.getHttpServer())
      .post(`/api/events/${event.id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    return event;
  }

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

    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: organizerEmail,
        password: 'organizer-pass',
        displayName: 'Organizer',
      })
      .expect(201);
    accessToken = (registerRes.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { eventId: { in: createdEventIds } },
    });
    await prisma.order.deleteMany({
      where: { eventId: { in: createdEventIds } },
    });
    await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    await prisma.user.deleteMany({ where: { email: organizerEmail } });
    await app.close();
  });

  it('never oversells under 100 concurrent orders for 40 tickets', async () => {
    const event = await createPublishedEvent(40);
    const ticketTypeId = event.ticketTypes[0].id;
    const runId = Date.now();

    async function attemptOrder(index: number, retriesLeft: number): Promise<number> {
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/events/${event.id}/orders`)
          .set('Idempotency-Key', `race-${runId}-${index}`)
          .send({
            items: [{ ticketTypeId, quantity: 1 }],
            buyerEmail: `buyer-${index}@example.com`,
            buyerName: `Buyer ${index}`,
          });
        return res.status;
      } catch (error) {
        if (retriesLeft === 0) {
          throw error;
        }
        return attemptOrder(index, retriesLeft - 1);
      }
    }

    const statuses = await Promise.all(
      Array.from({ length: 100 }, (_, index) => attemptOrder(index, 2)),
    );

    const succeeded = statuses.filter((status) => status === 201).length;
    const soldOut = statuses.filter((status) => status === 409).length;
    expect(succeeded).toBe(40);
    expect(soldOut).toBe(60);

    const ticketType = await prisma.ticketType.findUniqueOrThrow({
      where: { id: ticketTypeId },
    });
    expect(ticketType.remaining).toBe(0);

    const issued = await prisma.ticket.count({ where: { eventId: event.id } });
    expect(issued).toBe(40);
  }, 60_000);

  it('replays the same order for a repeated idempotency key', async () => {
    const event = await createPublishedEvent(10);
    const ticketTypeId = event.ticketTypes[0].id;
    const payload = {
      items: [{ ticketTypeId, quantity: 2 }],
      buyerEmail: 'idem@example.com',
      buyerName: 'Idempotent Buyer',
    };

    const first = await request(app.getHttpServer())
      .post(`/api/events/${event.id}/orders`)
      .set('Idempotency-Key', 'order-key-1')
      .send(payload)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/events/${event.id}/orders`)
      .set('Idempotency-Key', 'order-key-1')
      .send(payload)
      .expect(201);

    const firstOrder = first.body as OrderResponse;
    const secondOrder = second.body as OrderResponse;
    expect(secondOrder.id).toBe(firstOrder.id);

    const ticketType = await prisma.ticketType.findUniqueOrThrow({
      where: { id: ticketTypeId },
    });
    expect(ticketType.remaining).toBe(8);
  });

  it('enforces the per-order limit', async () => {
    const event = await createPublishedEvent(10);
    const ticketTypeId = event.ticketTypes[0].id;

    await request(app.getHttpServer())
      .post(`/api/events/${event.id}/orders`)
      .send({
        items: [{ ticketTypeId, quantity: 6 }],
        buyerEmail: 'greedy@example.com',
        buyerName: 'Greedy Buyer',
      })
      .expect(400);
  });

  it('grants order access by guest token only', async () => {
    const event = await createPublishedEvent(10);
    const ticketTypeId = event.ticketTypes[0].id;

    const orderRes = await request(app.getHttpServer())
      .post(`/api/events/${event.id}/orders`)
      .send({
        items: [{ ticketTypeId, quantity: 1 }],
        buyerEmail: 'guest@example.com',
        buyerName: 'Guest Buyer',
      })
      .expect(201);
    const order = orderRes.body as OrderResponse;
    expect(order.tickets).toHaveLength(1);

    await request(app.getHttpServer())
      .get(`/api/orders/${order.id}`)
      .query({ token: order.guestToken })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/orders/${order.id}`)
      .expect(404);
  });
});

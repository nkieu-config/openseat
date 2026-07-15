import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHmac } from 'crypto';
import { createServer, type Server } from 'http';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { OrdersService } from '../src/orders/orders.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.THROTTLE_LIMIT = '100000';

const WEBHOOK_SECRET = 'paymock-dev-webhook-secret';

function signedHeaders(body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.`)
    .update(body)
    .digest('hex');
  return { 'X-PayMock-Signature': `t=${timestamp},v1=${signature}` };
}

type OrderResponse = {
  id: string;
  status: string;
  guestToken: string;
  expiresAt: string | null;
  payment: { status: string; checkoutUrl: string } | null;
  tickets: { id: string }[];
};

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let intentServer: Server;
  let accessToken: string;
  let eventId: string;
  let paidGaTypeId: string;
  let seatIds: string[];
  let intentCounter = 0;
  const organizerEmail = `payments-e2e-${process.pid}-${Date.now()}@example.com`;

  beforeAll(async () => {
    intentServer = createServer((req, res) => {
      intentCounter += 1;
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          intentId: `pi_test_${intentCounter}`,
          checkoutUrl: `http://paymock.test/pay/pi_test_${intentCounter}`,
          status: 'requires_action',
        }),
      );
    });
    await new Promise<void>((resolve) => intentServer.listen(0, resolve));
    const address = intentServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('intent server did not bind a port');
    }
    process.env.PAYMOCK_URL = `http://127.0.0.1:${address.port}`;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);

    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: organizerEmail, password: 'organizer-pass', displayName: 'Organizer' })
      .expect(201);
    accessToken = (registerRes.body as { accessToken: string }).accessToken;

    const eventRes = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Paid Show',
        venueName: 'Cash Hall',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ticketTypes: [{ name: 'Paid GA', quantity: 10, priceSatang: 50_000 }],
      })
      .expect(201);
    const event = eventRes.body as { id: string; ticketTypes: { id: string }[] };
    eventId = event.id;
    paidGaTypeId = event.ticketTypes[0]!.id;

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/seat-map`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        sections: [{ name: 'Gold', rows: 1, cols: 5, tierName: 'Gold seats', priceSatang: 90_000 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const mapRes = await request(app.getHttpServer())
      .get(`/api/events/${eventId}/seat-map`)
      .expect(200);
    seatIds = (mapRes.body as { seats: { id: string }[] }).seats.map((seat) => seat.id);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({});
    await prisma.webhookEvent.deleteMany({});
    await prisma.payment.deleteMany({ where: { order: { eventId } } });
    await prisma.ticket.deleteMany({ where: { eventId } });
    await prisma.order.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { email: organizerEmail } });
    await app.close();
    await new Promise<void>((resolve) => {
      intentServer.close(() => resolve());
    });
  });

  async function createPaidGaOrder(): Promise<OrderResponse> {
    const res = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders`)
      .send({
        items: [{ ticketTypeId: paidGaTypeId, quantity: 1 }],
        buyerEmail: 'payer@example.com',
        buyerName: 'Paying Buyer',
      })
      .expect(201);
    return res.body as OrderResponse;
  }

  async function sendWebhook(event: Record<string, unknown>, expectStatus = 200) {
    const body = JSON.stringify(event);
    return request(app.getHttpServer())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set(signedHeaders(body))
      .send(body)
      .expect(expectStatus);
  }

  it('walks a paid order from awaiting_payment to paid tickets via a signed webhook', async () => {
    const before = await prisma.ticketType.findUniqueOrThrow({ where: { id: paidGaTypeId } });
    const order = await createPaidGaOrder();

    expect(order.status).toBe('awaiting_payment');
    expect(order.payment?.checkoutUrl).toContain('http://paymock.test/pay/');
    expect(order.tickets).toHaveLength(0);
    expect(order.expiresAt).not.toBeNull();

    const reserved = await prisma.ticketType.findUniqueOrThrow({ where: { id: paidGaTypeId } });
    expect(reserved.remaining).toBe(before.remaining - 1);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    await sendWebhook({
      id: `evt_${order.id}`,
      type: 'payment.succeeded',
      intentId: payment.providerIntentId,
      orderId: order.id,
      amountSatang: 50_000,
      createdAt: new Date().toISOString(),
    });

    const paidOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { tickets: true, payment: true },
    });
    expect(paidOrder.status).toBe('paid');
    expect(paidOrder.tickets).toHaveLength(1);
    expect(paidOrder.payment?.status).toBe('succeeded');

    const outbox = app.get(OutboxService);
    const processed = await outbox.dispatchPending();
    expect(processed).toBeGreaterThanOrEqual(2);
  });

  it('treats a replayed webhook event as a duplicate and issues nothing twice', async () => {
    const order = await createPaidGaOrder();
    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    const event = {
      id: `evt_dupe_${order.id}`,
      type: 'payment.succeeded',
      intentId: payment.providerIntentId,
      orderId: order.id,
      amountSatang: 50_000,
      createdAt: new Date().toISOString(),
    };

    await sendWebhook(event);
    const second = await sendWebhook(event);
    expect((second.body as { duplicate?: boolean }).duplicate).toBe(true);

    const tickets = await prisma.ticket.count({ where: { orderId: order.id } });
    expect(tickets).toBe(1);
  });

  it('rejects bad signatures and stale timestamps', async () => {
    const body = JSON.stringify({ id: 'evt_bad', type: 'payment.succeeded' });
    await request(app.getHttpServer())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-PayMock-Signature', 't=123,v1=deadbeef')
      .send(body)
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set(signedHeaders(body, Math.floor(Date.now() / 1000) - 3600))
      .send(body)
      .expect(400);
  });

  it('cancels a seated order and frees the seat when payment fails', async () => {
    const holderKey = 'paid-seat-holder-key';
    const seatId = seatIds[0]!;
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('X-Hold-Key', holderKey)
      .send({ seatId })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders`)
      .set('X-Hold-Key', holderKey)
      .send({ seatIds: [seatId], buyerEmail: 'seatpayer@example.com', buyerName: 'Seat Payer' })
      .expect(201);
    const order = orderRes.body as OrderResponse;
    expect(order.status).toBe('awaiting_payment');

    const boundHold = await prisma.hold.findUniqueOrThrow({
      where: { eventId_seatId: { eventId, seatId } },
    });
    expect(boundHold.expiresAt.getTime()).toBe(new Date(order.expiresAt!).getTime());

    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    await sendWebhook({
      id: `evt_fail_${order.id}`,
      type: 'payment.failed',
      intentId: payment.providerIntentId,
      orderId: order.id,
      amountSatang: 90_000,
      createdAt: new Date().toISOString(),
    });

    const canceled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(canceled.status).toBe('canceled');
    const holdGone = await prisma.hold.count({ where: { seatId } });
    expect(holdGone).toBe(0);
    const tickets = await prisma.ticket.count({ where: { orderId: order.id } });
    expect(tickets).toBe(0);
  });

  it('expires an unpaid order, restores inventory, and ignores late success', async () => {
    const before = await prisma.ticketType.findUniqueOrThrow({ where: { id: paidGaTypeId } });
    const order = await createPaidGaOrder();
    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });

    await app.get(OrdersService).expireOrder(order.id);

    const expired = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(expired.status).toBe('expired');
    const restored = await prisma.ticketType.findUniqueOrThrow({ where: { id: paidGaTypeId } });
    expect(restored.remaining).toBe(before.remaining);

    await sendWebhook({
      id: `evt_late_${order.id}`,
      type: 'payment.succeeded',
      intentId: payment.providerIntentId,
      orderId: order.id,
      amountSatang: 50_000,
      createdAt: new Date().toISOString(),
    });

    const stillExpired = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stillExpired.status).toBe('expired');
    const tickets = await prisma.ticket.count({ where: { orderId: order.id } });
    expect(tickets).toBe(0);
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHmac } from 'crypto';
import { createServer, type Server } from 'http';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.THROTTLE_LIMIT = '100000';

const WEBHOOK_SECRET = 'paymock-dev-webhook-secret';

function signedHeaders(
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
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
  payment: { status: string; checkoutUrl: string } | null;
  tickets: { id: string; ticketTypeId: string; seatId: string | null }[];
};

type RefundResponse = {
  id: string;
  status: string;
  amountSatang: number;
  tickets: { id: string }[];
};

describe('Refunds (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let providerServer: Server;
  let accessToken: string;
  let otherToken: string;
  let eventId: string;
  let freeGaTypeId: string;
  let seatIds: string[];
  let intentCounter = 0;
  let refundCalls = 0;
  let refundNextStatus = 201;
  let lastRefundBody: { amountSatang: number; reference: string } | null = null;
  const organizerEmail = `refunds-e2e-${process.pid}-${Date.now()}@example.com`;
  const otherEmail = `refunds-other-${process.pid}-${Date.now()}@example.com`;

  beforeAll(async () => {
    providerServer = createServer((req, res) => {
      if (req.url?.endsWith('/refunds')) {
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => {
          if (refundNextStatus >= 400) {
            res.writeHead(refundNextStatus);
            res.end('{}');
            return;
          }
          lastRefundBody = JSON.parse(raw) as {
            amountSatang: number;
            reference: string;
          };
          refundCalls += 1;
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              refundId: `re_stub_${refundCalls}`,
              status: 'succeeded',
              refundedSatang: lastRefundBody.amountSatang,
            }),
          );
        });
        return;
      }
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
    await new Promise<void>((resolve) => providerServer.listen(0, resolve));
    const address = providerServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('provider server did not bind a port');
    }
    process.env.PAYMOCK_URL = `http://127.0.0.1:${address.port}`;

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

    accessToken = await registerUser(organizerEmail);
    otherToken = await registerUser(otherEmail);

    const eventRes = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Refund Show',
        venueName: 'Return Hall',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ticketTypes: [
          { name: 'Paid GA', quantity: 10, priceSatang: 50_000 },
          { name: 'Free GA', quantity: 10, priceSatang: 0 },
        ],
      })
      .expect(201);
    const event = eventRes.body as {
      id: string;
      ticketTypes: { id: string; name: string }[];
    };
    eventId = event.id;
    freeGaTypeId = event.ticketTypes.find((t) => t.name === 'Free GA')!.id;

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/seat-map`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        sections: [
          {
            name: 'Gold',
            rows: 3,
            cols: 6,
            tierName: 'Gold',
            priceSatang: 90_000,
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
    seatIds = (mapRes.body as { seats: { id: string }[] }).seats.map(
      (s) => s.id,
    );
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({});
    await prisma.webhookEvent.deleteMany({});
    await prisma.ticket.deleteMany({ where: { eventId } });
    await prisma.refund.deleteMany({ where: { order: { eventId } } });
    await prisma.payment.deleteMany({ where: { order: { eventId } } });
    await prisma.order.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({
      where: { email: { in: [organizerEmail, otherEmail] } },
    });
    await app.close();
    await new Promise<void>((resolve) => providerServer.close(() => resolve()));
  });

  async function registerUser(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'a-strong-pass', displayName: 'Someone' })
      .expect(201);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function buyPaidSeat(): Promise<OrderResponse> {
    const key = `hold-${Math.random().toString(36).slice(2)}`;
    const seatId = seatIds.shift()!;
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('x-hold-key', key)
      .send({ seatId })
      .expect(201);
    const orderRes = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders`)
      .set('x-hold-key', key)
      .send({ seatIds: [seatId], buyerEmail: 'b@example.com', buyerName: 'B' })
      .expect(201);
    const order = orderRes.body as OrderResponse;
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    await sendWebhook({
      id: `evt_paid_${order.id}`,
      type: 'payment.succeeded',
      intentId: payment.providerIntentId,
      orderId: order.id,
      amountSatang: 90_000,
      createdAt: new Date().toISOString(),
    });
    const refetch = await request(app.getHttpServer())
      .get(`/api/orders/${order.id}?token=${order.guestToken}`)
      .expect(200);
    return refetch.body as OrderResponse;
  }

  async function buyPaidSeatWithTwo(): Promise<OrderResponse> {
    const key = `hold-${Math.random().toString(36).slice(2)}`;
    const twoSeats = [seatIds.shift()!, seatIds.shift()!];
    for (const seatId of twoSeats) {
      await request(app.getHttpServer())
        .post(`/api/events/${eventId}/holds`)
        .set('x-hold-key', key)
        .send({ seatId })
        .expect(201);
    }
    const orderRes = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders`)
      .set('x-hold-key', key)
      .send({ seatIds: twoSeats, buyerEmail: 'b@example.com', buyerName: 'B' })
      .expect(201);
    const order = orderRes.body as OrderResponse;
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    await sendWebhook({
      id: `evt_paid_${order.id}`,
      type: 'payment.succeeded',
      intentId: payment.providerIntentId,
      orderId: order.id,
      amountSatang: 180_000,
      createdAt: new Date().toISOString(),
    });
    const refetch = await request(app.getHttpServer())
      .get(`/api/orders/${order.id}?token=${order.guestToken}`)
      .expect(200);
    return refetch.body as OrderResponse;
  }

  async function claimFreeGa(quantity: number): Promise<OrderResponse> {
    const res = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders`)
      .send({
        items: [{ ticketTypeId: freeGaTypeId, quantity }],
        buyerEmail: 'free@example.com',
        buyerName: 'Free',
      })
      .expect(201);
    return res.body as OrderResponse;
  }

  async function sendWebhook(
    event: Record<string, unknown>,
    expectStatus = 200,
  ) {
    const body = JSON.stringify(event);
    return request(app.getHttpServer())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set(signedHeaders(body))
      .send(body)
      .expect(expectStatus);
  }

  function refund(orderId: string, ticketIds: string[], token = accessToken) {
    return request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders/${orderId}/refunds`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `idem-${Math.random().toString(36).slice(2)}`)
      .send({ ticketIds });
  }

  it('reclaims a seated ticket: it voids, the seat is holdable again, and the money leg fires', async () => {
    lastRefundBody = null;
    const order = await buyPaidSeat();
    const ticket = order.tickets[0];
    const seatId = ticket.seatId!;

    const res = await refund(order.id, [ticket.id]).expect(201);
    const body = res.body as RefundResponse;
    expect(body.amountSatang).toBe(90_000);

    const voided = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(voided.status).toBe('void');

    const resaleKey = `resale-${Math.random().toString(36).slice(2)}`;
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/holds`)
      .set('x-hold-key', resaleKey)
      .send({ seatId })
      .expect(201);

    const resaleOrderRes = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders`)
      .set('x-hold-key', resaleKey)
      .send({
        seatIds: [seatId],
        buyerEmail: 'resale@example.com',
        buyerName: 'R',
      })
      .expect(201);
    const resaleOrder = resaleOrderRes.body as OrderResponse;
    const resalePayment = await prisma.payment.findUniqueOrThrow({
      where: { orderId: resaleOrder.id },
    });
    await sendWebhook({
      id: `evt_resale_${resaleOrder.id}`,
      type: 'payment.succeeded',
      intentId: resalePayment.providerIntentId,
      orderId: resaleOrder.id,
      amountSatang: 90_000,
      createdAt: new Date().toISOString(),
    });
    const resold = await prisma.order.findUniqueOrThrow({
      where: { id: resaleOrder.id },
      include: { tickets: true },
    });
    expect(resold.status).toBe('paid');
    expect(resold.tickets).toHaveLength(1);
    expect(resold.tickets[0].seatId).toBe(seatId);

    expect(lastRefundBody).not.toBeNull();
    expect(lastRefundBody!.amountSatang).toBe(90_000);
    expect(lastRefundBody!.reference).toBe(body.id);
  });

  it('restores GA remaining when a GA ticket is refunded', async () => {
    const order = await claimFreeGa(1);
    const before = await prisma.ticketType.findUniqueOrThrow({
      where: { id: freeGaTypeId },
    });
    await refund(order.id, [order.tickets[0].id]).expect(201);
    const after = await prisma.ticketType.findUniqueOrThrow({
      where: { id: freeGaTypeId },
    });
    expect(after.remaining).toBe(before.remaining + 1);
  });

  it('refuses to refund a ticket that is already checked in', async () => {
    const order = await buyPaidSeat();
    const ticket = order.tickets[0];
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'checked_in', checkedInAt: new Date() },
    });

    await refund(order.id, [ticket.id]).expect(409);

    const still = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(still.status).toBe('checked_in');
    const refunds = await prisma.refund.count({ where: { orderId: order.id } });
    expect(refunds).toBe(0);
  });

  it('lets exactly one of a concurrent check-in and refund win', async () => {
    const order = await buyPaidSeat();
    const ticket = order.tickets[0];

    const checkinPromise = request(app.getHttpServer())
      .post(`/api/events/${eventId}/checkin`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrToken: await ticketQr(ticket.id) })
      .then((r) => r.status);
    const refundPromise = refund(order.id, [ticket.id]).then((r) => r.status);

    const [checkinStatus, refundStatus] = await Promise.all([
      checkinPromise,
      refundPromise,
    ]);

    const winners = [checkinStatus === 201, refundStatus === 201].filter(
      Boolean,
    );
    expect(winners).toHaveLength(1);

    const finalTicket = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(['checked_in', 'void']).toContain(finalTicket.status);
  });

  it('treats a replayed idempotency key as one refund with one provider call', async () => {
    const order = await buyPaidSeat();
    const ticket = order.tickets[0];
    const key = `idem-fixed-${order.id}`;

    const first = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders/${order.id}/refunds`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send({ ticketIds: [ticket.id] })
      .expect(201);
    const callsAfterFirst = refundCalls;
    const second = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders/${order.id}/refunds`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send({ ticketIds: [ticket.id] })
      .expect(201);

    expect((second.body as RefundResponse).id).toBe(
      (first.body as RefundResponse).id,
    );
    expect(refundCalls).toBe(callsAfterFirst);
  });

  it('rejects an empty or foreign ticket list, and a non-owner', async () => {
    const order = await buyPaidSeat();
    const ticket = order.tickets[0];

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders/${order.id}/refunds`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ticketIds: [] })
      .expect(400);
    await refund(order.id, ['not-a-real-ticket-id']).expect(400);
    await refund(order.id, [ticket.id], otherToken).expect(404);
  });

  it('settles a free order instantly with no provider call', async () => {
    const order = await claimFreeGa(1);
    const callsBefore = refundCalls;

    const res = await refund(order.id, [order.tickets[0].id]).expect(201);
    const body = res.body as RefundResponse;
    expect(body.status).toBe('succeeded');
    expect(refundCalls).toBe(callsBefore);

    const settled = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(settled.status).toBe('refunded');
  });

  it('marks the refund failed when the provider is down, keeps the ticket void, then retries', async () => {
    const order = await buyPaidSeat();
    const ticket = order.tickets[0];

    refundNextStatus = 502;
    const res = await refund(order.id, [ticket.id]).expect(201);
    const refundId = (res.body as RefundResponse).id;

    const failed = await prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
    });
    expect(failed.status).toBe('failed');
    const voided = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(voided.status).toBe('void');

    refundNextStatus = 201;
    await request(app.getHttpServer())
      .post(`/api/refunds/${refundId}/retry`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const retried = await prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
    });
    expect(retried.status).toBe('pending');
    expect(retried.providerRefundId).not.toBeNull();
  });

  it('settles a refund on the provider webhook, moving the order to partially_refunded, once', async () => {
    const order = await buyPaidSeatWithTwo();
    const [first] = order.tickets;

    const res = await refund(order.id, [first.id]).expect(201);
    const refundId = (res.body as RefundResponse).id;

    const eventBody = {
      id: `evt_refund_${refundId}`,
      type: 'payment.refunded',
      intentId: 'pi_ignored',
      orderId: order.id,
      amountSatang: 90_000,
      refundId: 're_provider_1',
      reference: refundId,
      createdAt: new Date().toISOString(),
    };
    await sendWebhook(eventBody);

    const settled = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(settled.status).toBe('partially_refunded');
    expect(settled.refundedSatang).toBe(90_000);
    const settledRefund = await prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
    });
    expect(settledRefund.status).toBe('succeeded');
    expect(settledRefund.providerRefundId).toBe('re_provider_1');

    const duplicate = await sendWebhook(eventBody);
    expect((duplicate.body as { duplicate?: boolean }).duplicate).toBe(true);
    const afterDuplicate = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(afterDuplicate.refundedSatang).toBe(90_000);
  });

  it('reaches refunded once every ticket is refunded and settled', async () => {
    const order = await buyPaidSeatWithTwo();

    for (const ticket of order.tickets) {
      const res = await refund(order.id, [ticket.id]).expect(201);
      const refundId = (res.body as RefundResponse).id;
      await sendWebhook({
        id: `evt_refund_${refundId}`,
        type: 'payment.refunded',
        intentId: 'pi_ignored',
        orderId: order.id,
        amountSatang: 90_000,
        refundId: `re_provider_${refundId}`,
        reference: refundId,
        createdAt: new Date().toISOString(),
      });
    }

    const settled = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(settled.status).toBe('refunded');
    expect(settled.refundedSatang).toBe(180_000);
  });

  it('ignores a refunded webhook whose reference is unknown', async () => {
    const order = await buyPaidSeat();
    const before = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    await sendWebhook({
      id: `evt_refund_orphan_${order.id}`,
      type: 'payment.refunded',
      intentId: 'pi_ignored',
      orderId: order.id,
      amountSatang: 90_000,
      refundId: 're_provider_orphan',
      reference: 'not-a-real-refund-id',
      createdAt: new Date().toISOString(),
    });
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.refundedSatang).toBe(before.refundedSatang);
    expect(after.status).toBe(before.status);
  });

  it('shows the refunded order on the roster and drops event revenue by the refund', async () => {
    const order = await buyPaidSeatWithTwo();
    const [first] = order.tickets;

    const grossBefore = await eventGrossSatang();

    const res = await refund(order.id, [first.id]).expect(201);
    const refundId = (res.body as RefundResponse).id;
    await sendWebhook({
      id: `evt_refund_${refundId}`,
      type: 'payment.refunded',
      intentId: 'pi_ignored',
      orderId: order.id,
      amountSatang: 90_000,
      refundId: 're_provider_roster',
      reference: refundId,
      createdAt: new Date().toISOString(),
    });

    const grossAfter = await eventGrossSatang();
    expect(grossAfter).toBe(grossBefore - 90_000);

    const rosterRes = await gql(
      `query ($id: ID!) {
        eventOrders(eventId: $id) {
          id status totalSatang refundedSatang
          tickets { id status priceSatang }
        }
      }`,
      { id: eventId },
      accessToken,
    );
    const orders = (
      rosterRes.body as {
        data: {
          eventOrders: {
            id: string;
            status: string;
            refundedSatang: number;
            tickets: { id: string; status: string }[];
          }[];
        };
      }
    ).data.eventOrders;
    const row = orders.find((o) => o.id === order.id)!;
    expect(row.status).toBe('partially_refunded');
    expect(row.refundedSatang).toBe(90_000);
    expect(row.tickets.filter((t) => t.status === 'void')).toHaveLength(1);
    expect(row.tickets.filter((t) => t.status === 'issued')).toHaveLength(1);
  });

  it('hides the roster from a non-owner', async () => {
    const res = await gql(
      `query ($id: ID!) { eventOrders(eventId: $id) { id } }`,
      { id: eventId },
      otherToken,
    );
    const body = res.body as {
      data?: { eventOrders?: unknown } | null;
      errors?: unknown[];
    };
    expect(body.data?.eventOrders ?? null).toBeNull();
  });

  function gql(
    query: string,
    variables: Record<string, unknown>,
    token: string,
  ) {
    return request(app.getHttpServer())
      .post('/api/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({ query, variables });
  }

  async function eventGrossSatang(): Promise<number> {
    const res = await gql(
      `query ($id: ID!) { eventDashboard(eventId: $id) { totals { grossSatang } } }`,
      { id: eventId },
      accessToken,
    );
    return (
      res.body as {
        data: { eventDashboard: { totals: { grossSatang: number } } };
      }
    ).data.eventDashboard.totals.grossSatang;
  }

  async function ticketQr(ticketId: string): Promise<string> {
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    return ticket.qrToken;
  }
});

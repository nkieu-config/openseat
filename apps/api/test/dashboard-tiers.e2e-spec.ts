import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'crypto';
import { createServer, type Server } from 'http';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.THROTTLE_LIMIT = '100000';
process.env.HOLD_SWEEP_INTERVAL_MS = '600000';

const WEBHOOK_SECRET = 'paymock-dev-webhook-secret';
const PRICE_SATANG = 90_000;
const QUANTITY = 3;

const TIERS_QUERY = `query ($id: ID!) {
  eventDashboard(eventId: $id) {
    totals { ticketsSold grossSatang paidOrders pendingOrders }
    tiers { name quantity remaining issued claimed grossSatang }
  }
}`;

type Tier = {
  name: string;
  quantity: number;
  remaining: number;
  issued: number;
  claimed: number;
  grossSatang: number;
};

type Totals = {
  ticketsSold: number;
  grossSatang: number;
  paidOrders: number;
  pendingOrders: number;
};

function signedHeaders(body: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.`)
    .update(body)
    .digest('hex');
  return { 'X-PayMock-Signature': `t=${timestamp},v1=${signature}` };
}

describe('Dashboard tier accounting (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let intentServer: Server;
  let token: string;
  let eventId: string;
  let ticketTypeId: string;
  let intentId: string;
  let orderId: string;
  const email = `tiers-${process.pid}-${Date.now()}@example.com`;

  async function readDashboard(): Promise<{ totals: Totals; tiers: Tier[] }> {
    const res = await request(app.getHttpServer())
      .post('/api/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: TIERS_QUERY, variables: { id: eventId } });
    return (
      res.body as {
        data: { eventDashboard: { totals: Totals; tiers: Tier[] } };
      }
    ).data.eventDashboard;
  }

  beforeAll(async () => {
    intentServer = createServer((req, res) => {
      req.on('data', () => undefined);
      req.on('end', () => {
        intentId = `pi_tiers_${Date.now()}`;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            intentId,
            checkoutUrl: `http://paymock.test/pay/${intentId}`,
          }),
        );
      });
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);

    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'tier-pass-1', displayName: 'Tier Owner' })
      .expect(201);
    token = (registered.body as { accessToken: string }).accessToken;

    const created = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Tier Accounting Show',
        venueName: 'Ledger Hall',
        startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        ticketTypes: [
          { name: 'Paid GA', quantity: 50, priceSatang: PRICE_SATANG },
        ],
      })
      .expect(201);
    const body = created.body as { id: string; ticketTypes: { id: string }[] };
    eventId = body.id;
    ticketTypeId = body.ticketTypes[0].id;
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { order: { eventId } } });
    await prisma.ticket.deleteMany({ where: { eventId } });
    await prisma.order.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { email } });
    await new Promise<void>((resolve) => intentServer.close(() => resolve()));
    await app.close();
  });

  it('counts an unpaid order against capacity but not against sales', async () => {
    const order = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders`)
      .send({
        items: [{ ticketTypeId, quantity: QUANTITY }],
        buyerEmail: 'buyer@example.com',
        buyerName: 'Buyer',
      })
      .expect(201);
    const created = order.body as { id: string; status: string };
    orderId = created.id;
    expect(created.status).toBe('awaiting_payment');

    const { totals, tiers } = await readDashboard();
    const tier = tiers[0];

    expect(tier.claimed).toBe(QUANTITY);
    expect(tier.remaining).toBe(tier.quantity - QUANTITY);
    expect(tier.issued).toBe(0);
    expect(tier.grossSatang).toBe(0);

    expect(totals.ticketsSold).toBe(0);
    expect(totals.grossSatang).toBe(0);
    expect(totals.paidOrders).toBe(0);
    expect(totals.pendingOrders).toBe(1);
  });

  it('keeps the tier faders and the master bus agreeing on both counts', async () => {
    const { totals, tiers } = await readDashboard();
    const issued = tiers.reduce((sum, tier) => sum + tier.issued, 0);
    const gross = tiers.reduce((sum, tier) => sum + tier.grossSatang, 0);

    expect(issued).toBe(totals.ticketsSold);
    expect(gross).toBe(totals.grossSatang);
    for (const tier of tiers) {
      expect(tier.claimed + tier.remaining).toBe(tier.quantity);
      expect(tier.issued).toBeLessThanOrEqual(tier.claimed);
    }
  });

  it('moves both numbers together once the payment settles', async () => {
    const payload = JSON.stringify({
      id: `evt_tiers_${Date.now()}`,
      type: 'payment.succeeded',
      intentId,
      orderId,
      amountSatang: QUANTITY * PRICE_SATANG,
      createdAt: new Date().toISOString(),
    });
    await request(app.getHttpServer())
      .post('/api/payments/webhook')
      .set(signedHeaders(payload))
      .set('content-type', 'application/json')
      .send(payload)
      .expect(200);

    const { totals, tiers } = await readDashboard();
    const tier = tiers[0];

    expect(tier.issued).toBe(QUANTITY);
    expect(tier.claimed).toBe(QUANTITY);
    expect(tier.grossSatang).toBe(QUANTITY * PRICE_SATANG);

    expect(totals.ticketsSold).toBe(QUANTITY);
    expect(totals.grossSatang).toBe(QUANTITY * PRICE_SATANG);
    expect(tiers.reduce((sum, entry) => sum + entry.grossSatang, 0)).toBe(
      totals.grossSatang,
    );
  });
});

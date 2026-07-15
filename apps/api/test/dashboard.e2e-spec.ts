import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.THROTTLE_LIMIT = '100000';
process.env.HOLD_SWEEP_INTERVAL_MS = '600000';

const DASHBOARD_QUERY = `query ($id: ID!) {
  eventDashboard(eventId: $id) {
    event { title ticketsSold ticketsCheckedIn }
    totals { ticketsSold ticketsCheckedIn paidOrders sellThroughBp }
    tiers { name sold }
  }
}`;

type GqlBody = {
  data?: { eventDashboard?: { totals?: { ticketsCheckedIn?: number } } } | null;
  errors?: { message: string }[];
};

type CheckinBody = {
  outcome: string;
  status: string;
  checkedInAt: string | null;
};

describe('Dashboard + check-in (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;
  let otherToken: string;
  let eventId: string;
  let otherEventId: string;
  let gaTypeId: string;
  const ownerEmail = `dash-owner-${process.pid}-${Date.now()}@example.com`;
  const otherEmail = `dash-other-${process.pid}-${Date.now()}@example.com`;

  function gql(
    query: string,
    variables: Record<string, unknown>,
    token?: string,
  ) {
    const base = request(app.getHttpServer()).post('/api/graphql');
    const authed = token ? base.set('Authorization', `Bearer ${token}`) : base;
    return authed.send({ query, variables });
  }

  async function register(email: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'dashboard-pass', displayName: name })
      .expect(201);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function createEvent(title: string): Promise<{
    id: string;
    ticketTypeId: string;
  }> {
    const res = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title,
        venueName: 'Analytics Arena',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ticketTypes: [{ name: 'Free GA', quantity: 50, priceSatang: 0 }],
      })
      .expect(201);
    const body = res.body as { id: string; ticketTypes: { id: string }[] };
    await request(app.getHttpServer())
      .post(`/api/events/${body.id}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    return { id: body.id, ticketTypeId: body.ticketTypes[0].id };
  }

  async function issueTickets(quantity: number): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders`)
      .send({
        items: [{ ticketTypeId: gaTypeId, quantity }],
        buyerEmail: 'fan@example.com',
        buyerName: 'Fan',
      })
      .expect(201);
  }

  async function issuedQrToken(): Promise<string> {
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { eventId, status: 'issued' },
    });
    return ticket.qrToken;
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

    ownerToken = await register(ownerEmail, 'Owner');
    otherToken = await register(otherEmail, 'Other');

    const primary = await createEvent('Dashboard Show');
    eventId = primary.id;
    gaTypeId = primary.ticketTypeId;
    const secondary = await createEvent('Second Show');
    otherEventId = secondary.id;

    await issueTickets(6);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { eventId: { in: [eventId, otherEventId] } },
    });
    await prisma.order.deleteMany({
      where: { eventId: { in: [eventId, otherEventId] } },
    });
    await prisma.event.deleteMany({
      where: { id: { in: [eventId, otherEventId] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, otherEmail] } },
    });
    await app.close();
  });

  it('serves the dashboard to the owner with correct totals', async () => {
    const res = await gql(DASHBOARD_QUERY, { id: eventId }, ownerToken);
    const body = res.body as {
      data: {
        eventDashboard: {
          event: { ticketsSold: number };
          totals: { ticketsSold: number; paidOrders: number };
          tiers: { name: string; sold: number }[];
        };
      };
    };
    const dash = body.data.eventDashboard;
    expect(dash.event.ticketsSold).toBe(6);
    expect(dash.totals.ticketsSold).toBe(6);
    expect(dash.totals.paidOrders).toBe(1);
    expect(dash.tiers[0]).toEqual({ name: 'Free GA', sold: 6 });
  });

  it('hides the dashboard from a non-owner', async () => {
    const res = await gql(DASHBOARD_QUERY, { id: eventId }, otherToken);
    const body = res.body as GqlBody;
    expect(body.errors?.length).toBeGreaterThan(0);
    expect(body.data?.eventDashboard ?? null).toBeNull();
  });

  it('requires authentication for the dashboard', async () => {
    const res = await gql(DASHBOARD_QUERY, { id: eventId });
    const body = res.body as GqlBody;
    expect(body.errors?.[0]?.message).toBe('Unauthorized');
  });

  it('checks a ticket in and is idempotent on rescan', async () => {
    const qrToken = await issuedQrToken();
    const first = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/checkin`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ qrToken })
      .expect(201);
    expect((first.body as CheckinBody).outcome).toBe('checked_in');
    expect((first.body as CheckinBody).checkedInAt).not.toBeNull();

    const second = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/checkin`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ qrToken })
      .expect(201);
    expect((second.body as CheckinBody).outcome).toBe('already_checked_in');
    expect((second.body as CheckinBody).status).toBe('checked_in');
  });

  it('rejects a ticket that belongs to another event', async () => {
    const qrToken = await issuedQrToken();
    await request(app.getHttpServer())
      .post(`/api/events/${otherEventId}/checkin`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ qrToken })
      .expect(404);
  });

  it('rejects check-in from a non-owner', async () => {
    const qrToken = await issuedQrToken();
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/checkin`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ qrToken })
      .expect(404);
  });

  it('admits exactly one winner under concurrent scans of one ticket', async () => {
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { eventId, status: 'issued' },
    });
    const attempts = 20;
    const responses = await Promise.all(
      Array.from({ length: attempts }, () =>
        request(app.getHttpServer())
          .post(`/api/events/${eventId}/checkin`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ qrToken: ticket.qrToken }),
      ),
    );
    const outcomes = responses.map((res) => (res.body as CheckinBody).outcome);
    expect(outcomes.filter((outcome) => outcome === 'checked_in')).toHaveLength(
      1,
    );
    expect(
      outcomes.filter((outcome) => outcome === 'already_checked_in'),
    ).toHaveLength(attempts - 1);

    const fresh = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(fresh.status).toBe('checked_in');
    expect(fresh.checkedInAt).not.toBeNull();
  });

  it('reflects check-ins in the dashboard totals', async () => {
    const res = await gql(DASHBOARD_QUERY, { id: eventId }, ownerToken);
    const body = res.body as GqlBody;
    expect(body.data?.eventDashboard?.totals?.ticketsCheckedIn).toBeGreaterThan(
      0,
    );
  });

  it('exports attendees as CSV to the owner only', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/events/${eventId}/attendees.csv`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe('Name,Email,Ticket Type,Seat,Status,Checked In At');
    expect(lines.length).toBe(7);

    await request(app.getHttpServer())
      .get(`/api/events/${eventId}/attendees.csv`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/events/${eventId}/attendees.csv`)
      .expect(401);
  });
});

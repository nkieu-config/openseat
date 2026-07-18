import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.THROTTLE_LIMIT = '100000';
process.env.HOLD_SWEEP_INTERVAL_MS = '600000';

type MemberRow = {
  id: string;
  email: string;
  role: string;
  linked: boolean;
  displayName: string | null;
  createdAt: string;
};

describe('Team roster + access ladder (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;
  let managerToken: string;
  let outsiderToken: string;
  let eventId: string;
  const stamp = `${process.pid}-${Date.now()}`;
  const ownerEmail = `team-owner-${stamp}@example.com`;
  const managerEmail = `team-manager-${stamp}@example.com`;
  const outsiderEmail = `team-outsider-${stamp}@example.com`;
  const crewEmail = `team-crew-${stamp}@example.com`;

  async function register(email: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'team-pass-123', displayName: name })
      .expect(201);
    return (res.body as { accessToken: string }).accessToken;
  }

  function listTeam(token: string) {
    return request(app.getHttpServer())
      .get(`/api/events/${eventId}/team`)
      .set('Authorization', `Bearer ${token}`);
  }

  function addMember(token: string, email: string, role: string) {
    return request(app.getHttpServer())
      .post(`/api/events/${eventId}/team`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email, role });
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

    ownerToken = await register(ownerEmail, 'Team Owner');
    managerToken = await register(managerEmail, 'Team Manager');
    outsiderToken = await register(outsiderEmail, 'Outsider');

    const res = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Team Roster Show',
        venueName: 'Roster Hall',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ticketTypes: [{ name: 'Free GA', quantity: 20, priceSatang: 0 }],
      })
      .expect(201);
    eventId = (res.body as { id: string }).id;
  });

  afterAll(async () => {
    await prisma.teamMember.deleteMany({ where: { eventId } });
    await prisma.event
      .delete({ where: { id: eventId } })
      .catch(() => undefined);
    await app.close();
  });

  it('lets the owner add an unregistered email as a pending member', async () => {
    const res = await addMember(
      ownerToken,
      crewEmail.toUpperCase(),
      'staff',
    ).expect(201);
    const member = res.body as MemberRow;
    expect(member.email).toBe(crewEmail);
    expect(member.role).toBe('staff');
    expect(member.linked).toBe(false);
    expect(member.displayName).toBeNull();

    const list = await listTeam(ownerToken).expect(200);
    const rows = list.body as MemberRow[];
    expect(rows.some((row) => row.email === crewEmail && !row.linked)).toBe(
      true,
    );
  });

  it('links the pending row the moment that email registers', async () => {
    await register(crewEmail, 'Crew Person');
    const list = await listTeam(ownerToken).expect(200);
    const crew = (list.body as MemberRow[]).find(
      (row) => row.email === crewEmail,
    );
    expect(crew?.linked).toBe(true);
    expect(crew?.displayName).toBe('Crew Person');
  });

  it('links immediately when the email already has an account', async () => {
    const res = await addMember(ownerToken, managerEmail, 'manager').expect(
      201,
    );
    const member = res.body as MemberRow;
    expect(member.linked).toBe(true);
    expect(member.displayName).toBe('Team Manager');
  });

  it('rejects duplicates, the owner email, and garbage', async () => {
    await addMember(ownerToken, crewEmail, 'manager').expect(409);
    await addMember(ownerToken, ownerEmail, 'staff').expect(400);
    await addMember(ownerToken, 'not-an-email', 'staff').expect(400);
    await addMember(ownerToken, `boss-${stamp}@example.com`, 'boss').expect(
      400,
    );
  });

  it('keeps team management to the owner alone', async () => {
    await addMember(managerToken, `nope-${stamp}@example.com`, 'staff').expect(
      403,
    );
    await listTeam(managerToken).expect(403);
    await addMember(
      outsiderToken,
      `nope2-${stamp}@example.com`,
      'staff',
    ).expect(404);
    await listTeam(outsiderToken).expect(404);
    await request(app.getHttpServer())
      .get(`/api/events/${eventId}/team`)
      .expect(401);
  });

  it('re-roles and removes a member', async () => {
    const list = await listTeam(ownerToken).expect(200);
    const crew = (list.body as MemberRow[]).find(
      (row) => row.email === crewEmail,
    );
    expect(crew).toBeDefined();

    const patched = await request(app.getHttpServer())
      .patch(`/api/events/${eventId}/team/${crew!.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'manager' })
      .expect(200);
    expect((patched.body as MemberRow).role).toBe('manager');

    await request(app.getHttpServer())
      .delete(`/api/events/${eventId}/team/${crew!.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const after = await listTeam(ownerToken).expect(200);
    expect((after.body as MemberRow[]).some((row) => row.id === crew!.id)).toBe(
      false,
    );

    await request(app.getHttpServer())
      .patch(`/api/events/${eventId}/team/${crew!.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'staff' })
      .expect(404);
  });
});

describe('Access ladder across the console (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;
  let managerToken: string;
  let staffToken: string;
  let outsiderToken: string;
  let eventId: string;
  let outsiderEventId: string;
  let orderId: string;
  let managerMemberId: string;
  let staffMemberId: string;
  let qrTokens: string[];
  let ticketIds: string[];
  const stamp = `${process.pid}-${Date.now()}`;
  const ownerEmail = `mx-owner-${stamp}@example.com`;
  const managerEmail = `mx-manager-${stamp}@example.com`;
  const staffEmail = `mx-staff-${stamp}@example.com`;
  const outsiderEmail = `mx-outsider-${stamp}@example.com`;

  const SEAT_MAP_BODY = {
    sections: [
      {
        name: 'Floor',
        rows: 2,
        cols: 2,
        tierName: 'GA Floor',
        priceSatang: 5000,
      },
    ],
  };

  async function register(email: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'mx-pass-123', displayName: name })
      .expect(201);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function createPublishedEvent(token: string, title: string) {
    const res = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        venueName: 'Ladder Hall',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ticketTypes: [{ name: 'Free GA', quantity: 20, priceSatang: 0 }],
      })
      .expect(201);
    const body = res.body as { id: string; ticketTypes: { id: string }[] };
    await request(app.getHttpServer())
      .post(`/api/events/${body.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    return { id: body.id, ticketTypeId: body.ticketTypes[0].id };
  }

  function addMember(email: string, role: string) {
    return request(app.getHttpServer())
      .post(`/api/events/${eventId}/team`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, role })
      .expect(201);
  }

  function patchEvent(token: string, id = eventId) {
    return request(app.getHttpServer())
      .patch(`/api/events/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Renamed' });
  }

  function scan(token: string, qrToken: string) {
    return request(app.getHttpServer())
      .post(`/api/events/${eventId}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken });
  }

  function refund(token: string, ticketId: string) {
    return request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders/${orderId}/refunds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketIds: [ticketId] });
  }

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

    ownerToken = await register(ownerEmail, 'MX Owner');
    managerToken = await register(managerEmail, 'MX Manager');
    staffToken = await register(staffEmail, 'MX Staff');
    outsiderToken = await register(outsiderEmail, 'MX Outsider');

    const primary = await createPublishedEvent(ownerToken, 'Ladder Show');
    eventId = primary.id;
    const outsiderEvent = await createPublishedEvent(
      outsiderToken,
      'Outsider Show',
    );
    outsiderEventId = outsiderEvent.id;

    const orderRes = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/orders`)
      .send({
        items: [{ ticketTypeId: primary.ticketTypeId, quantity: 4 }],
        buyerEmail: 'fan@example.com',
        buyerName: 'Fan',
      })
      .expect(201);
    orderId = (orderRes.body as { id: string }).id;

    const tickets = await prisma.ticket.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    qrTokens = tickets.map((ticket) => ticket.qrToken);
    ticketIds = tickets.map((ticket) => ticket.id);

    managerMemberId = (
      (await addMember(managerEmail, 'manager')).body as MemberRow
    ).id;
    staffMemberId = ((await addMember(staffEmail, 'staff')).body as MemberRow)
      .id;
  });

  afterAll(async () => {
    await prisma.refund.deleteMany({ where: { order: { eventId } } });
    await prisma.teamMember.deleteMany({
      where: { eventId: { in: [eventId, outsiderEventId] } },
    });
    await prisma.ticket.deleteMany({
      where: { eventId: { in: [eventId, outsiderEventId] } },
    });
    await prisma.order.deleteMany({
      where: { eventId: { in: [eventId, outsiderEventId] } },
    });
    await prisma.event.deleteMany({
      where: { id: { in: [eventId, outsiderEventId] } },
    });
    await app.close();
  });

  it('gives staff a summary read with counts and their role', async () => {
    const res = await gql(
      `query ($id: ID!) { eventSummary(eventId: $id) { title ticketsSold myRole } }`,
      { id: eventId },
      staffToken,
    ).expect(200);
    const body = res.body as {
      data?: {
        eventSummary?: { title: string; ticketsSold: number; myRole: string };
      };
      errors?: unknown[];
    };
    expect(body.errors).toBeUndefined();
    expect(body.data?.eventSummary?.myRole).toBe('staff');
    expect(typeof body.data?.eventSummary?.ticketsSold).toBe('number');
  });

  it('forbids staff from the money dashboard', async () => {
    const res = await gql(
      `query ($id: ID!) { eventDashboard(eventId: $id) { myRole } }`,
      { id: eventId },
      staffToken,
    ).expect(200);
    const body = res.body as { data?: unknown; errors?: { message: string }[] };
    expect(body.errors?.length).toBeGreaterThan(0);
  });

  it('tells a manager their role on the dashboard', async () => {
    const res = await gql(
      `query ($id: ID!) { eventDashboard(eventId: $id) { myRole totals { grossSatang } } }`,
      { id: eventId },
      managerToken,
    ).expect(200);
    const body = res.body as {
      data?: { eventDashboard?: { myRole: string } };
      errors?: unknown[];
    };
    expect(body.errors).toBeUndefined();
    expect(body.data?.eventDashboard?.myRole).toBe('manager');
  });

  it('nulls the gross on a staff card but keeps it for the owner', async () => {
    type Card = { id: string; grossSatang: number | null; myRole: string };
    const listFor = async (token: string): Promise<Card> => {
      const res = await gql(
        `query { organizerEvents { id grossSatang myRole } }`,
        {},
        token,
      ).expect(200);
      const body = res.body as { data?: { organizerEvents?: Card[] } };
      const card = body.data?.organizerEvents?.find((c) => c.id === eventId);
      expect(card).toBeDefined();
      return card!;
    };
    const staffCard = await listFor(staffToken);
    expect(staffCard.myRole).toBe('staff');
    expect(staffCard.grossSatang).toBeNull();
    const ownerCard = await listFor(ownerToken);
    expect(ownerCard.myRole).toBe('owner');
    expect(typeof ownerCard.grossSatang).toBe('number');
  });

  it('gates editing the event by the whole ladder', async () => {
    await patchEvent(outsiderToken).expect(404);
    await patchEvent(staffToken).expect(403);
    await patchEvent(managerToken).expect(200);
    await patchEvent(ownerToken).expect(200);
  });

  it('lets staff scan tickets at the door', async () => {
    const res = await scan(staffToken, qrTokens[0]).expect(201);
    expect((res.body as { outcome: string }).outcome).toBe('checked_in');
    await scan(outsiderToken, qrTokens[0]).expect(404);
  });

  it('keeps the attendee CSV to managers and up', async () => {
    await request(app.getHttpServer())
      .get(`/api/events/${eventId}/attendees.csv`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/events/${eventId}/attendees.csv`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
  });

  it('gates refunds at manager — the reason this milestone exists', async () => {
    const denied = await refund(staffToken, ticketIds[1]).expect(403);
    expect((denied.body as { message: string }).message).toBe(
      'Your role does not allow this',
    );
    await refund(outsiderToken, ticketIds[1]).expect(404);
    await refund(managerToken, ticketIds[1]).expect(201);
  });

  it('gates seat-map editing at manager', async () => {
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/seat-map`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send(SEAT_MAP_BODY)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/seat-map`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send(SEAT_MAP_BODY)
      .expect(201);
  });

  it('treats a member of one event as a stranger to another', async () => {
    await patchEvent(managerToken, outsiderEventId).expect(404);
  });

  it('revokes access the instant a member is removed', async () => {
    await request(app.getHttpServer())
      .delete(`/api/events/${eventId}/team/${staffMemberId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    await scan(staffToken, qrTokens[2]).expect(404);
  });

  it('demotes a manager to staff with immediate effect', async () => {
    await request(app.getHttpServer())
      .patch(`/api/events/${eventId}/team/${managerMemberId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'staff' })
      .expect(200);
    await patchEvent(managerToken).expect(403);
  });
});

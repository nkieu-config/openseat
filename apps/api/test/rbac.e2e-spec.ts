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

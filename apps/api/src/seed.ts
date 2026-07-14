import 'dotenv/config';
import { randomBytes } from 'crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_EVENT_SLUG = 'bangkok-indie-fest';

async function upsertDemoUser(email: string, displayName: string) {
  return prisma.user.upsert({
    where: { email },
    update: { displayName, isDemo: true, passwordHash: null },
    create: { email, displayName, isDemo: true },
  });
}

async function seedTickets(input: {
  eventId: string;
  ticketTypeId: string;
  count: number;
  perOrder: number;
  label: string;
}) {
  let remainingToIssue = input.count;
  let orderIndex = 0;
  while (remainingToIssue > 0) {
    const quantity = Math.min(input.perOrder, remainingToIssue);
    const buyerEmail = `demo-${input.label}-${orderIndex}@example.com`;
    const buyerName = `Demo Fan ${orderIndex + 1}`;
    await prisma.order.create({
      data: {
        eventId: input.eventId,
        buyerEmail,
        buyerName,
        status: 'paid',
        totalSatang: 0,
        guestToken: randomBytes(24).toString('base64url'),
        items: {
          create: [
            { ticketTypeId: input.ticketTypeId, quantity, unitPriceSatang: 0 },
          ],
        },
        tickets: {
          create: Array.from({ length: quantity }, () => ({
            eventId: input.eventId,
            ticketTypeId: input.ticketTypeId,
            attendeeEmail: buyerEmail,
            attendeeName: buyerName,
            qrToken: randomBytes(16).toString('base64url'),
          })),
        },
      },
    });
    remainingToIssue -= quantity;
    orderIndex += 1;
  }
}

async function main() {
  const organizer = await upsertDemoUser(
    'demo-organizer@openseat.dev',
    'OpenSeat Demo Organizer',
  );
  await upsertDemoUser('demo-buyer@openseat.dev', 'Demo Buyer');

  const existing = await prisma.event.findUnique({
    where: { slug: DEMO_EVENT_SLUG },
  });
  if (existing) {
    await prisma.ticket.deleteMany({ where: { eventId: existing.id } });
    await prisma.order.deleteMany({ where: { eventId: existing.id } });
    await prisma.event.delete({ where: { id: existing.id } });
  }

  const startsAt = new Date();
  startsAt.setUTCDate(startsAt.getUTCDate() + 30);
  startsAt.setUTCHours(12, 0, 0, 0);

  const event = await prisma.event.create({
    data: {
      organizerId: organizer.id,
      slug: DEMO_EVENT_SLUG,
      title: 'Bangkok Indie Fest 2026',
      description: [
        'One night, twelve independent bands, zero ticket fees.',
        '',
        'Bangkok Indie Fest is the demo event for OpenSeat. Claim a free ticket to see the full flow: pick a ticket type, check out as a guest, and get a QR e-ticket by email. This event reseeds on every deploy, so grab as many tickets as you like.',
      ].join('\n'),
      venueName: 'Voice Space, Bangkok',
      startsAt,
      status: 'published',
      isDemo: true,
      ticketTypes: {
        create: [
          {
            name: 'Early bird',
            quantity: 20,
            remaining: 20,
            priceSatang: 0,
            maxPerOrder: 2,
          },
          {
            name: 'General admission',
            quantity: 200,
            remaining: 200,
            priceSatang: 0,
            maxPerOrder: 4,
          },
          {
            name: 'Front zone',
            quantity: 40,
            remaining: 40,
            priceSatang: 0,
            maxPerOrder: 2,
          },
        ],
      },
    },
    include: { ticketTypes: true },
  });

  const earlyBird = event.ticketTypes.find(
    (type) => type.name === 'Early bird',
  )!;
  const generalAdmission = event.ticketTypes.find(
    (type) => type.name === 'General admission',
  )!;
  const frontZone = event.ticketTypes.find(
    (type) => type.name === 'Front zone',
  )!;

  await seedTickets({
    eventId: event.id,
    ticketTypeId: earlyBird.id,
    count: 20,
    perOrder: 2,
    label: 'early',
  });
  await seedTickets({
    eventId: event.id,
    ticketTypeId: generalAdmission.id,
    count: 24,
    perOrder: 3,
    label: 'ga',
  });
  await seedTickets({
    eventId: event.id,
    ticketTypeId: frontZone.id,
    count: 6,
    perOrder: 2,
    label: 'front',
  });

  await prisma.ticketType.update({
    where: { id: earlyBird.id },
    data: { remaining: 0 },
  });
  await prisma.ticketType.update({
    where: { id: generalAdmission.id },
    data: { remaining: 200 - 24 },
  });
  await prisma.ticketType.update({
    where: { id: frontZone.id },
    data: { remaining: 40 - 6 },
  });

  process.stdout.write(
    `Seeded demo event ${event.slug} with 50 issued tickets\n`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

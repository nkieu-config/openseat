import 'dotenv/config';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_EVENT_SLUG = 'bangkok-indie-fest';
const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const SEAT_SECTIONS = [
  {
    name: 'Front',
    rows: 4,
    cols: 10,
    tierName: 'Front seats',
    priceSatang: 150_000,
    soldEvery: 5,
  },
  {
    name: 'Main',
    rows: 6,
    cols: 12,
    tierName: 'Main seats',
    priceSatang: 90_000,
    soldEvery: 7,
  },
];

const SALE_WINDOW_DAYS = 16;
let orderSequence = 0;

function backdatedSaleDate(): Date {
  const seq = orderSequence++;
  const spread = ((seq * 2654435761) % 997) / 997;
  const dayFromNow = Math.floor((1 - Math.sqrt(spread)) * SALE_WINDOW_DAYS);
  const secondOfDay = (seq * 40503) % 86400;
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - dayFromNow);
  return new Date(day.getTime() + secondOfDay * 1000);
}

async function upsertDemoUser(email: string, displayName: string) {
  return prisma.user.upsert({
    where: { email },
    update: { displayName, isDemo: true, passwordHash: null },
    create: { email, displayName, isDemo: true },
  });
}

async function seedGaTickets(input: {
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
    const createdAt = backdatedSaleDate();
    await prisma.order.create({
      data: {
        eventId: input.eventId,
        buyerEmail,
        buyerName,
        status: 'paid',
        totalSatang: 0,
        guestToken: randomBytes(24).toString('base64url'),
        createdAt,
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
            createdAt,
          })),
        },
      },
    });
    remainingToIssue -= quantity;
    orderIndex += 1;
  }
}

async function seedSeatMap(eventId: string): Promise<number> {
  const maxCols = Math.max(...SEAT_SECTIONS.map((section) => section.cols));
  const seatMap = await prisma.seatMap.create({
    data: { eventId, template: 'theater', meta: {} },
  });

  let yCursor = 0;
  let totalSold = 0;
  const sectionMeta: {
    name: string;
    yStart: number;
    rows: number;
    cols: number;
    xOffset: number;
  }[] = [];

  for (const section of SEAT_SECTIONS) {
    const xOffset = Math.floor((maxCols - section.cols) / 2);
    const capacity = section.rows * section.cols;
    const tier = await prisma.ticketType.create({
      data: {
        eventId,
        kind: 'seated',
        name: section.tierName,
        priceSatang: section.priceSatang,
        quantity: capacity,
        remaining: capacity,
        maxPerOrder: 8,
      },
    });

    const seats = Array.from({ length: section.rows }, (_, rowIndex) =>
      Array.from({ length: section.cols }, (_, colIndex) => ({
        id: randomUUID(),
        seatMapId: seatMap.id,
        eventId,
        ticketTypeId: tier.id,
        section: section.name,
        rowLabel: ROW_LETTERS[rowIndex % ROW_LETTERS.length],
        number: colIndex + 1,
        x: xOffset + colIndex,
        y: yCursor + rowIndex,
      })),
    ).flat();
    await prisma.seat.createMany({ data: seats });

    const soldSeats = seats.filter(
      (_, index) => index % section.soldEvery === 2,
    );
    for (let chunk = 0; chunk < soldSeats.length; chunk += 2) {
      const orderSeats = soldSeats.slice(chunk, chunk + 2);
      const buyerEmail = `demo-seated-${section.name.toLowerCase()}-${chunk}@example.com`;
      const buyerName = `Seated Fan ${chunk + 1}`;
      const createdAt = backdatedSaleDate();
      await prisma.order.create({
        data: {
          eventId,
          buyerEmail,
          buyerName,
          status: 'paid',
          totalSatang: orderSeats.length * section.priceSatang,
          guestToken: randomBytes(24).toString('base64url'),
          createdAt,
          items: {
            create: [
              {
                ticketTypeId: tier.id,
                quantity: orderSeats.length,
                unitPriceSatang: section.priceSatang,
              },
            ],
          },
          tickets: {
            create: orderSeats.map((seat) => ({
              eventId,
              ticketTypeId: tier.id,
              seatId: seat.id,
              attendeeEmail: buyerEmail,
              attendeeName: buyerName,
              qrToken: randomBytes(16).toString('base64url'),
              createdAt,
            })),
          },
        },
      });
    }
    await prisma.ticketType.update({
      where: { id: tier.id },
      data: { remaining: capacity - soldSeats.length },
    });
    totalSold += soldSeats.length;

    sectionMeta.push({
      name: section.name,
      yStart: yCursor,
      rows: section.rows,
      cols: section.cols,
      xOffset,
    });
    yCursor += section.rows + 1;
  }

  await prisma.seatMap.update({
    where: { id: seatMap.id },
    data: { meta: { maxCols, totalRows: yCursor - 1, sections: sectionMeta } },
  });
  return totalSold;
}

async function seedDropEvent(organizerId: string): Promise<number> {
  const slug = 'midnight-drop';
  const existing = await prisma.event.findUnique({ where: { slug } });
  if (existing) {
    await prisma.ticket.deleteMany({ where: { eventId: existing.id } });
    await prisma.payment.deleteMany({
      where: { order: { eventId: existing.id } },
    });
    await prisma.refund.deleteMany({
      where: { order: { eventId: existing.id } },
    });
    await prisma.teamMember.deleteMany({ where: { eventId: existing.id } });
    await prisma.order.deleteMany({ where: { eventId: existing.id } });
    await prisma.event.delete({ where: { id: existing.id } });
  }

  const startsAt = new Date();
  startsAt.setUTCDate(startsAt.getUTCDate() + 45);
  startsAt.setUTCHours(20, 0, 0, 0);

  const capacity = 500;
  const presold = 137;
  const event = await prisma.event.create({
    data: {
      organizerId,
      slug,
      title: 'Midnight Drop — 500 limited passes',
      description: [
        'A hard-capped on-sale built to stampede.',
        '',
        'Only 500 passes, released all at once. This event runs in drop mode: everyone lands in a live waiting room, holds a spot in the Redis-backed queue, and is admitted at a steady rate. Hit "Simulate a crowd" to watch a few hundred rivals pile in ahead of you and your position tick down in real time.',
      ].join('\n'),
      venueName: 'The Warehouse, Bangkok',
      startsAt,
      status: 'published',
      isDemo: true,
      dropMode: true,
      saleOpensAt: new Date(),
      ticketTypes: {
        create: [
          {
            name: 'Drop pass',
            quantity: capacity,
            remaining: capacity,
            priceSatang: 0,
            maxPerOrder: 2,
          },
        ],
      },
    },
    include: { ticketTypes: true },
  });

  const pass = event.ticketTypes[0];
  await seedGaTickets({
    eventId: event.id,
    ticketTypeId: pass.id,
    count: presold,
    perOrder: 1,
    label: 'drop',
  });
  await prisma.ticketType.update({
    where: { id: pass.id },
    data: { remaining: capacity - presold },
  });
  return presold;
}

async function main() {
  const organizer = await upsertDemoUser(
    'demo-organizer@openseat.dev',
    'OpenSeat Demo Organizer',
  );
  await upsertDemoUser('demo-buyer@openseat.dev', 'Demo Buyer');
  const staff = await upsertDemoUser(
    'demo-staff@openseat.dev',
    'Demo Door Staff',
  );

  const existing = await prisma.event.findUnique({
    where: { slug: DEMO_EVENT_SLUG },
  });
  if (existing) {
    await prisma.ticket.deleteMany({ where: { eventId: existing.id } });
    await prisma.payment.deleteMany({
      where: { order: { eventId: existing.id } },
    });
    await prisma.refund.deleteMany({
      where: { order: { eventId: existing.id } },
    });
    await prisma.teamMember.deleteMany({ where: { eventId: existing.id } });
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
        'Bangkok Indie Fest is the demo event for OpenSeat. Claim a standing ticket, or pick an exact seat on the live map — open this page in two windows and watch holds appear in real time. This event reseeds on every deploy, so grab as many tickets as you like.',
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

  await seedGaTickets({
    eventId: event.id,
    ticketTypeId: earlyBird.id,
    count: 20,
    perOrder: 2,
    label: 'early',
  });
  await seedGaTickets({
    eventId: event.id,
    ticketTypeId: generalAdmission.id,
    count: 24,
    perOrder: 3,
    label: 'ga',
  });
  await prisma.ticketType.update({
    where: { id: earlyBird.id },
    data: { remaining: 0 },
  });
  await prisma.ticketType.update({
    where: { id: generalAdmission.id },
    data: { remaining: 200 - 24 },
  });

  await prisma.teamMember.createMany({
    data: [
      {
        eventId: event.id,
        email: staff.email,
        userId: staff.id,
        role: 'staff',
        invitedById: organizer.id,
        linkedAt: new Date(),
      },
      {
        eventId: event.id,
        email: 'demo-producer@openseat.dev',
        role: 'manager',
        invitedById: organizer.id,
      },
    ],
  });

  const seatedSold = await seedSeatMap(event.id);
  const dropSold = await seedDropEvent(organizer.id);

  process.stdout.write(
    `Seeded ${event.slug}: 44 GA + ${seatedSold} seated · midnight-drop: ${dropSold} passes\n`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

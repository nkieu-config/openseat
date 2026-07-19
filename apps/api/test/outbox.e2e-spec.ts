import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { OutboxService } from '../src/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Outbox dispatch (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let outbox: OutboxService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    outbox = app.get(OutboxService);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({});
    await app.close();
  });

  it('claims each row once when two dispatchers race', async () => {
    await prisma.outboxEvent.deleteMany({});
    await prisma.outboxEvent.createMany({
      data: Array.from({ length: 6 }, () => ({
        type: 'seats.released',
        payload: { eventId: 'no-such-event', seatIds: [] },
      })),
    });

    const [first, second] = await Promise.all([
      outbox.dispatchPending(),
      outbox.dispatchPending(),
    ]);

    expect(first + second).toBe(6);
    const unprocessed = await prisma.outboxEvent.count({
      where: { processedAt: null },
    });
    expect(unprocessed).toBe(0);
  });
});

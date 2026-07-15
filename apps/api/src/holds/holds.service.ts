import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

const DEFAULT_HOLD_TTL_MS = 7 * 60_000;
const MAX_HELD_PER_KEY = 8;

@Injectable()
export class HoldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService,
  ) {}

  holdTtlMs(): number {
    return Number(this.config.get('HOLD_TTL_MS') ?? DEFAULT_HOLD_TTL_MS);
  }

  async acquire(eventId: string, seatId: string, holderKey: string) {
    const seat = await this.prisma.seat.findFirst({
      where: { id: seatId, eventId, event: { status: 'published' } },
    });
    if (!seat) {
      throw new NotFoundException('Seat not found');
    }

    const heldByKey = await this.prisma.hold.count({
      where: { eventId, holderKey, expiresAt: { gt: new Date() } },
    });
    if (heldByKey >= MAX_HELD_PER_KEY) {
      throw new BadRequestException(
        `At most ${MAX_HELD_PER_KEY} seats can be held at once`,
      );
    }

    const holdId = randomUUID();
    const expiresAt = new Date(Date.now() + this.holdTtlMs());

    const inserted = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM holds
        WHERE event_id = ${eventId} AND seat_id = ${seatId} AND expires_at <= now()`;
      return tx.$executeRaw`
        INSERT INTO holds (id, event_id, seat_id, holder_key, expires_at, created_at)
        SELECT ${holdId}, ${eventId}, ${seatId}, ${holderKey}, ${expiresAt}, now()
        WHERE NOT EXISTS (
          SELECT 1 FROM tickets
          WHERE tickets.seat_id = ${seatId} AND tickets.status <> 'void'
        )
        ON CONFLICT (event_id, seat_id) DO NOTHING`;
    });

    if (inserted === 1) {
      this.realtime.seatsChanged(eventId, { held: [seatId] });
      return { seatId, expiresAt };
    }

    const existing = await this.prisma.hold.findUnique({
      where: { eventId_seatId: { eventId, seatId } },
    });
    if (existing && existing.holderKey === holderKey) {
      const refreshed = await this.prisma.hold.update({
        where: { id: existing.id },
        data: { expiresAt },
      });
      return { seatId, expiresAt: refreshed.expiresAt };
    }
    if (existing) {
      throw new ConflictException({
        message: 'Seat is held by someone else',
        code: 'SEAT_HELD',
      });
    }
    throw new ConflictException({
      message: 'Seat is already sold',
      code: 'SEAT_SOLD',
    });
  }

  async release(eventId: string, seatId: string, holderKey: string) {
    const deleted = await this.prisma.hold.deleteMany({
      where: { eventId, seatId, holderKey },
    });
    if (deleted.count > 0) {
      this.realtime.seatsChanged(eventId, { released: [seatId] });
    }
  }

  async listMine(eventId: string, holderKey: string) {
    return this.prisma.hold.findMany({
      where: { eventId, holderKey, expiresAt: { gt: new Date() } },
      select: { seatId: true, expiresAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sweepExpired(): Promise<number> {
    const expired = await this.prisma.$queryRaw<
      { event_id: string; seat_id: string }[]
    >`
      DELETE FROM holds WHERE expires_at <= now() RETURNING event_id, seat_id`;
    const byEvent = new Map<string, string[]>();
    for (const row of expired) {
      const seats = byEvent.get(row.event_id) ?? [];
      seats.push(row.seat_id);
      byEvent.set(row.event_id, seats);
    }
    for (const [eventId, seatIds] of byEvent) {
      this.realtime.seatsChanged(eventId, { released: seatIds });
    }
    return expired.length;
  }
}

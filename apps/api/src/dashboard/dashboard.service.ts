import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Attendee,
  DashboardTotals,
  EventCard,
  EventDashboard,
  SectionOccupancy,
  TierStat,
  TimelineBucket,
} from './dashboard.models';

const DAY_MS = 86_400_000;
const MAX_TIMELINE_DAYS = 45;

function startOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function dayKey(date: Date): string {
  return startOfDayUtc(date).toISOString().slice(0, 10);
}

type OrderStamp = { createdAt: Date; totalSatang: number };
type TicketStamp = { createdAt: Date };

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownedEvent(eventId: string, organizerId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizerId },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  async organizerEvents(organizerId: string): Promise<EventCard[]> {
    const events = await this.prisma.event.findMany({
      where: { organizerId },
      orderBy: { createdAt: 'desc' },
      include: {
        ticketTypes: { select: { quantity: true } },
        seatMap: { select: { id: true } },
      },
    });

    return Promise.all(
      events.map(async (event): Promise<EventCard> => {
        const [ticketsSold, ticketsCheckedIn, grossAgg] = await Promise.all([
          this.prisma.ticket.count({
            where: { eventId: event.id, status: { not: 'void' } },
          }),
          this.prisma.ticket.count({
            where: { eventId: event.id, status: 'checked_in' },
          }),
          this.prisma.order.aggregate({
            where: { eventId: event.id, status: 'paid' },
            _sum: { totalSatang: true },
          }),
        ]);
        return {
          id: event.id,
          slug: event.slug,
          title: event.title,
          status: event.status,
          venueName: event.venueName,
          startsAt: event.startsAt,
          isDemo: event.isDemo,
          seated: event.seatMap !== null,
          capacity: event.ticketTypes.reduce(
            (sum, tier) => sum + tier.quantity,
            0,
          ),
          ticketsSold,
          ticketsCheckedIn,
          grossSatang: grossAgg._sum.totalSatang ?? 0,
        };
      }),
    );
  }

  async eventDashboard(
    eventId: string,
    organizerId: string,
  ): Promise<EventDashboard> {
    const event = await this.ownedEvent(eventId, organizerId);
    const now = new Date();

    const [
      ticketTypes,
      seats,
      paidOrders,
      pendingOrders,
      ticketsSold,
      ticketsCheckedIn,
      liveHolds,
      grossAgg,
      paidOrderRows,
      ticketRows,
      soldSeatRows,
      heldSeatRows,
    ] = await Promise.all([
      this.prisma.ticketType.findMany({
        where: { eventId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.seat.findMany({
        where: { eventId },
        select: { id: true, section: true },
      }),
      this.prisma.order.count({ where: { eventId, status: 'paid' } }),
      this.prisma.order.count({
        where: { eventId, status: 'awaiting_payment' },
      }),
      this.prisma.ticket.count({ where: { eventId, status: { not: 'void' } } }),
      this.prisma.ticket.count({ where: { eventId, status: 'checked_in' } }),
      this.prisma.hold.count({ where: { eventId, expiresAt: { gt: now } } }),
      this.prisma.order.aggregate({
        where: { eventId, status: 'paid' },
        _sum: { totalSatang: true },
      }),
      this.prisma.order.findMany({
        where: { eventId, status: 'paid' },
        select: { createdAt: true, totalSatang: true },
      }),
      this.prisma.ticket.findMany({
        where: { eventId, status: { not: 'void' } },
        select: { createdAt: true },
      }),
      this.prisma.ticket.findMany({
        where: { eventId, seatId: { not: null }, status: { not: 'void' } },
        select: { seatId: true },
      }),
      this.prisma.hold.findMany({
        where: { eventId, expiresAt: { gt: now } },
        select: { seatId: true },
      }),
    ]);

    const capacity = ticketTypes.reduce((sum, tier) => sum + tier.quantity, 0);

    const totals: DashboardTotals = {
      grossSatang: grossAgg._sum.totalSatang ?? 0,
      paidOrders,
      pendingOrders,
      ticketsSold,
      ticketsCheckedIn,
      liveHolds,
      capacity,
      sellThroughBp:
        capacity > 0 ? Math.round((ticketsSold / capacity) * 10000) : 0,
    };

    const tiers: TierStat[] = ticketTypes.map((tier) => {
      const sold = tier.quantity - tier.remaining;
      return {
        id: tier.id,
        name: tier.name,
        kind: tier.kind,
        priceSatang: tier.priceSatang,
        quantity: tier.quantity,
        remaining: tier.remaining,
        sold,
        grossSatang: sold * tier.priceSatang,
      };
    });

    const soldSet = new Set(
      soldSeatRows
        .map((row) => row.seatId)
        .filter((id): id is string => id !== null),
    );
    const heldSet = new Set(
      heldSeatRows.map((row) => row.seatId).filter((id) => !soldSet.has(id)),
    );
    const sectionMap = new Map<
      string,
      { capacity: number; sold: number; held: number }
    >();
    for (const seat of seats) {
      const entry = sectionMap.get(seat.section) ?? {
        capacity: 0,
        sold: 0,
        held: 0,
      };
      entry.capacity += 1;
      if (soldSet.has(seat.id)) {
        entry.sold += 1;
      } else if (heldSet.has(seat.id)) {
        entry.held += 1;
      }
      sectionMap.set(seat.section, entry);
    }
    const sections: SectionOccupancy[] = [...sectionMap.entries()].map(
      ([name, entry]) => ({
        name,
        capacity: entry.capacity,
        sold: entry.sold,
        held: entry.held,
        available: entry.capacity - entry.sold - entry.held,
      }),
    );

    const timeline = this.buildTimeline(
      event.createdAt,
      now,
      paidOrderRows,
      ticketRows,
    );

    return {
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        status: event.status,
        venueName: event.venueName,
        startsAt: event.startsAt,
        isDemo: event.isDemo,
        seated: seats.length > 0,
        capacity,
        ticketsSold,
        ticketsCheckedIn,
        grossSatang: totals.grossSatang,
      },
      totals,
      timeline,
      tiers,
      sections,
    };
  }

  private buildTimeline(
    eventCreatedAt: Date,
    now: Date,
    paidOrders: OrderStamp[],
    tickets: TicketStamp[],
  ): TimelineBucket[] {
    const stamps = [
      ...paidOrders.map((order) => order.createdAt.getTime()),
      ...tickets.map((ticket) => ticket.createdAt.getTime()),
    ];
    const earliest =
      stamps.length > 0 ? new Date(Math.min(...stamps)) : eventCreatedAt;
    const end = startOfDayUtc(now);
    let start = startOfDayUtc(earliest);
    if ((end.getTime() - start.getTime()) / DAY_MS > MAX_TIMELINE_DAYS) {
      start = addDays(end, -MAX_TIMELINE_DAYS);
    }

    const buckets = new Map<string, TimelineBucket>();
    for (
      let cursor = new Date(start);
      cursor.getTime() <= end.getTime();
      cursor = addDays(cursor, 1)
    ) {
      buckets.set(dayKey(cursor), {
        day: new Date(cursor),
        orders: 0,
        ticketsSold: 0,
        grossSatang: 0,
      });
    }
    for (const order of paidOrders) {
      const bucket = buckets.get(dayKey(order.createdAt));
      if (bucket) {
        bucket.orders += 1;
        bucket.grossSatang += order.totalSatang;
      }
    }
    for (const ticket of tickets) {
      const bucket = buckets.get(dayKey(ticket.createdAt));
      if (bucket) {
        bucket.ticketsSold += 1;
      }
    }
    return [...buckets.values()];
  }

  async eventAttendees(
    eventId: string,
    organizerId: string,
    limit: number,
  ): Promise<Attendee[]> {
    await this.ownedEvent(eventId, organizerId);
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId, status: { not: 'void' } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: Math.min(Math.max(limit, 1), 2000),
      include: {
        ticketType: { select: { name: true } },
        seat: { select: { section: true, rowLabel: true, number: true } },
      },
    });
    return tickets.map((ticket) => ({
      ticketId: ticket.id,
      name: ticket.attendeeName,
      email: ticket.attendeeEmail,
      ticketType: ticket.ticketType.name,
      seat: ticket.seat
        ? `${ticket.seat.section} ${ticket.seat.rowLabel}${ticket.seat.number}`
        : null,
      status: ticket.status,
      checkedInAt: ticket.checkedInAt,
    }));
  }
}

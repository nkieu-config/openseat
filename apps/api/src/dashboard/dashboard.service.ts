import { Injectable } from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  Attendee,
  DashboardTotals,
  EventCard,
  EventDashboard,
  EventSummary,
  OrderRow,
  SectionOccupancy,
  TierStat,
  TimelineBucket,
} from './dashboard.models';
import { PAID_ORDER_STATUSES } from '../orders/order-status';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async organizerEvents(organizerId: string): Promise<EventCard[]> {
    const events = await this.prisma.event.findMany({
      where: {
        OR: [{ organizerId }, { team: { some: { userId: organizerId } } }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        ticketTypes: { select: { quantity: true } },
        seatMap: { select: { id: true } },
        team: {
          where: { userId: organizerId },
          select: { role: true },
        },
      },
    });

    const eventIds = events.map((event) => event.id);
    if (eventIds.length === 0) {
      return [];
    }

    const [soldRows, checkedInRows, grossRows] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['eventId'],
        where: { eventId: { in: eventIds }, status: { not: 'void' } },
        _count: { _all: true },
      }),
      this.prisma.ticket.groupBy({
        by: ['eventId'],
        where: { eventId: { in: eventIds }, status: 'checked_in' },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['eventId'],
        where: {
          eventId: { in: eventIds },
          status: { in: PAID_ORDER_STATUSES },
        },
        _sum: { totalSatang: true, refundedSatang: true },
      }),
    ]);

    const soldByEvent = new Map(
      soldRows.map((row) => [row.eventId, row._count._all]),
    );
    const checkedInByEvent = new Map(
      checkedInRows.map((row) => [row.eventId, row._count._all]),
    );
    const grossByEvent = new Map(
      grossRows.map((row) => [
        row.eventId,
        (row._sum.totalSatang ?? 0) - (row._sum.refundedSatang ?? 0),
      ]),
    );

    return events.map((event): EventCard => {
      const myRole =
        event.organizerId === organizerId
          ? 'owner'
          : (event.team[0]?.role ?? 'staff');
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
        ticketsSold: soldByEvent.get(event.id) ?? 0,
        ticketsCheckedIn: checkedInByEvent.get(event.id) ?? 0,
        grossSatang:
          myRole === 'staff' ? null : (grossByEvent.get(event.id) ?? 0),
        myRole,
      };
    });
  }

  async eventSummary(eventId: string, userId: string): Promise<EventSummary> {
    const { event, role } = await this.access.requireEventRole(
      eventId,
      userId,
      'staff',
    );
    const [ticketsSold, ticketsCheckedIn] = await Promise.all([
      this.prisma.ticket.count({ where: { eventId, status: { not: 'void' } } }),
      this.prisma.ticket.count({ where: { eventId, status: 'checked_in' } }),
    ]);
    return {
      id: event.id,
      title: event.title,
      venueName: event.venueName,
      startsAt: event.startsAt,
      status: event.status,
      ticketsSold,
      ticketsCheckedIn,
      myRole: role,
    };
  }

  async eventDashboard(
    eventId: string,
    organizerId: string,
  ): Promise<EventDashboard> {
    const { event, role } = await this.access.requireEventRole(
      eventId,
      organizerId,
      'manager',
    );
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
      issuedByTierRows,
    ] = await Promise.all([
      this.prisma.ticketType.findMany({
        where: { eventId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.seat.findMany({
        where: { eventId },
        select: { id: true, section: true },
      }),
      this.prisma.order.count({
        where: { eventId, status: { in: PAID_ORDER_STATUSES } },
      }),
      this.prisma.order.count({
        where: { eventId, status: 'awaiting_payment' },
      }),
      this.prisma.ticket.count({ where: { eventId, status: { not: 'void' } } }),
      this.prisma.ticket.count({ where: { eventId, status: 'checked_in' } }),
      this.prisma.hold.count({ where: { eventId, expiresAt: { gt: now } } }),
      this.prisma.order.aggregate({
        where: { eventId, status: { in: PAID_ORDER_STATUSES } },
        _sum: { totalSatang: true, refundedSatang: true },
      }),
      this.prisma.order.findMany({
        where: { eventId, status: { in: PAID_ORDER_STATUSES } },
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
      this.prisma.ticket.groupBy({
        by: ['ticketTypeId'],
        where: { eventId, status: { not: 'void' } },
        _count: { _all: true },
      }),
    ]);

    const capacity = ticketTypes.reduce((sum, tier) => sum + tier.quantity, 0);

    const totals: DashboardTotals = {
      grossSatang:
        (grossAgg._sum.totalSatang ?? 0) - (grossAgg._sum.refundedSatang ?? 0),
      paidOrders,
      pendingOrders,
      ticketsSold,
      ticketsCheckedIn,
      liveHolds,
      capacity,
      sellThroughBp:
        capacity > 0 ? Math.round((ticketsSold / capacity) * 10000) : 0,
    };

    const issuedByTier = new Map(
      issuedByTierRows.map((row) => [row.ticketTypeId, row._count._all]),
    );
    const tiers: TierStat[] = ticketTypes.map((tier) => {
      const issued = issuedByTier.get(tier.id) ?? 0;
      return {
        id: tier.id,
        name: tier.name,
        kind: tier.kind,
        priceSatang: tier.priceSatang,
        quantity: tier.quantity,
        remaining: tier.remaining,
        issued,
        claimed: tier.quantity - tier.remaining,
        grossSatang: issued * tier.priceSatang,
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
        myRole: role,
      },
      totals,
      timeline,
      tiers,
      sections,
      myRole: role,
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
    await this.access.requireEventRole(eventId, organizerId, 'staff');
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

  async eventOrders(
    eventId: string,
    organizerId: string,
    limit: number,
  ): Promise<OrderRow[]> {
    await this.access.requireEventRole(eventId, organizerId, 'manager');
    const orders = await this.prisma.order.findMany({
      where: { eventId, status: { in: PAID_ORDER_STATUSES } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      include: {
        items: true,
        tickets: {
          orderBy: { createdAt: 'asc' },
          include: {
            ticketType: { select: { name: true } },
            seat: { select: { section: true, rowLabel: true, number: true } },
          },
        },
        refunds: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, status: true, amountSatang: true },
        },
      },
    });
    return orders.map((order): OrderRow => {
      const priceByType = new Map(
        order.items.map((item) => [item.ticketTypeId, item.unitPriceSatang]),
      );
      return {
        id: order.id,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        status: order.status,
        totalSatang: order.totalSatang,
        refundedSatang: order.refundedSatang,
        createdAt: order.createdAt,
        tickets: order.tickets.map((ticket) => ({
          id: ticket.id,
          ticketType: ticket.ticketType.name,
          seat: ticket.seat
            ? `${ticket.seat.section} ${ticket.seat.rowLabel}${ticket.seat.number}`
            : null,
          status: ticket.status,
          priceSatang: priceByType.get(ticket.ticketTypeId) ?? 0,
        })),
        refunds: order.refunds.map((refund) => ({
          id: refund.id,
          status: refund.status,
          amountSatang: refund.amountSatang,
        })),
      };
    });
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CheckinResult = {
  outcome: 'checked_in' | 'already_checked_in';
  ticketId: string;
  attendeeName: string;
  ticketType: string;
  seat: string | null;
  status: string;
  checkedInAt: Date | null;
};

const ATTENDEE_INCLUDE = {
  ticketType: { select: { name: true } },
  seat: { select: { section: true, rowLabel: true, number: true } },
};

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

@Injectable()
export class CheckinService {
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

  async checkIn(
    eventId: string,
    organizerId: string,
    qrToken: string,
  ): Promise<CheckinResult> {
    await this.ownedEvent(eventId, organizerId);
    const ticket = await this.prisma.ticket.findUnique({
      where: { qrToken },
      include: ATTENDEE_INCLUDE,
    });
    if (!ticket || ticket.eventId !== eventId) {
      throw new NotFoundException('Ticket not found for this event');
    }
    if (ticket.status === 'void') {
      throw new BadRequestException('Ticket is void');
    }
    const updated = await this.prisma.ticket.updateMany({
      where: { id: ticket.id, status: 'issued' },
      data: { status: 'checked_in', checkedInAt: new Date() },
    });
    const fresh = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: ATTENDEE_INCLUDE,
    });
    return {
      outcome: updated.count === 1 ? 'checked_in' : 'already_checked_in',
      ticketId: fresh.id,
      attendeeName: fresh.attendeeName,
      ticketType: fresh.ticketType.name,
      seat: fresh.seat
        ? `${fresh.seat.section} ${fresh.seat.rowLabel}${fresh.seat.number}`
        : null,
      status: fresh.status,
      checkedInAt: fresh.checkedInAt,
    };
  }

  async attendeesCsv(eventId: string, organizerId: string): Promise<string> {
    await this.ownedEvent(eventId, organizerId);
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId, status: { not: 'void' } },
      orderBy: [{ ticketType: { name: 'asc' } }, { createdAt: 'asc' }],
      include: ATTENDEE_INCLUDE,
    });
    const header = [
      'Name',
      'Email',
      'Ticket Type',
      'Seat',
      'Status',
      'Checked In At',
    ];
    const rows = tickets.map((ticket) => [
      ticket.attendeeName,
      ticket.attendeeEmail,
      ticket.ticketType.name,
      ticket.seat
        ? `${ticket.seat.section} ${ticket.seat.rowLabel}${ticket.seat.number}`
        : '',
      ticket.status,
      ticket.checkedInAt ? ticket.checkedInAt.toISOString() : '',
    ]);
    return (
      [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') +
      '\r\n'
    );
  }
}

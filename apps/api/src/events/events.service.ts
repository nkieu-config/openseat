import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto, UpdateTicketTypeDto } from './dto/update-event.dto';

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'event';
}

const PUBLIC_EVENT_INCLUDE = {
  ticketTypes: {
    orderBy: { createdAt: 'asc' as const },
  },
  organizer: {
    select: { id: true, displayName: true },
  },
};

@Injectable()
export class EventsService {
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

  async create(organizerId: string, dto: CreateEventDto) {
    const slug = `${slugify(dto.title)}-${randomBytes(3).toString('hex')}`;
    return this.prisma.event.create({
      data: {
        organizerId,
        slug,
        title: dto.title.trim(),
        description: dto.description ?? '',
        venueName: dto.venueName.trim(),
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        ticketTypes: {
          create: dto.ticketTypes.map((ticketType) => ({
            name: ticketType.name.trim(),
            quantity: ticketType.quantity,
            remaining: ticketType.quantity,
            priceSatang: ticketType.priceSatang,
            maxPerOrder: ticketType.maxPerOrder ?? 10,
          })),
        },
      },
      include: PUBLIC_EVENT_INCLUDE,
    });
  }

  async listMine(organizerId: string) {
    const events = await this.prisma.event.findMany({
      where: { organizerId },
      orderBy: { createdAt: 'desc' },
      include: {
        ticketTypes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { tickets: true } },
      },
    });
    return events.map(({ _count, ...event }) => ({
      ...event,
      ticketsIssued: _count.tickets,
    }));
  }

  async getBySlug(slug: string, viewerId?: string | null) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: PUBLIC_EVENT_INCLUDE,
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.status !== 'published' && event.organizer.id !== viewerId) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  async update(eventId: string, organizerId: string, dto: UpdateEventDto) {
    await this.ownedEvent(eventId, organizerId);
    return this.prisma.event.update({
      where: { id: eventId },
      data: {
        title: dto.title?.trim(),
        description: dto.description,
        venueName: dto.venueName?.trim(),
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
      include: PUBLIC_EVENT_INCLUDE,
    });
  }

  async publish(eventId: string, organizerId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizerId },
      include: { _count: { select: { ticketTypes: true } } },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event._count.ticketTypes === 0) {
      throw new BadRequestException(
        'Add at least one ticket type before publishing',
      );
    }
    return this.prisma.event.update({
      where: { id: eventId },
      data: { status: 'published' },
      include: PUBLIC_EVENT_INCLUDE,
    });
  }

  async addTicketType(
    eventId: string,
    organizerId: string,
    dto: CreateEventDto['ticketTypes'][number],
  ) {
    await this.ownedEvent(eventId, organizerId);
    return this.prisma.ticketType.create({
      data: {
        eventId,
        name: dto.name.trim(),
        quantity: dto.quantity,
        remaining: dto.quantity,
        priceSatang: dto.priceSatang,
        maxPerOrder: dto.maxPerOrder ?? 10,
      },
    });
  }

  async updateTicketType(
    eventId: string,
    ticketTypeId: string,
    organizerId: string,
    dto: UpdateTicketTypeDto,
  ) {
    await this.ownedEvent(eventId, organizerId);
    return this.prisma.$transaction(async (tx) => {
      const ticketType = await tx.ticketType.findFirst({
        where: { id: ticketTypeId, eventId },
      });
      if (!ticketType) {
        throw new NotFoundException('Ticket type not found');
      }
      let remainingDelta = 0;
      if (dto.quantity !== undefined) {
        const sold = ticketType.quantity - ticketType.remaining;
        if (dto.quantity < sold) {
          throw new BadRequestException(
            `Quantity cannot go below the ${sold} tickets already issued`,
          );
        }
        remainingDelta = dto.quantity - ticketType.quantity;
      }
      return tx.ticketType.update({
        where: { id: ticketTypeId },
        data: {
          name: dto.name?.trim(),
          maxPerOrder: dto.maxPerOrder,
          quantity: dto.quantity,
          remaining: { increment: remainingDelta },
        },
      });
    });
  }
}

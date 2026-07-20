import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AccessService } from '../access/access.service';
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
  seatMap: {
    select: { id: true },
  },
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

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
      where: {
        OR: [{ organizerId }, { team: { some: { userId: organizerId } } }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        ticketTypes: { orderBy: { createdAt: 'asc' } },
        seatMap: { select: { id: true } },
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
      const isTeamMember = viewerId
        ? (await this.access.membershipRole(event.id, viewerId)) !== null
        : false;
      if (!isTeamMember) {
        throw new NotFoundException('Event not found');
      }
    }
    return event;
  }

  async update(eventId: string, organizerId: string, dto: UpdateEventDto) {
    await this.access.requireEventRole(eventId, organizerId, 'manager');
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
    await this.access.requireEventRole(eventId, organizerId, 'manager');
    const ticketTypeCount = await this.prisma.ticketType.count({
      where: { eventId },
    });
    if (ticketTypeCount === 0) {
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
    await this.access.requireEventRole(eventId, organizerId, 'manager');
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
    await this.access.requireEventRole(eventId, organizerId, 'manager');
    return this.prisma.$transaction(async (tx) => {
      const ticketType = await tx.ticketType.findFirst({
        where: { id: ticketTypeId, eventId },
      });
      if (!ticketType) {
        throw new NotFoundException('Ticket type not found');
      }
      let remainingDelta = 0;
      if (dto.quantity !== undefined) {
        if (ticketType.kind === 'seated') {
          if (dto.quantity !== ticketType.quantity) {
            throw new BadRequestException(
              'Seated capacity is set by the seat map — edit the map to change it',
            );
          }
        } else {
          const sold = ticketType.quantity - ticketType.remaining;
          if (dto.quantity < sold) {
            throw new BadRequestException(
              `Quantity cannot go below the ${sold} tickets already issued`,
            );
          }
          remainingDelta = dto.quantity - ticketType.quantity;
        }
      }
      if (remainingDelta !== 0) {
        const applied = await tx.$executeRaw`
          UPDATE ticket_types
          SET remaining = remaining + ${remainingDelta}, updated_at = now()
          WHERE id = ${ticketTypeId} AND remaining + ${remainingDelta} >= 0`;
        if (applied !== 1) {
          throw new ConflictException(
            'Tickets sold while the quantity was changing — reload and try again',
          );
        }
      }
      return tx.ticketType.update({
        where: { id: ticketTypeId },
        data: {
          name: dto.name?.trim(),
          maxPerOrder: dto.maxPerOrder,
          quantity: dto.quantity,
        },
      });
    });
  }
}

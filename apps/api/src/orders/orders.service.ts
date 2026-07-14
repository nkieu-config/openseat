import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { MailService } from '../notifications/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateOrderDto } from './dto/create-order.dto';

const ORDER_INCLUDE = {
  event: {
    select: {
      id: true,
      slug: true,
      title: true,
      venueName: true,
      startsAt: true,
    },
  },
  items: { include: { ticketType: { select: { id: true, name: true } } } },
  tickets: {
    include: { ticketType: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private async findByIdempotencyKey(eventId: string, idempotencyKey: string) {
    return this.prisma.order.findUnique({
      where: { eventId_idempotencyKey: { eventId, idempotencyKey } },
      include: ORDER_INCLUDE,
    });
  }

  async create(params: {
    eventId: string;
    dto: CreateOrderDto;
    buyerUserId: string | null;
    idempotencyKey: string | null;
  }) {
    const { eventId, dto, buyerUserId, idempotencyKey } = params;

    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(eventId, idempotencyKey);
      if (existing) {
        return { order: existing, replayed: true };
      }
    }

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, status: 'published' },
      include: { ticketTypes: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const typesById = new Map(event.ticketTypes.map((type) => [type.id, type]));
    const seen = new Set<string>();
    for (const item of dto.items) {
      const type = typesById.get(item.ticketTypeId);
      if (!type) {
        throw new BadRequestException('Unknown ticket type for this event');
      }
      if (seen.has(item.ticketTypeId)) {
        throw new BadRequestException('Duplicate ticket type in order');
      }
      seen.add(item.ticketTypeId);
      if (item.quantity > type.maxPerOrder) {
        throw new BadRequestException(
          `At most ${type.maxPerOrder} tickets of "${type.name}" per order`,
        );
      }
    }

    const totalSatang = dto.items.reduce(
      (total, item) =>
        total + item.quantity * typesById.get(item.ticketTypeId)!.priceSatang,
      0,
    );
    if (totalSatang > 0) {
      throw new BadRequestException('Paid tickets arrive in a later milestone');
    }

    const buyerEmail = dto.buyerEmail.trim().toLowerCase();
    const buyerName = dto.buyerName.trim();

    let orderId: string;
    try {
      orderId = await this.prisma.$transaction(async (tx) => {
        for (const item of dto.items) {
          const claimed = await tx.$executeRaw`
            UPDATE ticket_types
            SET remaining = remaining - ${item.quantity}, updated_at = now()
            WHERE id = ${item.ticketTypeId} AND remaining >= ${item.quantity}`;
          if (claimed !== 1) {
            throw new ConflictException({
              message: `"${typesById.get(item.ticketTypeId)!.name}" is sold out`,
              code: 'SOLD_OUT',
              ticketTypeId: item.ticketTypeId,
            });
          }
        }

        const order = await tx.order.create({
          data: {
            eventId,
            buyerUserId,
            buyerEmail,
            buyerName,
            status: 'paid',
            totalSatang,
            idempotencyKey,
            guestToken: randomBytes(24).toString('base64url'),
            items: {
              create: dto.items.map((item) => ({
                ticketTypeId: item.ticketTypeId,
                quantity: item.quantity,
                unitPriceSatang: typesById.get(item.ticketTypeId)!.priceSatang,
              })),
            },
          },
        });

        await tx.ticket.createMany({
          data: dto.items.flatMap((item) =>
            Array.from({ length: item.quantity }, () => ({
              orderId: order.id,
              eventId,
              ticketTypeId: item.ticketTypeId,
              attendeeEmail: buyerEmail,
              attendeeName: buyerName,
              qrToken: randomBytes(16).toString('base64url'),
            })),
          ),
        });

        return order.id;
      });
    } catch (error) {
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findByIdempotencyKey(
          eventId,
          idempotencyKey,
        );
        if (existing) {
          return { order: existing, replayed: true };
        }
      }
      throw error;
    }

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    await this.mail.sendOrderConfirmation({
      to: order.buyerEmail,
      buyerName: order.buyerName,
      eventTitle: order.event.title,
      eventVenue: order.event.venueName,
      eventStartsAt: order.event.startsAt,
      orderId: order.id,
      guestToken: order.guestToken,
      ticketNames: order.tickets.map((ticket) => ticket.ticketType.name),
    });

    return { order, replayed: false };
  }

  async getById(
    orderId: string,
    viewer: { userId: string | null; guestToken: string | null },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    const ownedByUser =
      viewer.userId !== null && order.buyerUserId === viewer.userId;
    const ownedByToken =
      viewer.guestToken !== null && order.guestToken === viewer.guestToken;
    if (!ownedByUser && !ownedByToken) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async listMyTickets(userId: string) {
    return this.prisma.ticket.findMany({
      where: { order: { buyerUserId: userId } },
      include: {
        event: {
          select: {
            id: true,
            slug: true,
            title: true,
            venueName: true,
            startsAt: true,
          },
        },
        ticketType: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

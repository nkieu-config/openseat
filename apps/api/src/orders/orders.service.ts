import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { OutboxService } from '../outbox/outbox.service';
import { PaymockClientService } from '../paymock-client/paymock-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersQueueService } from './orders.queue';

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
    include: {
      ticketType: { select: { id: true, name: true } },
      seat: { select: { section: true, rowLabel: true, number: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  payment: { select: { status: true, checkoutUrl: true } },
};

const PAYMENT_WINDOW_MS = 15 * 60_000;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly paymock: PaymockClientService,
    private readonly ordersQueue: OrdersQueueService,
  ) {}

  newQrToken(): string {
    return randomBytes(16).toString('base64url');
  }

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
    holderKey: string | null;
  }) {
    const { eventId, dto, buyerUserId, idempotencyKey, holderKey } = params;
    const gaItems = dto.items ?? [];
    const seatIds = [...new Set(dto.seatIds ?? [])];

    if (gaItems.length === 0 && seatIds.length === 0) {
      throw new BadRequestException('Pick at least one ticket or seat');
    }
    if (seatIds.length > 0 && !holderKey) {
      throw new BadRequestException(
        'X-Hold-Key header is required for seat orders',
      );
    }

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
    for (const item of gaItems) {
      const type = typesById.get(item.ticketTypeId);
      if (!type || type.kind !== 'ga') {
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

    const seats =
      seatIds.length > 0
        ? await this.prisma.seat.findMany({
            where: { id: { in: seatIds }, eventId },
            include: {
              ticketType: { select: { id: true, priceSatang: true } },
            },
          })
        : [];
    if (seats.length !== seatIds.length) {
      throw new BadRequestException('Unknown seat for this event');
    }

    const totalSatang =
      gaItems.reduce(
        (total, item) =>
          total + item.quantity * typesById.get(item.ticketTypeId)!.priceSatang,
        0,
      ) + seats.reduce((total, seat) => total + seat.ticketType.priceSatang, 0);
    const requiresPayment = totalSatang > 0;

    const buyerEmail = dto.buyerEmail.trim().toLowerCase();
    const buyerName = dto.buyerName.trim();
    const expiresAt = requiresPayment
      ? new Date(Date.now() + PAYMENT_WINDOW_MS)
      : null;

    const seatGroups = new Map<
      string,
      { quantity: number; unitPriceSatang: number }
    >();
    for (const seat of seats) {
      const group = seatGroups.get(seat.ticketTypeId) ?? {
        quantity: 0,
        unitPriceSatang: seat.ticketType.priceSatang,
      };
      group.quantity += 1;
      seatGroups.set(seat.ticketTypeId, group);
    }

    let orderId: string;
    try {
      orderId = await this.prisma.$transaction(async (tx) => {
        for (const item of gaItems) {
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
            status: requiresPayment ? 'awaiting_payment' : 'paid',
            totalSatang,
            idempotencyKey,
            expiresAt,
            guestToken: randomBytes(24).toString('base64url'),
            items: {
              create: [
                ...gaItems.map((item) => ({
                  ticketTypeId: item.ticketTypeId,
                  quantity: item.quantity,
                  unitPriceSatang: typesById.get(item.ticketTypeId)!
                    .priceSatang,
                })),
                ...[...seatGroups].map(([ticketTypeId, group]) => ({
                  ticketTypeId,
                  quantity: group.quantity,
                  unitPriceSatang: group.unitPriceSatang,
                })),
              ],
            },
          },
        });

        if (seatIds.length > 0) {
          if (requiresPayment) {
            const bound = await tx.$executeRaw`
              UPDATE holds
              SET order_id = ${order.id}, expires_at = ${expiresAt}
              WHERE event_id = ${eventId}
                AND holder_key = ${holderKey}
                AND expires_at > now()
                AND seat_id = ANY(${seatIds})`;
            if (bound !== seatIds.length) {
              throw new ConflictException({
                message:
                  'Your hold on one or more seats has expired — pick them again',
                code: 'HOLD_EXPIRED',
              });
            }
          } else {
            const consumed = await tx.$queryRaw<{ seat_id: string }[]>`
              DELETE FROM holds
              WHERE event_id = ${eventId}
                AND holder_key = ${holderKey}
                AND expires_at > now()
                AND seat_id = ANY(${seatIds})
              RETURNING seat_id`;
            if (consumed.length !== seatIds.length) {
              throw new ConflictException({
                message:
                  'Your hold on one or more seats has expired — pick them again',
                code: 'HOLD_EXPIRED',
              });
            }
            for (const [ticketTypeId, group] of seatGroups) {
              await tx.ticketType.update({
                where: { id: ticketTypeId },
                data: { remaining: { decrement: group.quantity } },
              });
            }
          }
        }

        if (!requiresPayment) {
          await tx.ticket.createMany({
            data: [
              ...gaItems.flatMap((item) =>
                Array.from({ length: item.quantity }, () => ({
                  orderId: order.id,
                  eventId,
                  ticketTypeId: item.ticketTypeId,
                  attendeeEmail: buyerEmail,
                  attendeeName: buyerName,
                  qrToken: this.newQrToken(),
                })),
              ),
              ...seats.map((seat) => ({
                orderId: order.id,
                eventId,
                ticketTypeId: seat.ticketTypeId,
                seatId: seat.id,
                attendeeEmail: buyerEmail,
                attendeeName: buyerName,
                qrToken: this.newQrToken(),
              })),
            ],
          });
          await this.outbox.writeInTx(tx, 'ticket.issued', {
            orderId: order.id,
          });
          if (seatIds.length > 0) {
            await this.outbox.writeInTx(tx, 'seats.sold', { eventId, seatIds });
          }
        }

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

    if (requiresPayment) {
      try {
        const order = await this.prisma.order.findUniqueOrThrow({
          where: { id: orderId },
        });
        const intent = await this.paymock.createIntent({
          orderId,
          amountSatang: totalSatang,
          guestToken: order.guestToken,
        });
        await this.prisma.payment.create({
          data: {
            orderId,
            providerIntentId: intent.intentId,
            checkoutUrl: intent.checkoutUrl,
            amountSatang: totalSatang,
          },
        });
        this.ordersQueue.enqueueExpiry(orderId, PAYMENT_WINDOW_MS);
      } catch (error) {
        await this.expireOrder(orderId, 'canceled');
        throw error;
      }
    }

    this.outbox.nudge();

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    return { order, replayed: false };
  }

  async releaseOrderInventoryInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    finalStatus: 'expired' | 'canceled',
  ): Promise<boolean> {
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: 'awaiting_payment' },
      data: { status: finalStatus },
    });
    if (updated.count === 0) {
      return false;
    }

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: { include: { ticketType: { select: { kind: true } } } },
      },
    });
    for (const item of order.items) {
      if (item.ticketType.kind === 'ga') {
        await tx.ticketType.update({
          where: { id: item.ticketTypeId },
          data: { remaining: { increment: item.quantity } },
        });
      }
    }

    const releasedHolds = await tx.$queryRaw<{ seat_id: string }[]>`
      DELETE FROM holds WHERE order_id = ${orderId} RETURNING seat_id`;
    if (releasedHolds.length > 0) {
      await this.outbox.writeInTx(tx, 'seats.released', {
        eventId: order.eventId,
        seatIds: releasedHolds.map((hold) => hold.seat_id),
      });
    }
    await this.outbox.writeInTx(tx, 'order.updated', {
      orderId,
      status: finalStatus,
    });
    return true;
  }

  async expireOrder(
    orderId: string,
    finalStatus: 'expired' | 'canceled' = 'expired',
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.releaseOrderInventoryInTx(tx, orderId, finalStatus);
    });
    this.outbox.nudge();
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
        seat: { select: { section: true, rowLabel: true, number: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

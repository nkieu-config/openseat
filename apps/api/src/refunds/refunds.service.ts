import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { OutboxService } from '../outbox/outbox.service';
import { PaymockClientService } from '../paymock-client/paymock-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { refundsTotal } from '../telemetry/metrics';

const REFUNDABLE_ORDER_STATUSES = ['paid', 'partially_refunded'];

const REFUND_INCLUDE = {
  tickets: { select: { id: true } },
} satisfies Prisma.RefundInclude;

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymock: PaymockClientService,
    private readonly outbox: OutboxService,
    private readonly access: AccessService,
  ) {}

  async create(input: {
    eventId: string;
    orderId: string;
    ticketIds: string[];
    userId: string;
    idempotencyKey: string | null;
  }) {
    const { eventId, orderId, ticketIds, userId, idempotencyKey } = input;

    await this.access.requireEventRole(eventId, userId, 'manager');

    if (idempotencyKey) {
      const existing = await this.prisma.refund.findUnique({
        where: { orderId_idempotencyKey: { orderId, idempotencyKey } },
        include: REFUND_INCLUDE,
      });
      if (existing) {
        return { refund: existing, replayed: true };
      }
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, eventId },
      include: {
        items: true,
        payment: true,
        tickets: { where: { id: { in: ticketIds } } },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!REFUNDABLE_ORDER_STATUSES.includes(order.status)) {
      throw new ConflictException('Order is not refundable');
    }
    if (order.tickets.length !== ticketIds.length) {
      throw new BadRequestException('Unknown ticket for this order');
    }

    const priceByType = new Map(
      order.items.map((item) => [item.ticketTypeId, item.unitPriceSatang]),
    );
    const amountSatang = order.tickets.reduce(
      (total, ticket) => total + (priceByType.get(ticket.ticketTypeId) ?? 0),
      0,
    );
    const free = amountSatang === 0;

    let refundId: string;
    try {
      refundId = await this.prisma.$transaction(async (tx) => {
        const created = await tx.refund.create({
          data: {
            orderId,
            amountSatang,
            idempotencyKey,
            requestedById: userId,
            status: free ? 'succeeded' : 'pending',
            settledAt: free ? new Date() : null,
          },
        });

        const voided = await tx.ticket.updateMany({
          where: { id: { in: ticketIds }, orderId, status: 'issued' },
          data: { status: 'void', refundId: created.id },
        });
        if (voided.count !== ticketIds.length) {
          throw new ConflictException('A ticket was already used or refunded');
        }

        const gaCounts = new Map<string, number>();
        for (const ticket of order.tickets) {
          if (ticket.seatId === null) {
            gaCounts.set(
              ticket.ticketTypeId,
              (gaCounts.get(ticket.ticketTypeId) ?? 0) + 1,
            );
          }
        }
        for (const [ticketTypeId, count] of gaCounts) {
          await tx.ticketType.update({
            where: { id: ticketTypeId },
            data: { remaining: { increment: count } },
          });
        }

        const seatIds = order.tickets
          .filter((ticket) => ticket.seatId !== null)
          .map((ticket) => ticket.seatId!);
        if (seatIds.length > 0) {
          await this.outbox.writeInTx(tx, 'seats.released', {
            eventId,
            seatIds,
          });
        }

        if (free) {
          await this.settleInTx(tx, orderId, 0);
        } else {
          await this.outbox.writeInTx(tx, 'order.updated', {
            orderId,
            status: order.status,
          });
        }

        return created.id;
      });
    } catch (error) {
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.refund.findUnique({
          where: { orderId_idempotencyKey: { orderId, idempotencyKey } },
          include: REFUND_INCLUDE,
        });
        if (existing) {
          return { refund: existing, replayed: true };
        }
      }
      throw error;
    }

    if (free) {
      refundsTotal.add(1, { result: 'succeeded' });
    } else if (order.payment) {
      await this.sendMoneyLeg(
        refundId,
        order.payment.providerIntentId,
        amountSatang,
      );
    }
    this.outbox.nudge();
    return { refund: await this.getById(refundId), replayed: false };
  }

  async retry(refundId: string, userId: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: { order: { include: { payment: true } } },
    });
    if (!refund) {
      throw new NotFoundException('Refund not found');
    }
    await this.access.requireEventRole(refund.order.eventId, userId, 'manager');
    if (refund.status !== 'failed') {
      throw new ConflictException('Only a failed refund can be retried');
    }
    if (!refund.order.payment) {
      throw new ConflictException('This refund has no payment to retry');
    }
    await this.prisma.refund.update({
      where: { id: refundId },
      data: { status: 'pending' },
    });
    await this.sendMoneyLeg(
      refundId,
      refund.order.payment.providerIntentId,
      refund.amountSatang,
    );
    return this.getById(refundId);
  }

  async settleInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    amountSatang: number,
  ) {
    await tx.order.update({
      where: { id: orderId },
      data: { refundedSatang: { increment: amountSatang } },
    });
    const liveTickets = await tx.ticket.count({
      where: { orderId, status: { not: 'void' } },
    });
    const status = liveTickets === 0 ? 'refunded' : 'partially_refunded';
    await tx.order.update({ where: { id: orderId }, data: { status } });
    await this.outbox.writeInTx(tx, 'order.refunded', {
      orderId,
      amountSatang,
    });
    await this.outbox.writeInTx(tx, 'order.updated', { orderId, status });
  }

  async getById(refundId: string) {
    return this.prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: REFUND_INCLUDE,
    });
  }

  private async sendMoneyLeg(
    refundId: string,
    providerIntentId: string,
    amountSatang: number,
  ) {
    try {
      const provider = await this.paymock.createRefund({
        intentId: providerIntentId,
        amountSatang,
        reference: refundId,
      });
      await this.prisma.refund.update({
        where: { id: refundId },
        data: { providerRefundId: provider.refundId },
      });
    } catch (error) {
      this.logger.warn(`Refund ${refundId} money leg failed: ${String(error)}`);
      await this.prisma.refund.update({
        where: { id: refundId },
        data: { status: 'failed' },
      });
      refundsTotal.add(1, { result: 'failed' });
    }
  }
}

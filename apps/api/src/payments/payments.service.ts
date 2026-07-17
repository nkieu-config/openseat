import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { OrdersService } from '../orders/orders.service';
import { OutboxService } from '../outbox/outbox.service';
import { PaymockClientService } from '../paymock-client/paymock-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { RefundsService } from '../refunds/refunds.service';
import { Prisma } from '../generated/prisma/client';
import { ordersPaid, refundsTotal, webhookEvents } from '../telemetry/metrics';

export type PaymockWebhookEvent = {
  id: string;
  type: string;
  intentId: string;
  orderId: string;
  amountSatang: number;
  refundId?: string;
  reference?: string;
  createdAt: string;
};

const SIGNATURE_TOLERANCE_SECONDS = 300;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymock: PaymockClientService,
    private readonly orders: OrdersService,
    private readonly outbox: OutboxService,
    private readonly refunds: RefundsService,
  ) {}

  private rejectWebhook(message: string): never {
    webhookEvents.add(1, { outcome: 'invalid' });
    throw new BadRequestException(message);
  }

  verifySignature(header: string | undefined, rawBody: Buffer): void {
    if (!header) {
      this.rejectWebhook('Missing webhook signature');
    }
    const parts = new Map(
      header.split(',').map((part) => part.split('=', 2) as [string, string]),
    );
    const timestamp = Number(parts.get('t'));
    const signature = parts.get('v1');
    if (!Number.isFinite(timestamp) || !signature) {
      this.rejectWebhook('Malformed webhook signature');
    }
    if (Math.abs(Date.now() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
      this.rejectWebhook('Webhook timestamp outside tolerance');
    }
    const expected = createHmac('sha256', this.paymock.webhookSecret())
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const provided = Buffer.from(signature, 'hex');
    const wanted = Buffer.from(expected, 'hex');
    if (
      provided.length !== wanted.length ||
      !timingSafeEqual(provided, wanted)
    ) {
      this.rejectWebhook('Invalid webhook signature');
    }
  }

  async recordEvent(event: PaymockWebhookEvent): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: { providerEventId: event.id, type: event.type },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        webhookEvents.add(1, { outcome: 'duplicate' });
        return false;
      }
      throw error;
    }
  }

  async processEvent(event: PaymockWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'payment.succeeded':
        await this.handleSucceeded(event);
        break;
      case 'payment.failed':
        await this.handleFailed(event);
        break;
      case 'payment.refunded':
        await this.handleRefunded(event);
        break;
      default:
        this.logger.warn(`ignoring unknown webhook type: ${event.type}`);
        webhookEvents.add(1, { outcome: 'ignored' });
        return;
    }
    await this.prisma.webhookEvent.updateMany({
      where: { providerEventId: event.id },
      data: { processedAt: new Date() },
    });
    webhookEvents.add(1, { outcome: 'processed' });
  }

  private async handleRefunded(event: PaymockWebhookEvent): Promise<void> {
    if (!event.reference) {
      this.logger.warn('payment.refunded arrived without a reference');
      return;
    }
    let settled = false;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.refund.updateMany({
        where: { id: event.reference, status: 'pending' },
        data: {
          status: 'succeeded',
          settledAt: new Date(),
          providerRefundId: event.refundId,
        },
      });
      if (updated.count === 0) {
        return;
      }
      settled = true;
      await this.refunds.settleInTx(tx, event.orderId, event.amountSatang);
    });
    if (settled) {
      refundsTotal.add(1, { result: 'succeeded' });
    }
  }

  private async handleSucceeded(event: PaymockWebhookEvent) {
    let becamePaid = false;
    await this.prisma.$transaction(async (tx) => {
      const paymentUpdated = await tx.payment.updateMany({
        where: { providerIntentId: event.intentId, status: 'requires_action' },
        data: { status: 'succeeded' },
      });
      if (paymentUpdated.count === 0) {
        return;
      }
      const orderUpdated = await tx.order.updateMany({
        where: { id: event.orderId, status: 'awaiting_payment' },
        data: { status: 'paid' },
      });
      if (orderUpdated.count === 0) {
        this.logger.warn(
          `Payment ${event.intentId} succeeded but order ${event.orderId} was not awaiting payment`,
        );
        return;
      }
      becamePaid = true;

      const order = await tx.order.findUniqueOrThrow({
        where: { id: event.orderId },
        include: { items: { include: { ticketType: true } } },
      });
      const consumedHolds = await tx.$queryRaw<{ seat_id: string }[]>`
        DELETE FROM holds WHERE order_id = ${order.id} RETURNING seat_id`;
      const seatIds = consumedHolds.map((hold) => hold.seat_id);
      const seats =
        seatIds.length > 0
          ? await tx.seat.findMany({
              where: { id: { in: seatIds } },
              select: { id: true, ticketTypeId: true },
            })
          : [];
      const tierCounts = new Map<string, number>();
      for (const seat of seats) {
        tierCounts.set(
          seat.ticketTypeId,
          (tierCounts.get(seat.ticketTypeId) ?? 0) + 1,
        );
      }
      for (const [ticketTypeId, count] of tierCounts) {
        await tx.ticketType.update({
          where: { id: ticketTypeId },
          data: { remaining: { decrement: count } },
        });
      }

      await tx.ticket.createMany({
        data: [
          ...order.items
            .filter((item) => item.ticketType.kind === 'ga')
            .flatMap((item) =>
              Array.from({ length: item.quantity }, () => ({
                orderId: order.id,
                eventId: order.eventId,
                ticketTypeId: item.ticketTypeId,
                attendeeEmail: order.buyerEmail,
                attendeeName: order.buyerName,
                qrToken: this.orders.newQrToken(),
              })),
            ),
          ...seats.map((seat) => ({
            orderId: order.id,
            eventId: order.eventId,
            ticketTypeId: seat.ticketTypeId,
            seatId: seat.id,
            attendeeEmail: order.buyerEmail,
            attendeeName: order.buyerName,
            qrToken: this.orders.newQrToken(),
          })),
        ],
      });

      await this.outbox.writeInTx(tx, 'ticket.issued', { orderId: order.id });
      await this.outbox.writeInTx(tx, 'order.updated', {
        orderId: order.id,
        status: 'paid',
      });
      if (seatIds.length > 0) {
        await this.outbox.writeInTx(tx, 'seats.sold', {
          eventId: order.eventId,
          seatIds,
        });
      }
    });
    if (becamePaid) {
      ordersPaid.add(1);
    }
  }

  private async handleFailed(event: PaymockWebhookEvent) {
    await this.prisma.$transaction(async (tx) => {
      const paymentUpdated = await tx.payment.updateMany({
        where: { providerIntentId: event.intentId, status: 'requires_action' },
        data: { status: 'failed' },
      });
      if (paymentUpdated.count === 0) {
        return;
      }
      await this.orders.releaseOrderInventoryInTx(
        tx,
        event.orderId,
        'canceled',
      );
    });
  }
}

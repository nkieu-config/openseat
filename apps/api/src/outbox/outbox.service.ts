import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../notifications/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Prisma } from '../generated/prisma/client';

export type OutboxEventType =
  | 'ticket.issued'
  | 'seats.sold'
  | 'seats.released'
  | 'order.updated'
  | 'order.refunded';

type OutboxWriter = Pick<Prisma.TransactionClient, 'outboxEvent'>;

const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 50;

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly realtime: RealtimeService,
  ) {}

  async writeInTx(
    tx: OutboxWriter,
    type: OutboxEventType,
    payload: Prisma.InputJsonValue,
  ) {
    await tx.outboxEvent.create({ data: { type, payload } });
  }

  nudge() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    void this.dispatchPending().catch((error) => {
      this.logger.warn(`Outbox nudge failed: ${String(error)}`);
    });
  }

  async dispatchPending(): Promise<number> {
    const events = await this.prisma.outboxEvent.findMany({
      where: { processedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });
    let processed = 0;
    for (const event of events) {
      try {
        await this.handle(event.type, event.payload as Record<string, unknown>);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
        processed += 1;
      } catch (error) {
        this.logger.warn(
          `Outbox event ${event.id} (${event.type}) failed: ${String(error)}`,
        );
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { attempts: { increment: 1 } },
        });
      }
    }
    return processed;
  }

  private async handle(type: string, payload: Record<string, unknown>) {
    switch (type) {
      case 'seats.sold':
        this.realtime.seatsChanged(payload.eventId as string, {
          sold: payload.seatIds as string[],
        });
        return;
      case 'seats.released':
        this.realtime.seatsChanged(payload.eventId as string, {
          released: payload.seatIds as string[],
        });
        return;
      case 'order.updated':
        this.realtime.orderChanged(payload.orderId as string, {
          status: payload.status as string,
        });
        return;
      case 'ticket.issued':
        await this.sendTicketEmail(payload.orderId as string);
        return;
      case 'order.refunded':
        await this.sendRefundNotice(
          payload.orderId as string,
          payload.amountSatang as number,
        );
        return;
      default:
        this.logger.warn(
          `Unknown outbox event type ${type}; marking as processed`,
        );
    }
  }

  private async sendTicketEmail(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        event: { select: { title: true, venueName: true, startsAt: true } },
        tickets: {
          include: {
            ticketType: { select: { name: true } },
            seat: { select: { section: true, rowLabel: true, number: true } },
          },
        },
      },
    });
    if (!order) {
      return;
    }
    await this.mail.sendOrderConfirmation({
      to: order.buyerEmail,
      buyerName: order.buyerName,
      eventTitle: order.event.title,
      eventVenue: order.event.venueName,
      eventStartsAt: order.event.startsAt,
      orderId: order.id,
      guestToken: order.guestToken,
      ticketNames: order.tickets.map((ticket) =>
        ticket.seat
          ? `${ticket.ticketType.name} — ${ticket.seat.section} ${ticket.seat.rowLabel}${ticket.seat.number}`
          : ticket.ticketType.name,
      ),
    });
  }

  private async sendRefundNotice(orderId: string, amountSatang: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { event: { select: { title: true } } },
    });
    if (!order) {
      return;
    }
    await this.mail.sendRefundNotice({
      to: order.buyerEmail,
      buyerName: order.buyerName,
      eventTitle: order.event.title,
      amountSatang,
      orderId: order.id,
      guestToken: order.guestToken,
    });
  }
}

import { EventSummaryDto } from '../../events/dto/event-response.dto';

export class TicketTypeRefDto {
  id: string;
  name: string;
}

export class SeatLabelDto {
  section: string;
  rowLabel: string;
  number: number;
}

export class OrderTicketDto {
  id: string;
  qrToken: string;
  status: 'issued' | 'checked_in' | 'void';
  attendeeName: string;
  ticketType: TicketTypeRefDto;
  seat: SeatLabelDto | null;
}

export class OrderItemDto {
  id: string;
  quantity: number;
  unitPriceSatang: number;
  ticketType: TicketTypeRefDto;
}

export class OrderPaymentDto {
  status: 'requires_action' | 'succeeded' | 'failed';
  checkoutUrl: string;
}

export class OrderDetailDto {
  id: string;
  status:
    | 'awaiting_payment'
    | 'paid'
    | 'expired'
    | 'canceled'
    | 'partially_refunded'
    | 'refunded';
  totalSatang: number;
  refundedSatang: number;
  guestToken: string;
  buyerEmail: string;
  buyerName: string;
  createdAt: string;
  expiresAt: string | null;
  event: EventSummaryDto;
  items: OrderItemDto[];
  tickets: OrderTicketDto[];
  payment: OrderPaymentDto | null;
}

export class MyTicketDto {
  id: string;
  qrToken: string;
  status: 'issued' | 'checked_in' | 'void';
  createdAt: string;
  event: EventSummaryDto;
  ticketType: TicketTypeRefDto;
  seat: SeatLabelDto | null;
}

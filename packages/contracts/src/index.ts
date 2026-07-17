export type { paths, components } from './api';

export const API_PREFIX = '/api';

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  isDemo: boolean;
};

export type AuthResponse = {
  user: PublicUser;
  accessToken: string;
};

export type TicketTypePublic = {
  id: string;
  kind: 'ga' | 'seated';
  name: string;
  priceSatang: number;
  quantity: number;
  remaining: number;
  maxPerOrder: number;
};

export type EventSummary = {
  id: string;
  slug: string;
  title: string;
  venueName: string;
  startsAt: string;
};

export type EventDetail = EventSummary & {
  description: string;
  endsAt: string | null;
  status: 'draft' | 'published';
  coverImageUrl: string | null;
  isDemo: boolean;
  dropMode: boolean;
  saleOpensAt: string | null;
  organizer: { id: string; displayName: string };
  ticketTypes: TicketTypePublic[];
  seatMap: { id: string } | null;
};

export type MyEvent = Omit<EventDetail, 'organizer'> & {
  ticketsIssued: number;
};

export type SeatStatus = 'available' | 'held' | 'sold';

export type SeatInfo = {
  id: string;
  section: string;
  rowLabel: string;
  number: number;
  x: number;
  y: number;
  ticketTypeId: string;
  status: SeatStatus;
  mine: boolean;
  expiresAt?: string;
};

export type SeatMapSectionMeta = {
  name: string;
  yStart: number;
  rows: number;
  cols: number;
  xOffset: number;
};

export type SeatMapData = {
  id: string;
  template: string;
  meta: { maxCols: number; totalRows: number; sections: SeatMapSectionMeta[] };
  tiers: { id: string; name: string; priceSatang: number; remaining: number }[];
  seats: SeatInfo[];
};

export type SeatsChangedMessage = {
  held: string[];
  released: string[];
  sold: string[];
};

export type TicketStatus = 'issued' | 'checked_in' | 'void';

export type SeatLabel = { section: string; rowLabel: string; number: number };

export type OrderTicket = {
  id: string;
  qrToken: string;
  status: TicketStatus;
  attendeeName: string;
  ticketType: { id: string; name: string };
  seat: SeatLabel | null;
};

export type OrderDetail = {
  id: string;
  status:
    | 'pending'
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
  event: EventSummary;
  items: { id: string; quantity: number; unitPriceSatang: number; ticketType: { id: string; name: string } }[];
  tickets: OrderTicket[];
  payment: { status: 'requires_action' | 'succeeded' | 'failed'; checkoutUrl: string } | null;
};

export type MyTicket = {
  id: string;
  qrToken: string;
  status: TicketStatus;
  createdAt: string;
  event: EventSummary;
  ticketType: { id: string; name: string };
  seat: SeatLabel | null;
};

export type HealthResponse = {
  status: 'ok';
  uptimeSeconds: number;
  version: string;
};

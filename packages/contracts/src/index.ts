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
  organizer: { id: string; displayName: string };
  ticketTypes: TicketTypePublic[];
};

export type MyEvent = Omit<EventDetail, 'organizer'> & {
  ticketsIssued: number;
};

export type TicketStatus = 'issued' | 'checked_in' | 'void';

export type OrderTicket = {
  id: string;
  qrToken: string;
  status: TicketStatus;
  attendeeName: string;
  ticketType: { id: string; name: string };
};

export type OrderDetail = {
  id: string;
  status: 'pending' | 'paid' | 'expired' | 'canceled';
  totalSatang: number;
  guestToken: string;
  buyerEmail: string;
  buyerName: string;
  createdAt: string;
  event: EventSummary;
  items: { id: string; quantity: number; unitPriceSatang: number; ticketType: { id: string; name: string } }[];
  tickets: OrderTicket[];
};

export type MyTicket = {
  id: string;
  qrToken: string;
  status: TicketStatus;
  createdAt: string;
  event: EventSummary;
  ticketType: { id: string; name: string };
};

export type HealthResponse = {
  status: 'ok';
  uptimeSeconds: number;
  version: string;
};

import type { APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const API = process.env.E2E_API ?? 'http://localhost:4000';
export const WEB = process.env.E2E_WEB ?? 'http://localhost:3000';
export const GATE = process.env.E2E_GATE ?? 'http://localhost:4200';

export interface TicketType {
  id: string;
  name: string;
  remaining: number;
}

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  dropMode: boolean;
  ticketTypes: TicketType[];
}

export interface IssuedTicket {
  orderId: string;
  guestToken: string;
  qrToken: string;
}

export async function getEvent(request: APIRequestContext, slug: string): Promise<EventSummary> {
  const response = await request.get(`${API}/api/events/${slug}`);
  if (!response.ok()) {
    throw new Error(`getEvent(${slug}) failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as EventSummary;
}

export async function simulateCrowd(
  request: APIRequestContext,
  eventId: string,
  count: number,
): Promise<{ added: number; total: number }> {
  const response = await request.post(`${GATE}/gate/${eventId}/simulate`, { data: { count } });
  if (!response.ok()) {
    throw new Error(`simulateCrowd failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as { added: number; total: number };
}

export async function issueFreeGaTicket(
  request: APIRequestContext,
  slug: string,
): Promise<IssuedTicket> {
  const event = await getEvent(request, slug);
  const ga = event.ticketTypes.find((type) => type.name === 'General admission');
  if (!ga) {
    throw new Error(
      `no General admission tier on ${slug}; found ${event.ticketTypes
        .map((type) => type.name)
        .join(', ')}`,
    );
  }
  const response = await request.post(`${API}/api/events/${event.id}/orders`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: {
      items: [{ ticketTypeId: ga.id, quantity: 1 }],
      buyerEmail: `e2e-${randomUUID()}@openseat.test`,
      buyerName: 'E2E Buyer',
    },
  });
  if (!response.ok()) {
    throw new Error(`issueFreeGaTicket failed: ${response.status()} ${await response.text()}`);
  }
  const order = (await response.json()) as {
    id: string;
    guestToken: string;
    tickets: { qrToken: string }[];
  };
  const [ticket] = order.tickets;
  if (!ticket) {
    throw new Error(`order ${order.id} issued no tickets`);
  }
  return {
    orderId: order.id,
    guestToken: order.guestToken,
    qrToken: ticket.qrToken,
  };
}

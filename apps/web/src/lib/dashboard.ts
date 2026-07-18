import { apiBaseUrl, getAccessToken, refreshSession } from "./api";
import { gqlRequest } from "./graphql";

export type EventCard = {
  id: string;
  slug: string;
  title: string;
  status: string;
  venueName: string;
  startsAt: string;
  isDemo: boolean;
  seated: boolean;
  capacity: number;
  ticketsSold: number;
  ticketsCheckedIn: number;
  grossSatang: number | null;
  myRole: string;
};

export type EventSummary = {
  id: string;
  title: string;
  venueName: string;
  startsAt: string;
  status: string;
  ticketsSold: number;
  ticketsCheckedIn: number;
  myRole: string;
};

export type DashboardTotals = {
  grossSatang: number;
  paidOrders: number;
  pendingOrders: number;
  ticketsSold: number;
  ticketsCheckedIn: number;
  liveHolds: number;
  capacity: number;
  sellThroughBp: number;
};

export type TimelineBucket = {
  day: string;
  orders: number;
  ticketsSold: number;
  grossSatang: number;
};

export type TierStat = {
  id: string;
  name: string;
  kind: string;
  priceSatang: number;
  quantity: number;
  remaining: number;
  sold: number;
  grossSatang: number;
};

export type SectionOccupancy = {
  name: string;
  capacity: number;
  sold: number;
  held: number;
  available: number;
};

export type EventDashboard = {
  event: EventCard;
  totals: DashboardTotals;
  timeline: TimelineBucket[];
  tiers: TierStat[];
  sections: SectionOccupancy[];
  myRole: string;
};

export type Attendee = {
  ticketId: string;
  name: string;
  email: string;
  ticketType: string;
  seat: string | null;
  status: string;
  checkedInAt: string | null;
};

export type OrderTicketRow = {
  id: string;
  ticketType: string;
  seat: string | null;
  status: string;
  priceSatang: number;
};

export type RefundRow = {
  id: string;
  status: string;
  amountSatang: number;
};

export type EventOrder = {
  id: string;
  buyerName: string;
  buyerEmail: string;
  status: string;
  totalSatang: number;
  refundedSatang: number;
  createdAt: string;
  tickets: OrderTicketRow[];
  refunds: RefundRow[];
};

const EVENT_CARD_FIELDS = `
  id slug title status venueName startsAt isDemo seated
  capacity ticketsSold ticketsCheckedIn grossSatang myRole
`;

const ORGANIZER_EVENTS_QUERY = `query { organizerEvents { ${EVENT_CARD_FIELDS} } }`;

const EVENT_DASHBOARD_QUERY = `query ($eventId: ID!) {
  eventDashboard(eventId: $eventId) {
    event { ${EVENT_CARD_FIELDS} }
    totals {
      grossSatang paidOrders pendingOrders ticketsSold
      ticketsCheckedIn liveHolds capacity sellThroughBp
    }
    timeline { day orders ticketsSold grossSatang }
    tiers { id name kind priceSatang quantity remaining sold grossSatang }
    sections { name capacity sold held available }
    myRole
  }
}`;

const EVENT_SUMMARY_QUERY = `query ($eventId: ID!) {
  eventSummary(eventId: $eventId) {
    id title venueName startsAt status ticketsSold ticketsCheckedIn myRole
  }
}`;

const ATTENDEES_QUERY = `query ($eventId: ID!, $limit: Int) {
  eventAttendees(eventId: $eventId, limit: $limit) {
    ticketId name email ticketType seat status checkedInAt
  }
}`;

export async function fetchOrganizerEvents(): Promise<EventCard[]> {
  const data = await gqlRequest<{ organizerEvents: EventCard[] }>(
    ORGANIZER_EVENTS_QUERY,
  );
  return data.organizerEvents;
}

export async function fetchEventDashboard(
  eventId: string,
): Promise<EventDashboard> {
  const data = await gqlRequest<{ eventDashboard: EventDashboard }>(
    EVENT_DASHBOARD_QUERY,
    { eventId },
  );
  return data.eventDashboard;
}

export async function fetchEventSummary(
  eventId: string,
): Promise<EventSummary> {
  const data = await gqlRequest<{ eventSummary: EventSummary }>(
    EVENT_SUMMARY_QUERY,
    { eventId },
  );
  return data.eventSummary;
}

export async function fetchAttendees(
  eventId: string,
  limit = 500,
): Promise<Attendee[]> {
  const data = await gqlRequest<{ eventAttendees: Attendee[] }>(
    ATTENDEES_QUERY,
    { eventId, limit },
  );
  return data.eventAttendees;
}

const EVENT_ORDERS_QUERY = `query ($eventId: ID!, $limit: Int) {
  eventOrders(eventId: $eventId, limit: $limit) {
    id buyerName buyerEmail status totalSatang refundedSatang createdAt
    tickets { id ticketType seat status priceSatang }
    refunds { id status amountSatang }
  }
}`;

export async function fetchEventOrders(
  eventId: string,
  limit = 200,
): Promise<EventOrder[]> {
  const data = await gqlRequest<{ eventOrders: EventOrder[] }>(
    EVENT_ORDERS_QUERY,
    { eventId, limit },
  );
  return data.eventOrders;
}

export async function downloadAttendeesCsv(
  eventId: string,
  filename: string,
): Promise<void> {
  const run = (token: string | null) =>
    fetch(`${apiBaseUrl}/api/events/${eventId}/attendees.csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
  let response = await run(getAccessToken());
  if (response.status === 401) {
    const session = await refreshSession();
    if (session) {
      response = await run(session.accessToken);
    }
  }
  if (!response.ok) {
    throw new Error("Export failed");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

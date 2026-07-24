export const gateOrigin =
  process.env.NEXT_PUBLIC_GATE_ORIGIN ??
  (process.env.NODE_ENV === "production"
    ? "https://openseat-gate.onrender.com"
    : "http://localhost:4200");

const visitorKey = (eventId: string) => `os_gate_visitor_${eventId}`;

export function getVisitorId(eventId: string): string {
  const existing = window.localStorage.getItem(visitorKey(eventId));
  if (existing) {
    return existing;
  }
  const created = `v:${crypto.randomUUID()}`;
  window.localStorage.setItem(visitorKey(eventId), created);
  return created;
}

export type JoinResult = {
  visitorId: string;
  admitted: boolean;
  position?: number;
  total?: number;
  token?: string;
};

export async function joinQueue(
  eventId: string,
  visitorId: string,
): Promise<JoinResult> {
  const response = await fetch(`${gateOrigin}/gate/${eventId}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visitorId }),
  });
  return (await response.json()) as JoinResult;
}

export async function simulateCrowd(
  eventId: string,
  count: number,
): Promise<{ added: number; total: number }> {
  const response = await fetch(`${gateOrigin}/gate/${eventId}/simulate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ count }),
  });
  return (await response.json()) as { added: number; total: number };
}

export function openQueueStream(
  eventId: string,
  visitorId: string,
): EventSource {
  return new EventSource(
    `${gateOrigin}/gate/${eventId}/queue?visitor=${encodeURIComponent(visitorId)}`,
  );
}

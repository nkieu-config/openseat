import { api, apiErrorMessage } from "./api";

export type CheckinOutcome = "checked_in" | "already_checked_in";

export type CheckinResult = {
  outcome: CheckinOutcome;
  ticketId: string;
  attendeeName: string;
  ticketType: string;
  seat: string | null;
  status: string;
  checkedInAt: string | null;
};

export type CheckinResponse =
  | { ok: true; result: CheckinResult }
  | { ok: false; message: string };

export async function checkInTicket(
  eventId: string,
  qrToken: string,
): Promise<CheckinResponse> {
  const { data, error, response } = await api.POST("/api/events/{id}/checkin", {
    params: { path: { id: eventId } },
    body: { qrToken },
  });
  if (!response.ok || !data) {
    return {
      ok: false,
      message: apiErrorMessage(error, "Ticket not recognised"),
    };
  }
  return { ok: true, result: data as unknown as CheckinResult };
}

"use client";

import type { SeatMapData } from "@openseat/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api/client";
import {
  downloadAttendeesCsv,
  fetchEventDashboard,
  fetchEventSummary,
  type EventDashboard,
} from "@/lib/api/dashboard";
import { useConsoleGate } from "@/lib/use-console-gate";

export type EventConsole = {
  state: ReturnType<typeof useConsoleGate>["state"];
  reload: () => void;
  dashboard: EventDashboard | null;
  seatMap: SeatMapData | null;
  busy: boolean;
  exporting: boolean;
  quantities: Record<string, number>;
  setQuantity: (ticketTypeId: string, quantity: number) => void;
  publish: () => Promise<void>;
  saveQuantity: (ticketTypeId: string) => Promise<void>;
  exportCsv: () => Promise<void>;
};

export function useEventConsole(eventId: string): EventConsole {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [quantityEdits, setQuantityEdits] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const dash = await fetchEventDashboard(eventId);
    let map: SeatMapData | null = null;
    if (dash.event.seated) {
      const { data } = await api.GET("/api/events/{eventId}/seat-map", {
        params: { path: { eventId } },
      });
      map = data ?? null;
    }
    return { dash, map };
  }, [eventId]);

  const sendStaffToTheDoor = useCallback(async () => {
    try {
      const summary = await fetchEventSummary(eventId);
      if (summary.myRole !== "staff") {
        return false;
      }
      router.replace(`/organizer/events/${eventId}/checkin`);
      return true;
    } catch {
      return false;
    }
  }, [eventId, router]);

  const gate = useConsoleGate(
    `/organizer/events/${eventId}`,
    load,
    sendStaffToTheDoor,
  );
  const dashboard = gate.data?.dash ?? null;
  const seatMap = gate.data?.map ?? null;

  const quantities: Record<string, number> = Object.fromEntries(
    (dashboard?.tiers ?? []).map((tier) => [
      tier.id,
      quantityEdits[tier.id] ?? tier.quantity,
    ]),
  );

  const setQuantity = useCallback((ticketTypeId: string, quantity: number) => {
    setQuantityEdits((current) => ({ ...current, [ticketTypeId]: quantity }));
  }, []);

  const { reload } = gate;

  const publish = useCallback(async () => {
    setBusy(true);
    try {
      const { error, response } = await api.POST("/api/events/{id}/publish", {
        params: { path: { id: eventId } },
      });
      if (!response.ok) {
        toast.error(apiErrorMessage(error, "Could not publish"));
        return;
      }
      toast.success("Event published — share the public link");
      reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Could not publish",
      );
    } finally {
      setBusy(false);
    }
  }, [eventId, reload]);

  const saveQuantity = useCallback(
    async (ticketTypeId: string) => {
      const quantity = quantities[ticketTypeId];
      if (!quantity || quantity < 1) {
        toast.error("Quantity must be at least 1");
        return;
      }
      const { error, response } = await api.PATCH(
        "/api/events/{id}/ticket-types/{ticketTypeId}",
        {
          params: { path: { id: eventId, ticketTypeId } },
          body: { quantity },
        },
      );
      if (!response.ok) {
        toast.error(apiErrorMessage(error, "Could not update the quantity"));
        return;
      }
      toast.success("Quantity updated");
      reload();
    },
    [eventId, quantities, reload],
  );

  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      await downloadAttendeesCsv(
        eventId,
        `attendees-${dashboard?.event.slug ?? eventId}.csv`,
      );
    } catch {
      toast.error("Could not export attendees");
    } finally {
      setExporting(false);
    }
  }, [dashboard, eventId]);

  return {
    state: gate.state,
    reload,
    dashboard,
    seatMap,
    busy,
    exporting,
    quantities,
    setQuantity,
    publish,
    saveQuantity,
    exportCsv,
  };
}

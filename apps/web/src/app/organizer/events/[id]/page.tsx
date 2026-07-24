"use client";

import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  ConsoleEventMissing,
  ConsoleLoadFailed,
} from "@/components/console/gate-notice";
import { useEventConsole } from "@/lib/use-event-console";
import { ConsoleHeader } from "./console-header";
import { DashboardReadout } from "./dashboard-readout";
import { TeamPanel } from "./team-panel";
import { TicketDesk } from "./ticket-desk";

export default function EventConsolePage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { loading } = useAuth();
  const eventConsole = useEventConsole(eventId);

  if (loading || eventConsole.state === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="font-mono text-sm text-muted-foreground">
          Powering up console…
        </p>
      </main>
    );
  }
  if (eventConsole.state === "error") {
    return <ConsoleLoadFailed onRetry={eventConsole.reload} />;
  }
  if (eventConsole.state !== "ready" || !eventConsole.dashboard) {
    return <ConsoleEventMissing />;
  }

  const { event, totals, tiers } = eventConsole.dashboard;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:py-10">
      <div className="flex flex-col gap-6">
        <ConsoleHeader
          eventId={eventId}
          event={event}
          ticketsSold={totals.ticketsSold}
          exporting={eventConsole.exporting}
          onExport={() => void eventConsole.exportCsv()}
        />

        <DashboardReadout
          dashboard={eventConsole.dashboard}
          seatMap={eventConsole.seatMap}
        />

        <TicketDesk
          eventId={eventId}
          event={event}
          tiers={tiers}
          quantities={eventConsole.quantities}
          busy={eventConsole.busy}
          onQuantityChange={eventConsole.setQuantity}
          onSaveQuantity={(ticketTypeId) =>
            void eventConsole.saveQuantity(ticketTypeId)
          }
          onPublish={() => void eventConsole.publish()}
        />

        {event.myRole === "owner" ? <TeamPanel eventId={eventId} /> : null}
      </div>
    </main>
  );
}

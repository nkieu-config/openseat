"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  ConsoleEventMissing,
  ConsoleLoadFailed,
} from "@/components/console/gate-notice";
import { Button } from "@/components/ui/button";
import { fetchEventDashboard } from "@/lib/api/dashboard";
import { useConsoleGate } from "@/lib/use-console-gate";
import { SeatMapEditor } from "./seat-map-editor";

export default function SeatMapEditorPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { loading } = useAuth();
  const router = useRouter();
  const load = useCallback(
    () => fetchEventDashboard(eventId),
    [eventId],
  );
  const gate = useConsoleGate(
    `/organizer/events/${eventId}/seatmap`,
    load,
  );
  const title = gate.data?.event.title ?? "";
  const alreadySeated = gate.data?.event.seated ?? false;

  if (loading || gate.state === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="font-mono text-sm text-muted-foreground">
          Opening the editor…
        </p>
      </main>
    );
  }
  if (gate.state === "error") {
    return <ConsoleLoadFailed onRetry={gate.reload} />;
  }
  if (gate.state !== "ready") {
    return <ConsoleEventMissing />;
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:py-10">
      <header className="mb-6 flex flex-col gap-2">
        <Link
          href={`/organizer/events/${eventId}`}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Console
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Seat-map editor</h1>
        <p className="text-sm text-muted-foreground">{title}</p>
      </header>

      {alreadySeated ? (
        <div className="rounded-md border border-console-line bg-console-panel p-6 text-center">
          <p className="text-muted-foreground">
            This event already has a seat map.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            render={<Link href={`/organizer/events/${eventId}`} />}
          >
            Back to console
          </Button>
        </div>
      ) : (
        <SeatMapEditor
          eventId={eventId}
          onSaved={() => router.push(`/organizer/events/${eventId}`)}
        />
      )}
    </main>
  );
}

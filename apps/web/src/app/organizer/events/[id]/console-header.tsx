import { Download, Receipt, ScanLine } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EventCard } from "@/lib/api/dashboard";
import { formatEventDate } from "@/lib/format";

export function ConsoleHeader({
  eventId,
  event,
  ticketsSold,
  exporting,
  onExport,
}: {
  eventId: string;
  event: EventCard;
  ticketsSold: number;
  exporting: boolean;
  onExport: () => void;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
            Front of House
          </span>
          <Badge variant={event.status === "published" ? "default" : "secondary"}>
            {event.status}
          </Badge>
          {event.seated ? <Badge variant="secondary">seated</Badge> : null}
          {event.isDemo ? <Badge variant="outline">demo</Badge> : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
        <p className="text-sm text-muted-foreground">
          {formatEventDate(event.startsAt)} · {event.venueName}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/events/${event.slug}`} />}
        >
          Public page
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={exporting || ticketsSold === 0}
        >
          <Download className="size-4" />
          {exporting ? "Exporting…" : "CSV"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/organizer/events/${eventId}/orders`} />}
        >
          <Receipt className="size-4" />
          Orders
        </Button>
        <Button
          size="sm"
          render={<Link href={`/organizer/events/${eventId}/checkin`} />}
        >
          <ScanLine className="size-4" />
          Check-in
        </Button>
      </div>
    </header>
  );
}

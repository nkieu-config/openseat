"use client";

import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { TelemetryStat } from "@/components/console/telemetry";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchOrganizerEvents, type EventCard } from "@/lib/dashboard";
import { formatBaht, formatEventDate } from "@/lib/format";

export default function OrganizerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<EventCard[] | null>(null);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace("/login?next=/organizer");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchOrganizerEvents();
        if (!cancelled) {
          setEvents(list);
        }
      } catch {
        if (!cancelled) {
          setEvents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, router]);

  if (loading || (user && events === null)) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="mt-8 flex flex-col gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </main>
    );
  }
  if (!user) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
            Control room
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">Your events</h1>
        </div>
        <Button render={<Link href="/organizer/new" />}>New event</Button>
      </div>
      {events && events.length > 0 ? (
        <div className="mt-8 flex flex-col gap-4">
          {events.map((event) => {
            const ratio =
              event.capacity > 0
                ? Math.round((event.ticketsSold / event.capacity) * 100)
                : 0;
            return (
              <div
                key={event.id}
                className="rounded-md border border-console-line bg-console-panel p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{event.title}</h2>
                      <Badge
                        variant={
                          event.status === "published" ? "default" : "secondary"
                        }
                      >
                        {event.status}
                      </Badge>
                      {event.seated ? (
                        <Badge variant="secondary">seated</Badge>
                      ) : null}
                      {event.myRole !== "owner" ? (
                        <Badge variant="outline">{event.myRole}</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatEventDate(event.startsAt)} · {event.venueName}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/events/${event.slug}`} />}
                    >
                      Public page
                    </Button>
                    <Button
                      size="sm"
                      render={<Link href={`/organizer/events/${event.id}`} />}
                    >
                      Console
                    </Button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <TelemetryStat
                    label="Gross"
                    value={
                      event.grossSatang === null
                        ? "—"
                        : formatBaht(event.grossSatang)
                    }
                  />
                  <TelemetryStat
                    label="Sold"
                    value={event.ticketsSold}
                    hint={`of ${event.capacity}`}
                  />
                  <TelemetryStat label="Sell-through" value={`${ratio}%`} />
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-console-groove">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={CalendarPlus}
          title="No events yet"
          description="Create your first event, add ticket types, and share the link — it takes about a minute."
          className="mt-8"
          action={
            <Button size="sm" render={<Link href="/organizer/new" />}>
              Create an event
            </Button>
          }
        />
      )}
    </main>
  );
}

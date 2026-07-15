"use client";

import type { MyEvent } from "@openseat/contracts";
import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatEventDate } from "@/lib/format";

export default function OrganizerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<MyEvent[] | null>(null);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace("/login?next=/organizer");
      return;
    }
    let cancelled = false;
    void api.GET("/api/events/mine").then(({ data, response }) => {
      if (!cancelled && response.ok && data !== undefined) {
        setEvents(data as unknown as MyEvent[]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, loading, router]);

  if (loading || (user && events === null)) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12">
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
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Your events</h1>
        <Button render={<Link href="/organizer/new" />}>New event</Button>
      </div>
      {events && events.length > 0 ? (
        <div className="mt-8 flex flex-col gap-4">
          {events.map((event) => {
            const capacity = event.ticketTypes.reduce((sum, type) => sum + type.quantity, 0);
            return (
              <Card key={event.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">{event.title}</CardTitle>
                    <Badge variant={event.status === "published" ? "default" : "secondary"}>
                      {event.status}
                    </Badge>
                  </div>
                  <CardDescription>
                    {formatEventDate(event.startsAt)} · {event.venueName}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-sm tabular-nums text-muted-foreground">
                      <span className="font-medium text-foreground">{event.ticketsIssued}</span> of{" "}
                      {capacity} tickets issued
                    </p>
                    <div className="h-1.5 w-44 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${capacity > 0 ? Math.round((event.ticketsIssued / capacity) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/events/${event.slug}`} />}
                    >
                      Public page
                    </Button>
                    <Button size="sm" render={<Link href={`/organizer/events/${event.id}`} />}>
                      Manage
                    </Button>
                  </div>
                </CardContent>
              </Card>
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

"use client";

import type { MyEvent } from "@openseat/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading your events…</p>
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
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{event.ticketsIssued}</span> of{" "}
                    {capacity} tickets issued
                  </p>
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
        <p className="mt-8 text-muted-foreground">
          No events yet — create your first one and share the link.
        </p>
      )}
    </main>
  );
}

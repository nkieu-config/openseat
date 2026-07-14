"use client";

import type { MyEvent } from "@openseat/contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api, apiErrorMessage } from "@/lib/api";
import { formatEventDate } from "@/lib/format";

export default function ManageEventPage() {
  const params = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [event, setEvent] = useState<MyEvent | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [busy, setBusy] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace(`/login?next=/organizer/events/${params.id}`);
      return;
    }
    let cancelled = false;
    void api.GET("/api/events/mine").then(({ data, response }) => {
      if (cancelled) {
        return;
      }
      if (!response.ok || data === undefined) {
        setState("missing");
        return;
      }
      const mine = data as unknown as MyEvent[];
      const found = mine.find((candidate) => candidate.id === params.id);
      if (!found) {
        setState("missing");
        return;
      }
      setEvent(found);
      setQuantities(
        Object.fromEntries(found.ticketTypes.map((type) => [type.id, type.quantity])),
      );
      setState("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [user, loading, router, params.id, reloadKey]);

  async function publish() {
    if (!event) {
      return;
    }
    setBusy(true);
    const { error, response } = await api.POST("/api/events/{id}/publish", {
      params: { path: { id: event.id } },
    });
    setBusy(false);
    if (!response.ok) {
      toast.error(apiErrorMessage(error, "Could not publish"));
      return;
    }
    toast.success("Event published — share the public link");
    setReloadKey((key) => key + 1);
  }

  async function saveQuantity(ticketTypeId: string) {
    if (!event) {
      return;
    }
    const quantity = quantities[ticketTypeId];
    if (!quantity || quantity < 1) {
      toast.error("Quantity must be at least 1");
      return;
    }
    const { error, response } = await api.PATCH("/api/events/{id}/ticket-types/{ticketTypeId}", {
      params: { path: { id: event.id, ticketTypeId } },
      body: { quantity },
    });
    if (!response.ok) {
      toast.error(apiErrorMessage(error, "Could not update the quantity"));
      return;
    }
    toast.success("Quantity updated");
    setReloadKey((key) => key + 1);
  }

  if (loading || state === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading event…</p>
      </main>
    );
  }
  if (state === "missing" || !event) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Event not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={event.status === "published" ? "default" : "secondary"}>
                {event.status}
              </Badge>
              {event.isDemo ? <Badge variant="outline">demo</Badge> : null}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
            <p className="text-muted-foreground">
              {formatEventDate(event.startsAt)} · {event.venueName}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" render={<Link href={`/events/${event.slug}`} />}>
              Public page
            </Button>
            {event.status === "draft" ? (
              <Button onClick={() => void publish()} disabled={busy}>
                {busy ? "Publishing…" : "Publish"}
              </Button>
            ) : null}
          </div>
        </div>
        <Separator />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ticket types</CardTitle>
            <CardDescription>
              {event.ticketsIssued} tickets issued so far. Quantities can grow any time, and can
              shrink down to the number already issued.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {event.ticketTypes.map((type) => {
              const issued = type.quantity - type.remaining;
              return (
                <div key={type.id} className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{type.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {issued} issued · {type.remaining} remaining
                    </p>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor={`quantity-${type.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        Total quantity
                      </Label>
                      <Input
                        id={`quantity-${type.id}`}
                        type="number"
                        min={issued}
                        max={100000}
                        className="w-28"
                        value={quantities[type.id] ?? type.quantity}
                        onChange={(changeEvent) =>
                          setQuantities((current) => ({
                            ...current,
                            [type.id]: Number(changeEvent.target.value),
                          }))
                        }
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(quantities[type.id] ?? type.quantity) === type.quantity}
                      onClick={() => void saveQuantity(type.id)}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

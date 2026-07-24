"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api, apiErrorMessage } from "@/lib/api/client";

type TicketTypeRow = { name: string; quantity: number; priceBaht: number };

export default function NewEventPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [venueName, setVenueName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [description, setDescription] = useState("");
  const [ticketTypes, setTicketTypes] = useState<TicketTypeRow[]>([
    { name: "General admission", quantity: 50, priceBaht: 0 },
  ]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?next=/organizer/new");
    }
  }, [user, loading, router]);

  function updateRow(index: number, patch: Partial<TicketTypeRow>) {
    setTicketTypes((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { data, error, response } = await api.POST("/api/events", {
        body: {
          title,
          venueName,
          description,
          startsAt: new Date(startsAt).toISOString(),
          ticketTypes: ticketTypes.map((row) => ({
            name: row.name,
            quantity: row.quantity,
            priceSatang: Math.round(row.priceBaht * 100),
          })),
        },
      });
      if (!response.ok || data === undefined) {
        toast.error(apiErrorMessage(error, "Could not create the event"));
        setBusy(false);
        return;
      }
      const created = data;
      toast.success("Event created as a draft");
      router.push(`/organizer/events/${created.id}`);
    } catch {
      toast.error("Could not create the event");
      setBusy(false);
    }
  }

  if (loading || !user) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Create an event</CardTitle>
          <CardDescription>
            It starts as a draft — publish it when the details are ready. Paid tickets arrive in a
            later milestone, so every ticket type is free for now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Event title</Label>
              <Input
                id="title"
                required
                minLength={3}
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="venueName">Venue</Label>
                <Input
                  id="venueName"
                  required
                  maxLength={160}
                  value={venueName}
                  onChange={(event) => setVenueName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="startsAt">Starts at</Label>
                <Input
                  id="startsAt"
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                rows={5}
                maxLength={5000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <Separator />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label>Ticket types</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={ticketTypes.length >= 10}
                  onClick={() =>
                    setTicketTypes((rows) => [
                      ...rows,
                      { name: "", quantity: 50, priceBaht: 0 },
                    ])
                  }
                >
                  Add type
                </Button>
              </div>
              {ticketTypes.map((row, index) => (
                <div key={index} className="flex items-end gap-3">
                  <div className="flex flex-1 flex-col gap-2">
                    <Label htmlFor={`type-name-${index}`} className="text-xs text-muted-foreground">
                      Name
                    </Label>
                    <Input
                      id={`type-name-${index}`}
                      required
                      maxLength={80}
                      value={row.name}
                      onChange={(event) => updateRow(index, { name: event.target.value })}
                    />
                  </div>
                  <div className="flex w-24 flex-col gap-2">
                    <Label
                      htmlFor={`type-quantity-${index}`}
                      className="text-xs text-muted-foreground"
                    >
                      Quantity
                    </Label>
                    <Input
                      id={`type-quantity-${index}`}
                      type="number"
                      required
                      min={1}
                      max={100000}
                      value={row.quantity}
                      onChange={(event) =>
                        updateRow(index, { quantity: Number(event.target.value) })
                      }
                    />
                  </div>
                  <div className="flex w-28 flex-col gap-2">
                    <Label
                      htmlFor={`type-price-${index}`}
                      className="text-xs text-muted-foreground"
                    >
                      Price (฿)
                    </Label>
                    <Input
                      id={`type-price-${index}`}
                      type="number"
                      required
                      min={0}
                      max={1000000}
                      step={0.25}
                      value={row.priceBaht}
                      onChange={(event) =>
                        updateRow(index, { priceBaht: Number(event.target.value) })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={ticketTypes.length === 1}
                    onClick={() =>
                      setTicketTypes((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create draft"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

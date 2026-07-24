"use client";

import type { EventDetail } from "@openseat/contracts";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api, apiErrorMessage } from "@/lib/api/client";
import { formatPrice } from "@/lib/format";

export function RsvpCard({ event }: { event: EventDetail }) {
  const { user } = useAuth();
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const totalSelected = useMemo(
    () => Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0),
    [quantities],
  );

  function adjust(typeId: string, delta: number, max: number) {
    setQuantities((current) => {
      const next = Math.max(0, Math.min(max, (current[typeId] ?? 0) + delta));
      return { ...current, [typeId]: next };
    });
  }

  async function claim(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const items = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    if (items.length === 0) {
      toast.error("Pick at least one ticket");
      return;
    }
    setBusy(true);
    try {
      const { data, error, response } = await api.POST("/api/events/{eventId}/orders", {
        params: {
          path: { eventId: event.id },
          header: { "idempotency-key": idempotencyKey.current },
        },
        body: {
          items,
          buyerEmail: user?.email ?? buyerEmail,
          buyerName: user?.displayName ?? buyerName,
        },
      });
      if (!response.ok || data === undefined) {
        idempotencyKey.current = crypto.randomUUID();
        if (response.status === 409) {
          toast.error(apiErrorMessage(error, "Sold out"));
          router.refresh();
        } else {
          toast.error(apiErrorMessage(error, "Could not claim tickets"));
        }
        return;
      }
      const order = data;
      if (order.status === "awaiting_payment" && order.payment?.checkoutUrl) {
        window.location.assign(order.payment.checkoutUrl);
        return;
      }
      toast.success("Tickets are yours — check your email");
      router.push(`/orders/${order.id}?token=${order.guestToken}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="sticky top-20">
      <CardHeader>
        <CardTitle className="text-lg">Get tickets</CardTitle>
        {event.ticketTypes.every((type) => type.priceSatang === 0) ? (
          <CardDescription>Free while payments are under construction.</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <form onSubmit={(formEvent) => void claim(formEvent)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {event.ticketTypes.map((type) => {
              const selected = quantities[type.id] ?? 0;
              const maxSelectable = Math.min(type.maxPerOrder, type.remaining);
              return (
                <div key={type.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{type.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {type.remaining === 0
                        ? "Sold out"
                        : `${formatPrice(type.priceSatang)} · ${type.remaining} left`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="size-11 sm:size-7"
                      disabled={selected === 0}
                      onClick={() => adjust(type.id, -1, maxSelectable)}
                      aria-label={`Remove one ${type.name}`}
                    >
                      −
                    </Button>
                    <span className="w-6 text-center tabular-nums">{selected}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="size-11 sm:size-7"
                      disabled={selected >= maxSelectable}
                      onClick={() => adjust(type.id, 1, maxSelectable)}
                      aria-label={`Add one ${type.name}`}
                    >
                      +
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <Separator />
          {user ? (
            <p className="text-sm text-muted-foreground">
              Tickets go to <span className="text-foreground">{user.email}</span>
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="buyerName">Your name</Label>
                <Input
                  id="buyerName"
                  required
                  maxLength={80}
                  value={buyerName}
                  onChange={(event) => setBuyerName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="buyerEmail">Email for your tickets</Label>
                <Input
                  id="buyerEmail"
                  type="email"
                  required
                  value={buyerEmail}
                  onChange={(event) => setBuyerEmail(event.target.value)}
                />
              </div>
            </div>
          )}
          <Button type="submit" disabled={busy || totalSelected === 0}>
            {busy
              ? "Claiming…"
              : totalSelected === 0
                ? "Pick your tickets"
                : `Claim ${totalSelected} ticket${totalSelected > 1 ? "s" : ""}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

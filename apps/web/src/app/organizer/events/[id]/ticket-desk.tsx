import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { ConsolePanel } from "@/components/console/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EventCard, TierStat } from "@/lib/api/dashboard";

export function TicketDesk({
  eventId,
  event,
  tiers,
  quantities,
  busy,
  onQuantityChange,
  onSaveQuantity,
  onPublish,
}: {
  eventId: string;
  event: EventCard;
  tiers: TierStat[];
  quantities: Record<string, number>;
  busy: boolean;
  onQuantityChange: (ticketTypeId: string, quantity: number) => void;
  onSaveQuantity: (ticketTypeId: string) => void;
  onPublish: () => void;
}) {
  return (
    <ConsolePanel label="Ticket desk">
      <div className="flex flex-col gap-4">
        {event.status === "draft" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-console-line bg-console-groove/40 px-3 py-2.5">
            <p className="text-sm text-muted-foreground">
              This event is a draft — publish it to open sales.
            </p>
            <Button size="sm" onClick={onPublish} disabled={busy}>
              {busy ? "Publishing…" : "Publish"}
            </Button>
          </div>
        ) : null}
        {tiers.map((tier) => (
          <div
            key={tier.id}
            className="flex flex-wrap items-end justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-medium">{tier.name}</p>
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {tier.issued} issued · {tier.remaining} remaining
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor={`quantity-${tier.id}`}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Capacity
                </Label>
                <Input
                  id={`quantity-${tier.id}`}
                  type="number"
                  min={tier.claimed}
                  max={100000}
                  className="w-28 font-mono tabular-nums"
                  value={quantities[tier.id] ?? tier.quantity}
                  onChange={(changeEvent) =>
                    onQuantityChange(tier.id, Number(changeEvent.target.value))
                  }
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={(quantities[tier.id] ?? tier.quantity) === tier.quantity}
                onClick={() => onSaveQuantity(tier.id)}
              >
                Save
              </Button>
            </div>
          </div>
        ))}
        {!event.seated ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-console-line bg-console-groove/40 px-3 py-2.5">
            <p className="text-sm text-muted-foreground">
              No seat map yet — design one with the drag-and-drop editor.
            </p>
            <Button
              size="sm"
              render={<Link href={`/organizer/events/${eventId}/seatmap`} />}
            >
              <LayoutGrid className="size-4" />
              Design seat map
            </Button>
          </div>
        ) : null}
      </div>
    </ConsolePanel>
  );
}

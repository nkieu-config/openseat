"use client";

import type { SeatMapData } from "@openseat/contracts";
import { Download, LayoutGrid, Receipt, ScanLine } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import {
  ConsoleEventMissing,
  ConsoleLoadFailed,
} from "@/components/console/gate-notice";
import { ConsolePanel, SignalLamp } from "@/components/console/panel";
import {
  OccupancyRig,
  RigLegend,
  SectionMeter,
} from "@/components/console/occupancy";
import { SalesSparkline } from "@/components/console/sparkline";
import { TelemetryStat } from "@/components/console/telemetry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiErrorMessage } from "@/lib/api/client";
import {
  downloadAttendeesCsv,
  fetchEventDashboard,
  fetchEventSummary,
  type EventDashboard,
} from "@/lib/api/dashboard";
import {
  formatBaht,
  formatDayLabel,
  formatEventDate,
  formatPercentBp,
  formatPrice,
} from "@/lib/format";
import { useConsoleGate } from "@/lib/use-console-gate";
import { TeamPanel } from "./team-panel";
export default function EventConsolePage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const dash = await fetchEventDashboard(eventId);
    let map: SeatMapData | null = null;
    if (dash.event.seated) {
      const { data } = await api.GET("/api/events/{eventId}/seat-map", {
        params: { path: { eventId } },
      });
      map = data ?? null;
    }
    return { dash, map };
  }, [eventId]);

  const sendStaffToTheDoor = useCallback(async () => {
    try {
      const summary = await fetchEventSummary(eventId);
      if (summary.myRole !== "staff") {
        return false;
      }
      router.replace(`/organizer/events/${eventId}/checkin`);
      return true;
    } catch {
      return false;
    }
  }, [eventId, router]);

  const gate = useConsoleGate(
    `/organizer/events/${eventId}`,
    load,
    sendStaffToTheDoor,
  );
  const state = gate.state;
  const dashboard: EventDashboard | null = gate.data?.dash ?? null;
  const seatMap = gate.data?.map ?? null;
  const [quantityEdits, setQuantityEdits] = useState<Record<string, number>>({});
  const quantities: Record<string, number> = Object.fromEntries(
    (dashboard?.tiers ?? []).map((tier) => [
      tier.id,
      quantityEdits[tier.id] ?? tier.quantity,
    ]),
  );

  async function publish() {
    setBusy(true);
    try {
      const { error, response } = await api.POST("/api/events/{id}/publish", {
        params: { path: { id: eventId } },
      });
      if (!response.ok) {
        toast.error(apiErrorMessage(error, "Could not publish"));
        return;
      }
      toast.success("Event published — share the public link");
      gate.reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Could not publish",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveQuantity(ticketTypeId: string) {
    const quantity = quantities[ticketTypeId];
    if (!quantity || quantity < 1) {
      toast.error("Quantity must be at least 1");
      return;
    }
    const { error, response } = await api.PATCH(
      "/api/events/{id}/ticket-types/{ticketTypeId}",
      {
        params: { path: { id: eventId, ticketTypeId } },
        body: { quantity },
      },
    );
    if (!response.ok) {
      toast.error(apiErrorMessage(error, "Could not update the quantity"));
      return;
    }
    toast.success("Quantity updated");
    gate.reload();
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadAttendeesCsv(
        eventId,
        `attendees-${dashboard?.event.slug ?? eventId}.csv`,
      );
    } catch {
      toast.error("Could not export attendees");
    } finally {
      setExporting(false);
    }
  }

  if (loading || state === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="font-mono text-sm text-muted-foreground">
          Powering up console…
        </p>
      </main>
    );
  }
  if (state === "error") {
    return <ConsoleLoadFailed onRetry={gate.reload} />;
  }
  if (state !== "ready" || !dashboard) {
    return <ConsoleEventMissing />;
  }

  const { event, totals, timeline, tiers, sections } = dashboard;
  const salesPoints = timeline.map((bucket) => bucket.ticketsSold);
  const windowStart = timeline[0]?.day;
  const windowEnd = timeline[timeline.length - 1]?.day;
  const windowSold = timeline.reduce(
    (sum, bucket) => sum + bucket.ticketsSold,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:py-10">
      <div className="flex flex-col gap-6">
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
              onClick={() => void exportCsv()}
              disabled={exporting || totals.ticketsSold === 0}
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

        <ConsolePanel
          label="Master bus"
          right={
            <SignalLamp
              tone={totals.liveHolds > 0 ? "live" : "idle"}
              label={totals.liveHolds > 0 ? "holds live" : "idle"}
            />
          }
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            <TelemetryStat label="Gross" value={formatBaht(totals.grossSatang)} />
            <TelemetryStat
              label="Tickets sold"
              value={totals.ticketsSold}
              hint={`of ${totals.capacity}`}
            />
            <TelemetryStat
              label="Sell-through"
              value={formatPercentBp(totals.sellThroughBp)}
            />
            <TelemetryStat label="Paid orders" value={totals.paidOrders} />
            <TelemetryStat
              label="Live holds"
              value={totals.liveHolds}
              hint={totals.pendingOrders > 0 ? `${totals.pendingOrders} pending` : undefined}
            />
            <TelemetryStat
              label="Checked in"
              value={totals.ticketsCheckedIn}
              hint={`of ${totals.ticketsSold}`}
            />
          </div>
        </ConsolePanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <ConsolePanel
            label="Sales channel"
            right={
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {windowSold} in window
              </span>
            }
          >
            <SalesSparkline points={salesPoints} />
            <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span>{windowStart ? formatDayLabel(windowStart) : ""}</span>
              <span>tickets / day</span>
              <span>{windowEnd ? formatDayLabel(windowEnd) : ""}</span>
            </div>
          </ConsolePanel>

          <ConsolePanel label="Tier faders">
            <div className="flex flex-col gap-4">
              {tiers.map((tier) => {
                const ratio =
                  tier.quantity > 0 ? (tier.sold / tier.quantity) * 100 : 0;
                return (
                  <div key={tier.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{tier.name}</span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {tier.kind}
                        </span>
                      </div>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatPrice(tier.priceSatang)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-console-groove">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                    <div className="flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
                      <span>
                        {tier.sold}/{tier.quantity} sold
                      </span>
                      <span>{formatBaht(tier.grossSatang)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ConsolePanel>
        </div>

        {event.seated && seatMap ? (
          <ConsolePanel label="Occupancy rig" right={<RigLegend />}>
            <div className="flex flex-col gap-5">
              <div className="overflow-x-auto">
                <div className="mx-auto max-w-2xl">
                  <OccupancyRig
                    seats={seatMap.seats}
                    maxCols={seatMap.meta.maxCols}
                    totalRows={seatMap.meta.totalRows}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {sections.map((section) => (
                  <SectionMeter key={section.name} {...section} />
                ))}
              </div>
            </div>
          </ConsolePanel>
        ) : null}

        <ConsolePanel label="Ticket desk">
          <div className="flex flex-col gap-4">
            {event.status === "draft" ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-console-line bg-console-groove/40 px-3 py-2.5">
                <p className="text-sm text-muted-foreground">
                  This event is a draft — publish it to open sales.
                </p>
                <Button size="sm" onClick={() => void publish()} disabled={busy}>
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
                    {tier.sold} issued · {tier.remaining} remaining
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
                      min={tier.sold}
                      max={100000}
                      className="w-28 font-mono tabular-nums"
                      value={quantities[tier.id] ?? tier.quantity}
                      onChange={(changeEvent) =>
                        setQuantityEdits((current) => ({
                          ...current,
                          [tier.id]: Number(changeEvent.target.value),
                        }))
                      }
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(quantities[tier.id] ?? tier.quantity) === tier.quantity}
                    onClick={() => void saveQuantity(tier.id)}
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

        {event.myRole === "owner" ? <TeamPanel eventId={eventId} /> : null}
      </div>
    </main>
  );
}

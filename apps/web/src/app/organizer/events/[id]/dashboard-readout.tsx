import type { SeatMapData } from "@openseat/contracts";
import {
  OccupancyRig,
  RigLegend,
  SectionMeter,
} from "@/components/console/occupancy";
import { ConsolePanel, SignalLamp } from "@/components/console/panel";
import { SalesSparkline } from "@/components/console/sparkline";
import { TelemetryStat } from "@/components/console/telemetry";
import type { EventDashboard } from "@/lib/api/dashboard";
import {
  formatBaht,
  formatDayLabel,
  formatPercentBp,
  formatPrice,
} from "@/lib/format";

export function DashboardReadout({
  dashboard,
  seatMap,
}: {
  dashboard: EventDashboard;
  seatMap: SeatMapData | null;
}) {
  const { event, totals, timeline, tiers, sections } = dashboard;
  const salesPoints = timeline.map((bucket) => bucket.ticketsSold);
  const windowStart = timeline[0]?.day;
  const windowEnd = timeline[timeline.length - 1]?.day;
  const windowSold = timeline.reduce(
    (sum, bucket) => sum + bucket.ticketsSold,
    0,
  );

  return (
    <>
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
    </>
  );
}

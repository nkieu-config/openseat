import type { SeatInfo } from "@openseat/contracts";
import { cn } from "@/lib/utils";

export function SectionMeter({
  name,
  sold,
  held,
  available,
  capacity,
}: {
  name: string;
  sold: number;
  held: number;
  available: number;
  capacity: number;
}) {
  const pct = (value: number) => (capacity > 0 ? (value / capacity) * 100 : 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em]">
        <span className="text-muted-foreground">{name}</span>
        <span className="tabular-nums text-foreground">
          {sold}
          <span className="text-muted-foreground">/{capacity}</span>
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-console-groove">
        <div className="bg-primary" style={{ width: `${pct(sold)}%` }} />
        <div className="bg-seat-held" style={{ width: `${pct(held)}%` }} />
      </div>
      <div className="flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
        <span>{available} open</span>
        <span>{held} held</span>
      </div>
    </div>
  );
}

const RIG_CELL = 13;
const RIG_GAP = 3;
const RIG_PAD = 6;

export function OccupancyRig({
  seats,
  maxCols,
  totalRows,
  className,
}: {
  seats: SeatInfo[];
  maxCols: number;
  totalRows: number;
  className?: string;
}) {
  const width = RIG_PAD * 2 + maxCols * (RIG_CELL + RIG_GAP);
  const height = RIG_PAD * 2 + (totalRows + 1) * (RIG_CELL + RIG_GAP);
  const fill = (status: string) =>
    status === "sold"
      ? "var(--primary)"
      : status === "held"
        ? "var(--seat-held)"
        : "var(--console-groove)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      className={cn("h-auto", className)}
      role="img"
      aria-label="Seat occupancy map"
    >
      {seats.map((seat) => (
        <rect
          key={seat.id}
          x={RIG_PAD + seat.x * (RIG_CELL + RIG_GAP)}
          y={RIG_PAD + seat.y * (RIG_CELL + RIG_GAP)}
          width={RIG_CELL}
          height={RIG_CELL}
          rx={2.5}
          fill={fill(seat.status)}
          stroke="var(--console-line)"
          strokeWidth={1}
        >
          <title>{`${seat.section} ${seat.rowLabel}${seat.number} · ${seat.status}`}</title>
        </rect>
      ))}
    </svg>
  );
}

export function RigLegend() {
  const items = [
    { label: "Sold", swatch: "bg-primary" },
    { label: "Held", swatch: "bg-seat-held" },
    { label: "Open", swatch: "bg-console-groove border border-console-line" },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-[3px]", item.swatch)} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

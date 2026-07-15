const ROWS = 6;
const COLS = 12;
const SEAT = 26;
const GAP = 10;
const LEFT = 34;
const TOP = 64;

type SeatState = "available" | "selected" | "held" | "sold";

function seatState(row: number, col: number): SeatState {
  if (row === 2 && col >= 5 && col <= 7) {
    return "selected";
  }
  const sold = new Set(["0:2", "0:3", "0:8", "1:5", "1:6", "0:5", "0:6", "1:2", "3:9", "4:1"]);
  if (sold.has(`${row}:${col}`)) {
    return "sold";
  }
  const held = new Set(["1:8", "2:3", "3:4", "4:7", "2:9"]);
  if (held.has(`${row}:${col}`)) {
    return "held";
  }
  return "available";
}

const seatFill: Record<SeatState, string> = {
  available: "fill-seat-available",
  selected: "fill-seat-selected",
  held: "fill-seat-held",
  sold: "fill-seat-sold",
};

const legend: { state: SeatState; label: string }[] = [
  { state: "available", label: "Available" },
  { state: "held", label: "Held by someone" },
  { state: "selected", label: "Yours" },
  { state: "sold", label: "Sold" },
];

export function SeatMapTeaser() {
  const width = LEFT * 2 + COLS * SEAT + (COLS - 1) * GAP;
  const height = TOP + ROWS * SEAT + (ROWS - 1) * GAP + 24;

  return (
    <figure className="flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-5 sm:p-6">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Preview of a live seat map: most seats available, a few held by others, three selected as yours"
        className="w-full"
      >
        <path
          d={`M ${LEFT + 10} 40 Q ${width / 2} 6 ${width - LEFT - 10} 40`}
          fill="none"
          stroke="var(--seat-selected)"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.7"
        />
        <text
          x={width / 2}
          y={26}
          textAnchor="middle"
          className="fill-muted-foreground font-mono"
          fontSize="9"
          letterSpacing="3"
        >
          STAGE
        </text>
        {Array.from({ length: ROWS }, (_, row) =>
          Array.from({ length: COLS }, (_, col) => {
            const state = seatState(row, col);
            const x = LEFT + col * (SEAT + GAP);
            const y = TOP + row * (SEAT + GAP);
            return (
              <rect
                key={`${row}-${col}`}
                x={x}
                y={y}
                width={SEAT}
                height={SEAT}
                rx="7"
                className={seatFill[state]}
                style={
                  state === "selected"
                    ? { filter: "drop-shadow(0 0 7px var(--seat-selected))" }
                    : undefined
                }
              />
            );
          }),
        )}
      </svg>
      <figcaption className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {legend.map((item) => (
          <span key={item.state} className="flex items-center gap-2 text-xs text-muted-foreground">
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
              <rect width="12" height="12" rx="3.5" className={seatFill[item.state]} />
            </svg>
            {item.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

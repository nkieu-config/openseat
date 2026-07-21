import type { SeatInfo } from '@openseat/contracts';
import { CELL } from '@/lib/seat-map-viewport';

export const seatFill: Record<string, string> = {
  available: 'fill-seat-available',
  held: 'fill-seat-held',
  sold: 'fill-seat-sold',
  mine: 'fill-seat-selected',
};

export function seatLabel(seat: SeatInfo): string {
  return `${seat.section} ${seat.rowLabel}${seat.number}`;
}

export function Seat({
  seat,
  x,
  y,
  onToggle,
}: {
  seat: SeatInfo;
  x: number;
  y: number;
  onToggle: (seat: SeatInfo) => void;
}) {
  const fill = seat.mine ? seatFill.mine : seatFill[seat.status];
  const description = `${seatLabel(seat)} — ${seat.mine ? 'yours' : seat.status}`;

  return (
    <g>
      {seat.number === 1 ? (
        <text
          x={x - 12}
          y={y + CELL / 2}
          textAnchor="end"
          dominantBaseline="central"
          className="fill-muted-foreground font-mono"
          fontSize="10"
        >
          {seat.rowLabel}
        </text>
      ) : null}
      <rect
        x={x}
        y={y}
        width={CELL}
        height={CELL}
        rx="8"
        className={`${fill} outline-none transition-opacity ${
          seat.status === 'sold'
            ? 'cursor-not-allowed stroke-foreground/40 [stroke-width:2px]'
            : 'cursor-pointer hover:opacity-80 focus-visible:stroke-ring focus-visible:[stroke-width:2.5px]'
        }`}
        style={seat.mine ? { filter: 'drop-shadow(0 0 7px var(--seat-selected))' } : undefined}
        role="button"
        tabIndex={seat.status === 'sold' ? -1 : 0}
        aria-label={description}
        onClick={() => onToggle(seat)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle(seat);
          }
        }}
      >
        <title>{description}</title>
      </rect>
    </g>
  );
}

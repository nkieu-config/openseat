import { cn } from "@/lib/utils";

export function SalesSparkline({
  points,
  height = 76,
  className,
}: {
  points: number[];
  height?: number;
  className?: string;
}) {
  const width = 240;
  const padY = 6;
  const max = Math.max(1, ...points);
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const toY = (value: number) =>
    height - padY - (value / max) * (height - padY * 2);
  const coords = points.map(
    (value, index) => [index * stepX, toY(value)] as const,
  );
  const line = coords
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const area = coords.length
    ? `${line} L${((coords.length - 1) * stepX).toFixed(1)} ${height} L0 ${height} Z`
    : "";
  const gridLines = [0.25, 0.5, 0.75].map(
    (fraction) => padY + fraction * (height - padY * 2),
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={cn("block", className)}
      role="img"
      aria-label="Daily tickets sold"
    >
      {gridLines.map((y) => (
        <line
          key={y}
          x1={0}
          x2={width}
          y1={y}
          y2={y}
          stroke="var(--console-line)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {area ? <path d={area} fill="var(--primary)" fillOpacity={0.14} /> : null}
      {line ? (
        <path
          d={line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

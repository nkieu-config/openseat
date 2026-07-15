import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TelemetryStat({
  label,
  value,
  unit,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </span>
        {unit ? (
          <span className="font-mono text-xs text-muted-foreground">{unit}</span>
        ) : null}
      </div>
      {hint ? (
        <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

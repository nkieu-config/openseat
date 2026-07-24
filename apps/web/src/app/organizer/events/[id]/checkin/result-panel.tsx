import { ConsolePanel } from "@/components/console/panel";
import type { ScanResult } from "@/lib/use-door-scanner";
import { cn } from "@/lib/utils";

export function ResultPanel({ result }: { result: ScanResult | null }) {
  if (!result) {
    return (
      <ConsolePanel label="Last scan">
        <p className="py-6 text-center font-mono text-xs text-muted-foreground">
          Awaiting a ticket…
        </p>
      </ConsolePanel>
    );
  }
  const toneRing =
    result.tone === "ok"
      ? "border-signal-live/60"
      : result.tone === "warn"
        ? "border-signal-warn/60"
        : "border-destructive/60";
  const toneText =
    result.tone === "ok"
      ? "text-signal-live"
      : result.tone === "warn"
        ? "text-signal-warn"
        : "text-destructive";
  return (
    <ConsolePanel label="Last scan" className={cn("border-2", toneRing)}>
      <div className="flex flex-col gap-2">
        <span
          className={cn(
            "font-mono text-lg font-semibold uppercase tracking-[0.14em]",
            toneText,
          )}
        >
          {result.heading}
        </span>
        {"detail" in result ? (
          <div className="flex flex-col gap-0.5">
            <p className="text-xl font-semibold">{result.detail.attendeeName}</p>
            <p className="text-sm text-muted-foreground">
              {result.detail.seat
                ? `${result.detail.seat} · ${result.detail.ticketType}`
                : result.detail.ticketType}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{result.message}</p>
        )}
      </div>
    </ConsolePanel>
  );
}

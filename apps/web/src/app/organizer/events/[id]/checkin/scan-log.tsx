import { ConsolePanel } from "@/components/console/panel";
import type { FeedEntry } from "@/lib/use-door-scanner";
import { cn } from "@/lib/utils";

export function ScanLog({ feed }: { feed: FeedEntry[] }) {
  return (
    <ConsolePanel
      label="Scan log"
      right={
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {feed.length}
        </span>
      }
    >
      {feed.length === 0 ? (
        <p className="py-6 text-center font-mono text-xs text-muted-foreground">
          No scans yet — check in the first ticket.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-console-line">
          {feed.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  entry.tone === "ok" && "bg-signal-live",
                  entry.tone === "warn" && "bg-signal-warn",
                  entry.tone === "err" && "bg-destructive",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{entry.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.detail}
                </p>
              </div>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {entry.time}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ConsolePanel>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ConsolePanel({
  label,
  right,
  className,
  bodyClassName,
  children,
}: {
  label: string;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-md border border-console-line bg-console-panel",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-console-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-1 rounded-full bg-primary" />
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </h2>
        </div>
        {right}
      </header>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function SignalLamp({
  tone = "idle",
  label,
}: {
  tone?: "live" | "warn" | "idle";
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      <span
        className={cn(
          "size-2 rounded-full",
          tone === "live" && "animate-pulse bg-signal-live",
          tone === "warn" && "bg-signal-warn",
          tone === "idle" && "bg-muted-foreground/40",
        )}
      />
      {label}
    </span>
  );
}

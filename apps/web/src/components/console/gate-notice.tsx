"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConsoleNotice({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="text-lg font-medium">{title}</p>
      {detail ? (
        <p className="text-sm text-muted-foreground">{detail}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </main>
  );
}

export function ConsoleLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <ConsoleNotice
      title="Could not reach the console"
      detail="The request failed before any data came back. This is not an empty event — try again."
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="size-3.5" />
          Retry
        </Button>
      }
    />
  );
}

export function ConsoleEventMissing() {
  return <ConsoleNotice title="Event not found." />;
}

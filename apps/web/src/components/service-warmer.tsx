"use client";

import { useEffect } from "react";

export function ServiceWarmer({ origins }: { origins: string[] }) {
  const targets = origins.join(" ");

  useEffect(() => {
    if (!targets) {
      return;
    }
    for (const origin of targets.split(" ")) {
      void fetch(`${origin}/health`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
    }
  }, [targets]);

  return null;
}

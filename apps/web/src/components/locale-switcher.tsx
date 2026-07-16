"use client";

import { Languages } from "lucide-react";
import {
  type Locale,
  localeNames,
  locales,
  persistLocale,
} from "@/i18n/config";
import { useLocale } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export function LocaleSwitcher() {
  const locale = useLocale();

  function setLocale(next: Locale) {
    persistLocale(next);
    window.location.reload();
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Languages className="size-3.5" aria-hidden />
      {locales.map((option, index) => (
        <span key={option} className="inline-flex items-center gap-1.5">
          {index > 0 ? <span className="text-border">·</span> : null}
          <button
            type="button"
            onClick={() => setLocale(option)}
            aria-current={option === locale ? "true" : undefined}
            className={cn(
              "-my-1 rounded px-1.5 py-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              option === locale && "font-medium text-foreground",
            )}
          >
            {localeNames[option]}
          </button>
        </span>
      ))}
    </div>
  );
}

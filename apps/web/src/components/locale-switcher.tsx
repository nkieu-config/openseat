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
            className={cn(
              "transition-colors hover:text-foreground",
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

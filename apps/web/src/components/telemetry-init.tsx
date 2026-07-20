"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __faroInitialized?: boolean;
  }
}

const faroUrl = process.env.NEXT_PUBLIC_FARO_URL;

const SENSITIVE_PARAMS = ["token"];

export function scrubUrl(value: string): string {
  const cut = value.indexOf("?");
  if (cut === -1) {
    return value;
  }
  const [base, query] = [value.slice(0, cut), value.slice(cut + 1)];
  const params = new URLSearchParams(query);
  let touched = false;
  for (const name of SENSITIVE_PARAMS) {
    if (params.has(name)) {
      params.set(name, "redacted");
      touched = true;
    }
  }
  if (!touched) {
    return value;
  }
  const rest = params.toString();
  return rest ? `${base}?${rest}` : base;
}

export function TelemetryInit() {
  useEffect(() => {
    if (!faroUrl || window.__faroInitialized) {
      return;
    }
    window.__faroInitialized = true;
    void Promise.all([
      import("@grafana/faro-web-sdk"),
      import("@grafana/faro-web-tracing"),
    ]).then(([sdk, tracing]) => {
      sdk.initializeFaro({
        url: faroUrl,
        app: { name: "openseat-web" },
        beforeSend: (item) => {
          const meta = item.meta as { page?: { url?: string } } | undefined;
          if (meta?.page?.url) {
            meta.page.url = scrubUrl(meta.page.url);
          }
          return item;
        },
        instrumentations: [
          ...sdk.getWebInstrumentations(),
          new tracing.TracingInstrumentation({
            instrumentationOptions: {
              propagateTraceHeaderCorsUrls: [/.*/],
            },
          }),
        ],
      });
    });
  }, []);
  return null;
}

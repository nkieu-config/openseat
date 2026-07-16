"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __faroInitialized?: boolean;
  }
}

const faroUrl = process.env.NEXT_PUBLIC_FARO_URL;

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

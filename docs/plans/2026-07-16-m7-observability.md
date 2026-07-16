# M7 — Observability Implementation Plan

> **For agentic workers:** execute task-by-task in order; steps use checkbox (`- [ ]`) syntax for tracking. Every task ends green and committed before the next starts.

**Goal:** Instrument OpenSeat with OpenTelemetry (traces + logs + metrics + browser errors) exporting directly to Grafana Cloud free tier, plus one dashboard, one alert, a runbook, and ADR 0009 — per `docs/specs/2026-07-16-m7-observability-design.md`.

**Architecture:** Each service exports OTLP directly (no collector at $0). API gets deep instrumentation (auto-instrumented traces, pino logs with trace correlation, domain counters); Gate gets traceparent extraction + queue metrics so one browser-rooted trace spans Node and Go; web gets lazy-loaded Faro (errors, Web Vitals, fetch tracing). Everything is off unless its env var is set.

**Tech Stack:** `@opentelemetry/sdk-node` + auto-instrumentations, `nestjs-pino`, `@opentelemetry/api` metrics, `go.opentelemetry.io/otel` + `otelhttp`, `@grafana/faro-web-sdk` + `@grafana/faro-web-tracing`, Grafana Cloud (Tempo/Loki/Mimir/Faro).

## Global Constraints

- No code comments in any snippet or file (repo rule; reasoning goes in ADR 0009).
- Conventional Commits, English, no AI attribution.
- Telemetry fully off when `OTEL_EXPORTER_OTLP_ENDPOINT` (api/gate) or `NEXT_PUBLIC_FARO_URL` (web) is unset — dev, CI, and all existing e2e (41) must stay green untouched.
- $0: Grafana Cloud free tier only; no collector; PayMock is not instrumented.
- Milestone ends deployable: `APP_VERSION` → `m7`, full quality gate green.
- After any controller/DTO change run `openapi:dump` + contracts build (none expected in M7).

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `apps/api/src/telemetry/tracing.ts` | env-gated NodeSDK bootstrap (side-effect import) |
| Create | `apps/api/src/telemetry/tracing.spec.ts` | proves gating |
| Create | `apps/api/src/telemetry/metrics.ts` | domain counters (no-op without SDK) |
| Create | `apps/api/src/telemetry/telemetry-exception.filter.ts` | 5xx → span error status |
| Modify | `apps/api/src/main.ts` | first-line tracing import, pino logger, filter |
| Modify | `apps/api/src/app.module.ts` | `LoggerModule.forRoot`, `APP_FILTER` |
| Modify | `apps/api/src/holds/holds.service.ts`, `payments/payments.service.ts`, `checkin/checkin.service.ts`, `admission/admission.guard.ts` | counter increments |
| Create | `services/gate/telemetry.go` | env-gated tracer/meter providers + propagator |
| Modify | `services/gate/main.go` | otelhttp wrap, sse gauge, CORS `traceparent` |
| Modify | `services/gate/queue.go`, `services/gate/admitter.go` | join/admit counters, depth gauge |
| Create | `apps/web/src/components/telemetry-init.tsx` | lazy Faro init |
| Modify | `apps/web/src/app/layout.tsx` | mount `TelemetryInit` |
| Modify | `apps/api/.env.example`, `apps/web/.env.example`, `render.yaml` | env wiring |
| Create | `docs/observability/openseat-ops-dashboard.json`, `docs/observability/alert-rule.md` | exported Grafana artifacts |
| Create | `docs/runbook.md`, `docs/adr/0009-observability-otel-grafana-cloud.md` | operations + decision record |

---

### Task 1: API telemetry bootstrap (env-gated NodeSDK)

**Files:**
- Create: `apps/api/src/telemetry/tracing.ts`, `apps/api/src/telemetry/tracing.spec.ts`
- Modify: `apps/api/src/main.ts` (line 1)

**Interfaces:**
- Produces: `startTelemetry(): NodeSDK | null` — returns `null` when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset; the module also self-invokes on import so `main.ts` only needs `import './telemetry/tracing';` as its first line (CJS require order guarantees it patches before Express/pg load).

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter api add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-proto @opentelemetry/exporter-metrics-otlp-proto @opentelemetry/exporter-logs-otlp-proto @opentelemetry/sdk-metrics @opentelemetry/sdk-logs @opentelemetry/api
```

- [ ] **Step 2: Write the failing test**

`apps/api/src/telemetry/tracing.spec.ts`:

```ts
import { startTelemetry } from './tracing';

describe('startTelemetry', () => {
  it('returns null when OTEL_EXPORTER_OTLP_ENDPOINT is unset', () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    expect(startTelemetry()).toBeNull();
  });
});
```

Run: `pnpm --filter api test -- --testPathPattern tracing` → FAIL (module not found).

- [ ] **Step 3: Implement**

`apps/api/src/telemetry/tracing.ts`:

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';

export function startTelemetry(): NodeSDK | null {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return null;
  }
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'openseat-api',
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
    }),
    logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => {
    void sdk.shutdown();
  });
  return sdk;
}

startTelemetry();
```

`apps/api/src/main.ts` — add as the very first line, above all other imports:

```ts
import './telemetry/tracing';
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter api test -- --testPathPattern tracing` → PASS.
Run: `pnpm --filter api typecheck && pnpm --filter api build` → clean.
Run: `pnpm --filter api test:e2e` → 41 passed (telemetry stayed off).

Note: if the spec self-invocation double-starts under jest, guard with a module-level `let started = false` inside `startTelemetry`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/telemetry apps/api/src/main.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): boot an env-gated OpenTelemetry SDK before Nest"
```

---

### Task 2: Structured logs with trace correlation (nestjs-pino)

**Files:**
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`

**Interfaces:**
- Produces: Nest logging flows through pino; when the SDK is on, `@opentelemetry/instrumentation-pino` (bundled in auto-instrumentations) injects `trace_id`/`span_id` and bridges records to the OTLP logs pipe.

- [ ] **Step 1: Install**

```bash
pnpm --filter api add nestjs-pino pino-http pino
pnpm --filter api add -D pino-pretty
```

- [ ] **Step 2: Register the logger module**

In `apps/api/src/app.module.ts` imports array (alongside `ConfigModule.forRoot`):

```ts
import { LoggerModule } from 'nestjs-pino';
```

```ts
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        autoLogging: {
          ignore: (req) => req.url === '/api/health',
        },
      },
    }),
```

- [ ] **Step 3: Use it in main.ts**

```ts
import { Logger as PinoLogger } from 'nestjs-pino';
```

Change the create call and add `useLogger` immediately after:

```ts
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter api typecheck` → clean.
Boot locally (`pnpm --filter api start:dev`), hit `curl localhost:4000/api/health` → pretty single-line request logs appear, health line absent; existing Nest boot logs render through pino.
Run: `pnpm --filter api test:e2e` → 41 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/main.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): route Nest logging through pino with request logs"
```

---

### Task 3: Domain metrics (five counters at the invariant sites)

**Files:**
- Create: `apps/api/src/telemetry/metrics.ts`
- Modify: `apps/api/src/holds/holds.service.ts`, `apps/api/src/payments/payments.service.ts`, `apps/api/src/checkin/checkin.service.ts`, `apps/api/src/admission/admission.guard.ts`

**Interfaces:**
- Produces: named `Counter` exports; all are safe no-ops when the SDK is off (`@opentelemetry/api` returns a no-op meter):

```ts
import {
  holdsAcquired,
  ordersPaid,
  ticketsCheckedIn,
  admissionsVerified,
  webhookEvents,
} from '../telemetry/metrics';
```

- [ ] **Step 1: Create the meter module**

`apps/api/src/telemetry/metrics.ts`:

```ts
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('openseat-api');

export const holdsAcquired = meter.createCounter('holds_acquired_total');
export const ordersPaid = meter.createCounter('orders_paid_total');
export const ticketsCheckedIn = meter.createCounter(
  'tickets_checked_in_total',
);
export const admissionsVerified = meter.createCounter(
  'admissions_verified_total',
);
export const webhookEvents = meter.createCounter('webhook_events_total');
```

- [ ] **Step 2: Increment at the five sites**

Each addition is one line at an existing branch (locate by the described behavior):

- `holds.service.ts` — where a hold insert wins: `holdsAcquired.add(1, { result: 'won' });` · where the conflict/409 path returns: `holdsAcquired.add(1, { result: 'conflict' });`
- `payments.service.ts` — where a webhook marks the order paid (success transaction commits): `ordersPaid.add(1);` · processed webhook: `webhookEvents.add(1, { outcome: 'processed' });` · dedup short-circuit: `webhookEvents.add(1, { outcome: 'duplicate' });` · signature rejection: `webhookEvents.add(1, { outcome: 'invalid' });`
- `checkin.service.ts` — `updateMany` count 1: `ticketsCheckedIn.add(1, { result: 'admitted' });` · count 0 (already checked in): `ticketsCheckedIn.add(1, { result: 'duplicate' });`
- `admission.guard.ts` — valid token accepted: `admissionsVerified.add(1, { result: 'valid' });` · before the `ForbiddenException`: `admissionsVerified.add(1, { result: 'rejected' });`

- [ ] **Step 3: Verify**

Run: `pnpm --filter api lint && pnpm --filter api typecheck` → clean.
Run: `pnpm --filter api test:e2e` → 41 passed (no-op counters change nothing).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/telemetry/metrics.ts apps/api/src/holds apps/api/src/payments apps/api/src/checkin apps/api/src/admission
git commit -m "feat(api): count holds, payments, check-ins, and admissions as domain metrics"
```

---

### Task 4: 5xx responses mark the active span as errored

**Files:**
- Create: `apps/api/src/telemetry/telemetry-exception.filter.ts`
- Modify: `apps/api/src/app.module.ts` (providers)

- [ ] **Step 1: Implement the filter**

```ts
import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { SpanStatusCode, trace } from '@opentelemetry/api';

@Catch()
export class TelemetryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500) {
      const span = trace.getActiveSpan();
      if (span) {
        if (exception instanceof Error) {
          span.recordException(exception);
        }
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
    }
    super.catch(exception, host);
  }
}
```

- [ ] **Step 2: Register as APP_FILTER**

In `app.module.ts` providers (next to the existing `APP_GUARD`):

```ts
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { TelemetryExceptionFilter } from './telemetry/telemetry-exception.filter';
```

```ts
  providers: [
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
    { provide: APP_FILTER, useClass: TelemetryExceptionFilter },
  ],
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm --filter api typecheck && pnpm --filter api test:e2e` → clean, 41 passed (4xx behavior unchanged — filter delegates to the base).

```bash
git add apps/api/src/telemetry/telemetry-exception.filter.ts apps/api/src/app.module.ts
git commit -m "feat(api): record 5xx exceptions on the active span"
```

---

### Task 5: Gate — traces across Node→Go and queue metrics

**Files:**
- Create: `services/gate/telemetry.go`
- Modify: `services/gate/main.go`, `services/gate/queue.go`

**Interfaces:**
- Produces: `setupTelemetry(ctx) (shutdown func(context.Context) error)` — no-op when env unset; global otel propagator set to W3C TraceContext so `otelhttp` extracts `traceparent`; package-level instruments `joinsTotal`, `admittedTotal`, `sseConnections`, and a `gate_queue_depth` observable gauge fed by ZCard over the event ids seen since boot.

- [ ] **Step 1: Add dependencies**

```bash
cd services/gate
go get go.opentelemetry.io/otel go.opentelemetry.io/otel/sdk go.opentelemetry.io/otel/sdk/metric go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp
go mod tidy
```

- [ ] **Step 2: telemetry.go**

```go
package main

import (
	"context"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

func setupTelemetry(ctx context.Context) func(context.Context) error {
	if os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") == "" {
		return func(context.Context) error { return nil }
	}
	res, err := resource.New(ctx,
		resource.WithAttributes(semconv.ServiceName(getenv("OTEL_SERVICE_NAME", "openseat-gate"))),
	)
	if err != nil {
		return func(context.Context) error { return nil }
	}
	traceExp, err := otlptracehttp.New(ctx)
	if err != nil {
		return func(context.Context) error { return nil }
	}
	metricExp, err := otlpmetrichttp.New(ctx)
	if err != nil {
		return func(context.Context) error { return nil }
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExp),
		sdktrace.WithResource(res),
	)
	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExp)),
		sdkmetric.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	otel.SetMeterProvider(mp)
	otel.SetTextMapPropagator(propagation.TraceContext{})
	return func(shutdownCtx context.Context) error {
		if err := tp.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return mp.Shutdown(shutdownCtx)
	}
}
```

(Reuse the existing `getenv(key, fallback)` helper if `main.go` has one; otherwise add it here.)

- [ ] **Step 3: Wire main.go**

In `main()` before the server starts:

```go
	shutdownTelemetry := setupTelemetry(ctx)
	defer func() { _ = shutdownTelemetry(context.Background()) }()
```

Wrap the mux where the server is constructed:

```go
	handler := otelhttp.NewHandler(withCORS(mux), "gate")
```

(adapt to the existing wrapping order — CORS stays outermost if it currently is). Add `traceparent` to the CORS allowed headers list next to the existing ones.

- [ ] **Step 4: Metrics in queue.go**

Package-level instruments plus one registration for depth:

```go
var (
	meter          = otel.Meter("gate")
	joinsTotal, _  = meter.Int64Counter("gate_joins_total")
	admittedTotal, _ = meter.Int64Counter("gate_admitted_total")
	sseConnections, _ = meter.Int64UpDownCounter("gate_sse_connections")
	seenEvents      sync.Map
)
```

- In `Join`: `seenEvents.Store(eventID, struct{}{})` and `joinsTotal.Add(ctx, 1)`.
- In the admitter where entrants pop: `admittedTotal.Add(ctx, int64(len(popped)))`.
- In the SSE handler: `sseConnections.Add(r.Context(), 1)` on connect, `defer sseConnections.Add(context.Background(), -1)`.
- Register once in `main()` after telemetry setup:

```go
	depth, _ := otel.Meter("gate").Int64ObservableGauge("gate_queue_depth")
	_, _ = otel.Meter("gate").RegisterCallback(func(ctx context.Context, o metric.Observer) error {
		seenEvents.Range(func(key, _ any) bool {
			eventID := key.(string)
			if n, err := rdb.ZCard(ctx, queueKey(eventID)).Result(); err == nil {
				o.ObserveInt64(depth, n, metric.WithAttributes(attribute.String("event_id", eventID)))
			}
			return true
		})
		return nil
	}, depth)
```

(match `rdb`/`queueKey` to the actual identifiers in `queue.go`).

- [ ] **Step 5: Verify + commit**

Run: `go vet ./... && go test ./...` (in `services/gate`) → all existing tests pass (miniredis tests run with telemetry off).

```bash
git add services/gate
git commit -m "feat(gate): propagate traceparent and report queue metrics over OTLP"
```

---

### Task 6: Web — lazy Faro (errors, vitals, fetch traces)

**Files:**
- Create: `apps/web/src/components/telemetry-init.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Install**

```bash
pnpm --filter web add @grafana/faro-web-sdk @grafana/faro-web-tracing
```

- [ ] **Step 2: Component (dynamic import keeps it out of the base bundle)**

```tsx
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
```

- [ ] **Step 3: Mount in layout**

In `apps/web/src/app/layout.tsx`, render `<TelemetryInit />` just inside the providers (next to where global components like the toaster live).

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter web lint && pnpm --filter web build && pnpm --filter web typecheck` → clean. Boot dev without the env → network tab shows no Faro requests.

```bash
git add apps/web/src/components/telemetry-init.tsx apps/web/src/app/layout.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): report browser errors, vitals, and fetch traces via Faro"
```

---

### Task 7: Env + deploy wiring

**Files:**
- Modify: `apps/api/.env.example`, `apps/web/.env.example`, `render.yaml`

- [ ] **Step 1: Env examples**

Append to `apps/api/.env.example`:

```
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_EXPORTER_OTLP_HEADERS=
OTEL_SERVICE_NAME=openseat-api
```

Append to `apps/web/.env.example`:

```
NEXT_PUBLIC_FARO_URL=
```

- [ ] **Step 2: render.yaml**

`openseat-api` env vars gain:

```yaml
      - key: OTEL_EXPORTER_OTLP_ENDPOINT
        sync: false
      - key: OTEL_EXPORTER_OTLP_HEADERS
        sync: false
      - key: OTEL_SERVICE_NAME
        value: openseat-api
```

`openseat-gate` env vars gain the same block with `value: openseat-gate`.

- [ ] **Step 3: Verify + commit**

Run: `python3 -c "import yaml; yaml.safe_load(open('render.yaml')); print('ok')"` → ok.

```bash
git add apps/api/.env.example apps/web/.env.example render.yaml
git commit -m "chore(deploy): wire OTLP and Faro environment variables"
```

---

### Task 8: Grafana artifacts (dashboard, alert, forced firing)

Prereq (user): Grafana Cloud account exists; `OTEL_EXPORTER_OTLP_ENDPOINT`/`_HEADERS` set on Render, `NEXT_PUBLIC_FARO_URL` on Vercel; one local smoke run (`OTEL_* env in apps/api/.env` temporarily) confirmed spans/logs/metrics arrive.

- [ ] **Step 1: Build the "OpenSeat Ops" dashboard** — three rows; confirm exact emitted metric names in Explore first (OTel semconv HTTP metrics), then panels:
  - RED: request rate `sum by (service_name) (rate(http_server_request_duration_seconds_count[5m]))` · error rate `sum(rate(http_server_request_duration_seconds_count{http_response_status_code=~"5.."}[5m])) / sum(rate(http_server_request_duration_seconds_count[5m]))` · p95 `histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket[5m])))`
  - Funnel: `increase(holds_acquired_total{result="won"}[1h])` · `increase(orders_paid_total[1h])` · `increase(tickets_checked_in_total{result="admitted"}[1h])`
  - Drop ops: `gate_queue_depth` · `rate(gate_joins_total[5m])` · `rate(gate_admitted_total[5m])` · `admissions_verified_total` by result
- [ ] **Step 2: Alert** — new rule on the error-rate query, condition `> 0.05` for `5m`, email contact point.
- [ ] **Step 3: Force it to fire once** — temporarily hit a guaranteed-5xx route repeatedly (e.g. stop the local Postgres while hammering an API route in a dev deploy, or lower the threshold to a test value, fire, restore) — screenshot the firing email/panel.
- [ ] **Step 4: Export into the repo** — dashboard JSON → `docs/observability/openseat-ops-dashboard.json`; alert definition + firing screenshot reference → `docs/observability/alert-rule.md`.

```bash
git add docs/observability
git commit -m "docs: export the OpenSeat Ops dashboard and alert rule"
```

---

### Task 9: Runbook, ADR 0009, version bump, close

- [ ] **Step 1: `docs/runbook.md`** — five incidents, each with *Detect* (panel/alert), *Diagnose* (query), *Mitigate*:
  1. API asleep/down (free-tier sleep vs crash; `{service_name="openseat-api"} | json | level="error"`)
  2. Redis lost (holds/queue behavior, BullMQ errors in logs)
  3. Webhook backlog (`webhook_events_total{outcome="invalid"}` spike vs PayMock retries)
  4. Drop overload (`gate_queue_depth` growth vs `admit_rate`, sampler knob)
  5. DB saturation (p95 latency + pg spans in Tempo)
- [ ] **Step 2: ADR 0009** — direct OTLP without a collector at $0 (collector named as the AWS-production evolution), per-service log strategy (Gate stdout-only), PayMock exclusion, off-by-default env gating.
- [ ] **Step 3: Version bump** — `render.yaml` `APP_VERSION` → `m7`.
- [ ] **Step 4: Full verification** — `pnpm turbo run lint typecheck build test` (10/10) · `pnpm --filter api test:e2e` (41 + the new tracing spec in unit tests) · `go test ./...` in both Go services.
- [ ] **Step 5: Commits**

```bash
git add docs/runbook.md docs/adr/0009-observability-otel-grafana-cloud.md
git commit -m "docs: add the operations runbook and ADR 0009"
git add render.yaml
git commit -m "chore(deploy): bump version label to m7"
```

- [ ] **Step 6: Production walk (after user push + env set)** — buy a ticket, Simulate Crowd, check a ticket in; verify in Grafana: one trace spanning web→api and web→gate, funnel counters moving, dashboard populated; record screenshots.

## Self-review

- Spec coverage: decisions 1–4 → Tasks 1/2/5/6; API deep → 1–4; Gate → 5; web → 6; config table → 7; deliverables 1–4 → 8–9; verification → Tasks 1–6 steps + 9. No gaps.
- Placeholders: metric-name confirmation in Task 8 is an explicit verify step, not a TBD; increment sites reference exact files + behavioral anchors because line numbers drift.
- Consistency: counter names in Task 3 match the dashboard queries in Task 8; `setupTelemetry` name matches between Tasks 5's steps.

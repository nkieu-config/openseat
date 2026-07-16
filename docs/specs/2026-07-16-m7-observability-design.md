# M7 — Observability ("Operate OpenSeat")

Status: Approved (2026-07-16)

## Goal

Close the gap between "a demo that works" and "a product someone operates": structured logs, distributed traces, business metrics, error visibility, one dashboard, one alert, and a runbook — all on the project's $0 hosting constraint. After M7 the answer to "how do you know the system is healthy, and how do you debug it at 2am?" is a Grafana link, not "read the raw Render logs".

## Non-goals

- Product analytics (page views, funnels for marketing) — different concern, out of scope.
- SLOs and error budgets — a runbook incident table is enough at this scale.
- Instrumenting PayMock — it stands in for an external vendor, and real vendors do not expose their internals; treating it as a black box keeps the simulation honest.
- Shipping Gate logs to Loki — the service is deliberately tiny; structured stdout is enough (see Decisions).
- A self-hosted observability stack in docker-compose — production is where observability matters, and the free tiers cover it.

## Decisions

1. **Vendor-neutral instrumentation, managed backend.** All services instrument with OpenTelemetry SDKs and export OTLP directly to **Grafana Cloud free tier** (Tempo traces, Loki logs, Mimir metrics, Faro frontend). One account, one pane of glass, and the instrumentation survives a backend swap.
2. **No collector.** The production-shaped pipeline (SDK → OTel Collector → backend) has nowhere to run at $0: a Render free service sleeps, and a sleeping telemetry gateway loses data. Every service therefore exports directly with the ingest token. ADR 0009 records the trade-off and names the collector as the first step of the AWS evolution in `docs/aws-production.md`.
3. **Off by default, on by env.** No `OTEL_EXPORTER_OTLP_ENDPOINT` → the SDK never starts. Dev, CI, and all 41 e2e tests run exactly as today. This mirrors the `GOOGLE_CLIENT_ID` gating pattern already in the codebase.
4. **Logs ride the same OTLP pipe.** The API's pino logs go to Loki through the OTel logs bridge (`@opentelemetry/instrumentation-pino`), so log lines carry `trace_id`/`span_id` and one credential covers logs, traces, and metrics alike. If the bridge proves unreliable in practice, the fallback is a `pino-loki` transport — same requirement (correlated logs queryable in Grafana), different pipe.

## Architecture

### API (`apps/api`) — deep

- **Traces.** OTel Node SDK started before Nest boots (separate `tracing.ts` loaded first from `main.ts`). Auto-instrumentations: HTTP, Express, `pg`, `ioredis`. Service name `openseat-api`.
- **Logs.** Replace the default Nest logger with pino via `nestjs-pino`: JSON in production, pretty-printed in dev. Every line carries `trace_id`/`span_id` from the active span. Request logs include method, route, status, and duration.
- **Business metrics.** An OTel Meter emits counters named after the domain, incremented where the invariants already live:
  - `holds_acquired_total{result="won"|"conflict"}`
  - `orders_paid_total`
  - `tickets_checked_in_total{result="admitted"|"duplicate"}`
  - `admissions_verified_total{result="valid"|"rejected"}`
  - `webhook_events_total{outcome="processed"|"duplicate"|"invalid"}`
- **Errors.** The global exception filter marks the active span as errored and logs at error level with the stack. "Error tracking" is the Loki error stream plus Tempo error traces plus the alert below — no separate Sentry account, preserving the one-backend story.

### Gate (`services/gate`) — the cross-language showpiece

- Extract W3C `traceparent` on `POST /join` and `GET /queue`, so the browser's request produces **one trace spanning Node and Go**.
- Spans: `gate.join`, and an admitter-loop span per batch.
- Metrics: `gate_queue_depth` (gauge, per event), `gate_joins_total`, `gate_admitted_total`, `gate_sse_connections` (gauge). These are the numbers the k6 report measured from outside; now the service reports them from inside.
- Logs stay structured `slog` JSON on stdout. Shipping them would roughly double the service's dependency weight for little signal; the trade-off is recorded in ADR 0009.

### Web (`apps/web`) — light

- Grafana **Faro** Web SDK in a small client component in the root layout: uncaught errors and Web Vitals only. Gated on `NEXT_PUBLIC_FARO_URL`; absent → renders nothing, loads nothing.

## Configuration

| Variable | Where | Notes |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | api, gate | Grafana Cloud OTLP endpoint; absent = telemetry off |
| `OTEL_EXPORTER_OTLP_HEADERS` | api, gate | `Authorization=Basic <token>` — secret, `sync: false` in render.yaml; the user sets it in the Render dashboard |
| `OTEL_SERVICE_NAME` | api, gate | `openseat-api` / `openseat-gate` (set in render.yaml) |
| `NEXT_PUBLIC_FARO_URL` | web | Faro collector URL; set on Vercel; absent = Faro off |

Sampling starts at always-on (demo traffic is far below free-tier limits); `OTEL_TRACES_SAMPLER`/`_ARG` remain the documented knob if volume ever grows.

## Deliverables

1. **Dashboard** — "OpenSeat Ops" in Grafana Cloud, three rows: RED (request rate, error rate, p95 latency per service) · business funnel (holds → orders paid → checked in) · drop ops (queue depth, admit rate, admissions). The dashboard JSON is exported into the repo at `docs/observability/openseat-ops-dashboard.json` so reviewers can read it without an account.
2. **Alert** — one rule: API 5xx responses above 5% of requests over 5 minutes → email contact point. Proven by forcing it to fire once; the firing screenshot lands in `docs/observability/`.
3. **Runbook** — `docs/runbook.md`, five incidents: API asleep/down, Redis lost, webhook backlog, drop overload, DB saturation. Each: how it shows (which panel/alert) → how to diagnose (which trace/log query) → how to mitigate. Cross-linked to the ADRs that explain the failure domains.
4. **ADR 0009** — observability stack: OTel + direct OTLP, no collector at $0, per-service log strategy, PayMock exclusion, collector as the AWS-production evolution.

## Verification

- Full quality gate and all existing e2e (41) stay green with telemetry off — proving the gating.
- One local smoke run with the OTLP env set, confirming export end to end before deploy.
- Production walk after deploy: buy a ticket, run Simulate Crowd, check a ticket in — then verify in Grafana: a single trace spanning web → api → gate, funnel counters moving, dashboard populated, and the alert fired once (forced). Screenshots recorded.

## Risks

- **Render free sleep** punches gaps in the graphs — documented in the runbook as a free-tier artifact, not an outage.
- **SDK boot cost** on cold start is small but real; boot must stay inside Render's health-check window (verified during the production walk).
- **Free-tier limits** are generous relative to demo traffic; the sampling knob is the escape hatch, not a rewrite.

## Rollout

One milestone, no schema changes, no new runtime services. `APP_VERSION` bumps to `m7`. The user's only manual step: create the Grafana Cloud account, then set `OTEL_EXPORTER_OTLP_HEADERS` (Render) and `NEXT_PUBLIC_FARO_URL` (Vercel).

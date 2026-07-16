# ADR 0009: OpenTelemetry direct to Grafana Cloud, no collector

Status: Accepted (2026-07-16)

## Context

Through M6 the system proved it *works* — race tests, e2e suites, a k6 report — but nothing proved it can be *operated*. There were no structured logs (Nest's default logger), no metrics, no traces, no error visibility beyond raw Render log tails, and no documented way to answer "is production healthy right now?". The brief's own words — a product that can grow into production — made this the largest remaining gap.

Constraints: $0 hosting (Render free services sleep; there is nowhere to run always-on infrastructure), three runtimes (Next.js browser code, a NestJS API, Go services), and a portfolio goal that rewards vendor-neutral, explainable choices.

## Decision

Instrument with **OpenTelemetry SDKs** and export **OTLP (http/protobuf) directly to Grafana Cloud's free tier** — Tempo for traces, Loki for logs, Mimir for metrics, Faro for browser telemetry. One account, one auth header (`Authorization=Basic base64(instanceId:token)`), one pane of glass.

- **No collector.** The production-shaped pipeline (SDK → OTel Collector/Alloy → backend) needs a place to run. On this stack a collector would be a Render free service, and a sleeping telemetry gateway silently drops everything behind it. Each service therefore exports directly. The collector returns as the first step of the AWS evolution (`docs/aws-production.md`), where it buys buffering, tail sampling, and credential isolation.
- **Off by default.** No `OTEL_EXPORTER_OTLP_ENDPOINT` → the SDK never constructs; no `NEXT_PUBLIC_FARO_URL` → the browser bundle never loads Faro. Dev, CI, and every e2e run stay exactly as before — the same env-gating pattern the codebase already uses for Google sign-in.
- **API: deep.** Auto-instrumented traces (HTTP/Express/pg/ioredis), pino structured logs carrying `trace_id`/`span_id` over the same OTLP pipe, domain counters at the invariant sites (`holds_acquired_total`, `orders_paid_total`, `tickets_checked_in_total`, `admissions_verified_total`, `webhook_events_total`), and a global filter that marks 5xx spans as errored. Error tracking is the Loki error stream plus Tempo error traces plus one alert — deliberately no second vendor (Sentry) to keep the story single-backend.
- **Gate: the cross-language seam.** The Go service extracts W3C `traceparent`, so a browser-rooted trace spans Node and Go, and reports the queue's own numbers (`gate_queue_depth`, `gate_joins_total`, `gate_admitted_total`, `gate_sse_connections`) — the metrics the k6 report could only measure from outside. Its logs stay as structured stdout: shipping them would roughly double the dependency weight of a deliberately tiny service for little signal.
- **PayMock: not instrumented.** It stands in for an external payment provider, and you do not get spans from inside Stripe. Keeping it a black box keeps the simulation honest; its behavior is observable where it matters, at the API's webhook counters.

## Consequences

- "How do you know it's healthy?" now has a concrete answer: the OpenSeat Ops dashboard (RED, business funnel, drop ops — JSON exported into `docs/observability/`), one email alert on API 5xx rate, and `docs/runbook.md` mapping the five likely incidents to panels, queries, and fixes.
- Instrumentation is portable. Swapping Grafana Cloud for any OTLP backend — including the self-hosted stack on AWS — is an env-var change, not a code change.
- Logs, traces, and metrics correlate: every API log line carries the active trace ids, so an error log is one click from its distributed trace.
- Free-tier sleep leaves gaps in the graphs. Documented in the runbook as an artifact of the hosting tier rather than an outage; the keep-alive cron keeps the API's gaps rare.
- Sampling starts at always-on because demo traffic sits far below free-tier limits; `OTEL_TRACES_SAMPLER`/`_ARG` is the documented knob if that changes.

## When this would change

Moving to AWS introduces the collector tier and tail sampling. Real payment providers would justify instrumenting the payments adapter boundary with provider-latency metrics. And if the Gate ever grows real operational surface (multiple instances, autoscaling), its logs earn shipping the same way the API's did.

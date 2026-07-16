# Observability artifacts

The committed half of M7 (see `docs/specs/2026-07-16-m7-observability-design.md` and ADR 0009). Instrumentation exports OTLP directly to Grafana Cloud; these files let a reviewer read the operational surface without an account.

- [`openseat-ops-dashboard.json`](openseat-ops-dashboard.json) — the "OpenSeat Ops" dashboard model (RED · business funnel · drop ops).
- [`alert-rule.md`](alert-rule.md) — the single 5xx error-rate alert and how to prove it fires.
- `../runbook.md` — five incidents mapped to these panels and queries.

## Import the dashboard

1. Grafana → **Dashboards → New → Import → Upload JSON file** → `openseat-ops-dashboard.json`.
2. When prompted, pick the datasources for the two variables: **Metrics (Mimir)** and **Logs (Loki)** — the Grafana-Cloud-provisioned Prometheus and Loki data sources.
3. Save. The custom-metric panels (funnel, drop ops) populate as soon as real traffic flows; the RED row needs the HTTP histogram (see the name note below).

## Metric catalog

Emitted OTel name → the counter/gauge/histogram it is, and where it is incremented. Counters already carry `_total`, so Prometheus normalization leaves them unchanged.

| OTel metric | Kind | Source | Labels |
|---|---|---|---|
| `holds_acquired_total` | counter | `holds.service.ts` acquire path | `result=won\|conflict` |
| `orders_paid_total` | counter | `payments.service.ts` on paid transaction commit | — |
| `tickets_checked_in_total` | counter | `checkin.service.ts` | `result=admitted\|duplicate` |
| `admissions_verified_total` | counter | `admission.guard.ts` | `result=valid\|rejected` |
| `webhook_events_total` | counter | `payments.service.ts` | `outcome=processed\|duplicate\|invalid` |
| `gate_joins_total` | counter | `queue.go` Join | — |
| `gate_admitted_total` | counter | `queue.go` Admit | — |
| `gate_sse_connections` | up/down counter (gauge) | `main.go` SSE handler | — |
| `gate_queue_depth` | observable gauge | `telemetry.go` callback (ZCard per event) | `event_id` |

HTTP server metrics come from `@opentelemetry/instrumentation-http` (v0.220, **old semconv by default**): histogram `http.server.duration` in **milliseconds**, with labels `http_method`, `http_status_code`, `http_route`, `service_name`.

## The HTTP-name note (read if the RED row is empty)

Grafana Cloud's OTLP ingest may or may not append the unit suffix, so the histogram lands as either `http_server_duration_milliseconds_*` or `http_server_duration_*`. The dashboard queries use `{__name__=~"http_server_duration(_milliseconds)?_bucket"}` to match **both** — no edit needed in the common cases.

If the RED panels are still empty, confirm the real names in **Explore**:

```promql
group by (__name__) ({__name__=~"http_server_.+"})
```

and, if the app opted into stable HTTP semconv (`OTEL_SEMCONV_STABILITY_OPT_IN=http`), the metric becomes `http_server_request_duration_seconds_*` with label `http_response_status_code` — widen the regex to `http_server_(request_)?duration.*` and switch the status label accordingly.

## Correlate logs ↔ traces

Every API log line carries `trace_id`/`span_id`. In **Explore → Loki**:

```logql
{service_name="openseat-api"} | json | level="error"
```

open a line, and the derived field links straight to the Tempo trace. Reverse direction: a slow or errored trace in Tempo shows its `service.name` and links back to its logs.

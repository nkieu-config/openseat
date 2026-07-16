# OpenSeat Runbook

How to detect, diagnose, and mitigate the five incidents most likely to hit this deployment. Telemetry lives in Grafana Cloud (dashboard: **OpenSeat Ops**, exported to `docs/observability/openseat-ops-dashboard.json`); services export OTLP directly per ADR 0009.

Conventions used below:

- Logs (Loki): `{service_name="openseat-api"} | json`
- Traces (Tempo, TraceQL): `{ resource.service.name = "openseat-api" && status = error }`
- Metrics (Mimir, PromQL): names as emitted by the API/Gate meters

## 1. API asleep or down

**Detect.** The RED row flatlines (request rate → 0) and the *API 5xx error rate* alert may fire if traffic errored before the stop; the keep-alive workflow's ping fails.

**Diagnose.** Distinguish free-tier sleep from a crash: sleep shows no error logs, just silence and a slow first response (~30–60 s cold start). A crash leaves a final error in `{service_name="openseat-api"} | json | level="error"` — a boot failure most commonly means a missing secret, since the app fails fast on `JWT_SECRET`, `PAYMOCK_WEBHOOK_SECRET`, or `GATE_ADMISSION_SECRET` (see the `getOrThrow` reads in `apps/api/src`).

**Mitigate.** Sleep: first request wakes it; the keep-alive cron (`.github/workflows/keep-alive.yml`) exists precisely to keep the window rare — check it is enabled and `API_HEALTH_URL` is set. Crash: read the last error, restore the missing env in Render, redeploy. Gaps in graphs during sleep are a free-tier artifact, not data loss.

## 2. Redis lost

**Detect.** `gate_queue_depth` disappears (Gate's gauge callback errors), hold acquisition latency spikes, and API error logs mention `ioredis`/BullMQ reconnect loops.

**Diagnose.** `{service_name="openseat-api"} | json | level="error" |= "Redis"` for the API side; the Gate logs `redis unreachable` on boot or command errors on stdout (Render logs). Confirm which side is affected — the API uses Redis for BullMQ + Socket.IO adapter, the Gate for the queue itself.

**Mitigate.** Inventory is never in Redis (ADR 0002), so no tickets or holds are lost — holds live in Postgres and keep expiring by `expires_at` even if the sweeper is stalled. The waiting-room queue is ephemeral by design (ADR 0007): buyers rejoin after Redis returns. Restore/restart the Render key-value instance; both services reconnect without redeploy.

## 3. Webhook backlog or forgeries

**Detect.** *Funnel* row: `orders_paid_total` stalls while checkout traffic continues; `webhook_events_total{outcome="invalid"}` climbing signals signature failures, `outcome="duplicate"` climbing is normal (PayMock intentionally double-sends).

**Diagnose.** `{service_name="openseat-api"} | json |= "webhook"` shows each rejection reason (missing/malformed signature, timestamp outside tolerance, invalid signature). A burst of `invalid` right after a deploy usually means `PAYMOCK_WEBHOOK_SECRET` diverged between the API and PayMock env groups. Orders stuck in `awaiting_payment` past 15 minutes are expired and released by the BullMQ job — check its logs if seats are not freeing.

**Mitigate.** Secret drift: re-sync the `paymock-shared` env group and redeploy both services. PayMock down: intents fail fast with a 502 to the buyer; webhooks for already-created intents retry with backoff from PayMock's dispatcher, and dedup by `provider_event_id` makes replays safe.

## 4. Drop overload

**Detect.** *Drop ops* row: `gate_queue_depth` grows monotonically while `rate(gate_admitted_total[5m])` stays flat at the configured ceiling; SSE connections (`gate_sse_connections`) track queue size.

**Diagnose.** This is the system working as designed — the token bucket (`ADMIT_BATCH` per `ADMIT_INTERVAL_MS`) shapes the spike. Check `admissions_verified_total{result="rejected"}` on the API: a spike there without matching Gate admissions means expired admission tokens (users idling past `ADMISSION_TTL_SECONDS`) or a `GATE_ADMISSION_SECRET` mismatch between the Gate and the API.

**Mitigate.** Raise `ADMIT_BATCH` / lower `ADMIT_INTERVAL_MS` on the Gate if downstream (holds p95 in the RED row) has headroom; the k6 report (`docs/load-tests/gate-report.md`) says the Gate itself has ~13k joins/s of slack. If traces get noisy at volume, apply head sampling via `OTEL_TRACES_SAMPLER=parentbased_traceidratio` + `OTEL_TRACES_SAMPLER_ARG` instead of touching code.

## 5. Database saturation

**Detect.** RED row p95 climbs across all API routes at once; pg spans dominate trace durations.

**Diagnose.** In Tempo, `{ resource.service.name = "openseat-api" && duration > 500ms }` then open the slowest traces — the auto-instrumented `pg` spans show which query burns the time. Hold-acquisition conflicts (`holds_acquired_total{result="conflict"}`) rising alongside is contention on hot seats, which is expected during a drop; uniform slowness across unrelated queries is the Neon free-tier compute limit.

**Mitigate.** Contention: nothing to fix — the `INSERT … ON CONFLICT` path is designed to lose fast (ADR 0002). General saturation: Neon free tier autosuspends and shares compute; sustained load needs the paid tier or the AWS path (`docs/aws-production.md`, RDS sizing). Long term the read-heavy dashboard queries move to a replica per that document.

## Escalation notes

There is no on-call rotation — this is a portfolio deployment. The alert (`API 5xx > 5% for 5 minutes`) emails the owner; everything above assumes a single operator with Grafana Cloud and the Render dashboard open side by side.

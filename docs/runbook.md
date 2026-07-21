# OpenSeat Runbook

How to detect, diagnose, and mitigate the seven incidents most likely to hit this deployment. Telemetry lives in Grafana Cloud (dashboard: **OpenSeat Ops**, exported to `docs/observability/openseat-ops-dashboard.json`); services export OTLP directly per ADR 0009.

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

## 6. PayMock asleep — checkout cannot start

**Detect.** Buyers get `502 The payment provider is unavailable — try again shortly` the moment they submit an order, while the RED row stays healthy: the API is fine, its dependency is not. `orders_paid_total` flatlines even though holds keep being won, and no `webhook_events_total` movement follows — unlike incident 3, no intent was ever created, so there is no webhook to wait for. The API answers 502, so a large enough burst trips the 5xx alert.

**Diagnose.** PayMock is a Render free service and is *allowed* to sleep — the keep-alive cron deliberately covers only the API (ADR 0009's hosting trade-off). Confirm with `{service_name="openseat-api"} | json |= "paymock"`, or open the checkout trace in Tempo and read the failed outbound span to the PayMock origin. A cold start measured **22.5 s** on 2026-07-16, far past the client's timeout, which is why the first buyer after an idle period always eats a 502 and a retry moments later succeeds.

**Mitigate.** Wake it — `curl -sS https://<paymock-origin>/health` — then retry; the next attempt succeeds. Since 2026-07-22 this should be rare from the buyer's side: the event page wakes PayMock on mount when the event has a paid, unsold tier (ADR 0005's amendment), so the spin-up overlaps seat selection. Two ways it still bites — a buyer who lands straight on an order page, and any demo you drive yourself. Run the **Warm every service** workflow (`.github/workflows/warm-all.yml`, manual dispatch) before a recorded demo or an interview; it is deliberately not on a cron because the workspace only gets 750 free instance-hours a month and running out suspends every free service at once. Nothing is stranded: `createIntent` runs *after* the order transaction commits, and its failure path cancels the order (`expireOrder(orderId, 'canceled')` in `orders.service.ts`), releasing the seats in one transaction instead of holding them for the 15-minute payment window. A PayMock nap therefore leaves a trail of `canceled` orders, never stuck `awaiting_payment` ones. Ping `/health` before recording a demo.

## 7. Refund stuck pending

**Detect.** The organizer's order roster shows a refund sitting `pending` well past a minute — settlement is normally near-instant locally and a few seconds in production. The seat is already back on sale and the ticket is already `void` (reclaim committed in the API's own transaction, ADR 0011), so this is *only* the money leg: `refunds_total{result="succeeded"}` never increments for it, and there is no matching `refunds_total{result="failed"}` either — a failed money leg would have thrown synchronously and shown `failed` with a Retry button, not `pending`. A pending refund with neither counter moving means the reclaim happened but the `payment.refunded` webhook never settled it.

**Diagnose.** Two distinct shapes, told apart by whether the webhook arrived at all:

- *The webhook never landed.* `webhook_events_total` is flat with no `payment.refunded` in `{service_name="openseat-api"} | json |= "refunded"`. PayMock accepted the refund (the sync `201` returned, which is why the leg is not `failed`) but its dispatcher gave up after backoff, or PayMock went to sleep before the delivery — it is a Render free service and is allowed to nap (incident 6, ADR 0009). Confirm from PayMock's own Render logs that the delivery attempts exhausted.
- *The webhook landed but matched nothing.* `webhook_events_total{outcome="processed"}` moved and the log shows a `payment.refunded` line, yet the refund is still `pending`. That means `handleRefunded` found `updated.count === 0` — the event's `reference` did not match any pending refund id. The money moved on the provider while our refund row never settled. This is the dangerous case and it means a lost or mismatched `reference` (ADR 0011's race is *supposed* to prevent exactly this, so a real occurrence points at a bug in the echo, not a transient).

**Mitigate.** PayMock does not expose a webhook re-send, so recovery runs from our side. For the *never-landed* case, the organizer's **Retry** button re-runs the money leg (`POST …/refunds/:refundId/retry`); PayMock refunds again and re-emits the event, and dedup by `provider_event_id` plus the guarded `updateMany` make the extra delivery safe — a refund settles at most once. Wake PayMock first (`curl -sS https://<paymock-origin>/health`) if incident 6's signature is also present. For the *settled-but-unmatched* case, do **not** blindly retry — the provider has already moved the money, so a second refund would over-refund the intent (PayMock's `over_refund` guard will reject it, but the pending row still needs closing). Reconcile by hand: match the `payment.refunded` event's `reference` to the refund row, confirm the provider's cumulative `refundedSatang`, and settle the row directly, then file the `reference`-echo bug that let it slip.

## Escalation notes

There is no on-call rotation — this is a portfolio deployment. The alert (`API 5xx > 5% for 5 minutes`) emails the owner; everything above assumes a single operator with Grafana Cloud and the Render dashboard open side by side.

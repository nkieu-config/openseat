# Alert: API 5xx error rate

One Grafana-managed alert rule watches the API's server-error ratio and emails on sustained failure. It is the machine half of the runbook's incident #1.

## Rule

| Field | Value |
|---|---|
| Name | `openseat-api 5xx error rate` |
| Datasource | the Mimir/Prometheus datasource that receives OTLP metrics |
| Query (A) | `sum(rate(http_server_duration_milliseconds_count{http_status_code=~"5.."}[5m])) / clamp_min(sum(rate(http_server_duration_milliseconds_count[5m])), 0.001)` |
| Condition | `A > 0.05` (5% of requests) |
| For | `5m` |
| Evaluation | every `1m` |
| Contact point | email to the project owner |
| Summary | `API 5xx error rate is {{ $values.A }} over the last 5 minutes` |

The `clamp_min(..., 0.001)` guard keeps the ratio defined when traffic is zero (free-tier sleep), so the rule does not fire on `0/0` during idle windows.

## Create it (UI)

1. **Alerts & IRM → Alert rules → New alert rule.**
2. Section 1 — set query **A** to the PromQL above on the metrics datasource.
3. Section 2 — expression **Threshold**, input `A`, `IS ABOVE 0.05`.
4. Section 3 — evaluation group every `1m`, pending period `5m`.
5. Section 4 — labels/annotations: summary as above.
6. Section 5 — contact point: an **email** contact point (Alerts & IRM → Contact points → add the project email), routed by the default notification policy.
7. Save.

## Prove it fires once

Force one firing so the alert is demonstrably wired, then restore:

- Temporarily lower the threshold to `IS ABOVE 0` (any traffic trips it), wait one evaluation, capture the firing email + the alert-state screenshot, then restore `0.05`. **Or**
- Generate real 5xx: stop the API's Postgres (`docker compose stop postgres` locally, or the equivalent on a throwaway deploy) while hitting a DB-backed route, so requests 500 past the 5% threshold for 5 minutes.

Save the firing screenshot next to this file as `alert-firing.png`.

## Why only this alert

At this scale a single high-signal alert beats a wall of noisy ones. Error rate is the one symptom that always means "a human should look now"; latency, queue depth, and funnel drop-off are diagnosis surfaces you reach for *after* the page, and they live on the dashboard, not in your inbox. Adding SLO burn-rate alerts is the natural next step once there is real traffic to build a budget from.

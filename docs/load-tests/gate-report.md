# Gate load test — on-sale rush

The waiting-room **Gate** (`services/gate`, Go + Redis) is the one component built to absorb a stampede: when a drop opens, every buyer hits `POST /gate/{eventId}/join` at once. This test drives that path under a ramping crowd and checks it stays fast and error-free.

Reproduce it with the script in this folder:

```bash
# with the Gate running against Redis (see services/gate)
GATE_URL=http://localhost:4200 EVENT_ID=loadtest k6 run docs/load-tests/gate-load.js
```

## Scenario

`ramping-vus` — 0 → 200 virtual users over 10s, hold 200 for 20s, ramp down (35s total). Each iteration joins the queue with a unique visitor and asserts the response is `200` and carries a queue position (or an admission).

## Environment

Single Gate instance + Redis 7 (Docker), Apple M-series laptop, k6 v2.1. This is a local ceiling check, not a production SLA — but the Gate is stateless over Redis, so it scales horizontally behind a load balancer.

## Results

| Metric | Value |
|---|---|
| Peak concurrency | 200 VUs |
| Join requests | 455,508 in 35s |
| Throughput | **~13,015 req/s** |
| Failed requests | **0.00%** (0 / 455,508) |
| Latency avg / median | 12.0ms / 12.4ms |
| Latency p90 / p95 | 17.8ms / **19.6ms** |
| Latency max | 84.5ms |
| Checks passed | 100% (911,016 / 911,016) |

Thresholds (`http_req_failed < 1%`, `p95 < 500ms`, `checks > 99%`) all passed.

## Reading it

At 200 concurrent buyers the Gate served ~13k joins per second with a p95 under 20ms and not a single failed request — the queue admits at a controlled rate regardless of how hard the front door is pushed, which is the whole point of putting a waiting room in front of checkout. Because queue state lives entirely in Redis and admission is a stateless signed token, more Gate replicas add throughput without added coordination; Redis becomes the next thing to watch, not the Gate process.

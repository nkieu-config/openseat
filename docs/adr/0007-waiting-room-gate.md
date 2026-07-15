# ADR 0007: A Redis-backed waiting room with stateless admission

Status: Accepted (2026-07-16)

## Context

A ticket drop concentrates a month of traffic into a few seconds — every buyer arrives the instant the on-sale opens. Letting that crowd hit the seat map, holds, and checkout directly means the database and realtime layer absorb the whole spike, and the fastest bots win. The industry answer is a waiting room: a front door that admits buyers at a controlled rate.

We already run Redis (BullMQ, the Socket.IO adapter). The open questions were where the queue lives, how admission is enforced downstream, and what language the front door speaks.

## Decision

Build **Gate** (`services/gate`), a small Go service that owns the queue and nothing else:

- The queue is a Redis sorted set (`gate:{eventId}:q`, score = join time). Position is a `ZRANK`; there is no per-connection state to lose. Queue state is **ephemeral by design** — a drop that never happened leaves nothing behind.
- Buyers join over `POST /join` and watch their place fall over an **SSE** stream (`GET /queue`). A token-bucket **admitter** goroutine pops the front of the queue at a fixed rate.
- On admission the Gate mints a **stateless admission JWT** (HS256, shared secret) scoped to the event with a short expiry. The API verifies that signature itself — the Gate can be asleep, restarted, or replaced and already-admitted buyers still get in.
- The API's `AdmissionGuard` enforces the token on the sale endpoints (`seat-map`, `holds`, `orders`) **only when the event is `dropMode`**; every other event is untouched.

Go earns its place again: the admitter is a goroutine loop, SSE is a plain flushing handler, and the whole service is Redis-in, HTTP-out with no database of its own.

## Consequences

- The seat map and checkout only ever see admitted, rate-limited traffic; the spike is shaped at the door. The k6 report (`docs/load-tests/gate-report.md`) measures ~13k joins/s at p95 < 20ms with zero errors on a single instance.
- Admission is **stateless** end to end — the API never calls back to the Gate, and the Gate holds no session state, so both scale horizontally with Redis as the shared floor.
- The queue is not durable. If Redis is lost mid-drop the line resets — acceptable for a queue (buyers rejoin), and precisely why the *authoritative* inventory never lives here.
- Two services now share `GATE_ADMISSION_SECRET`. Rotating it invalidates outstanding admissions — the correct blast radius.
- A `Simulate a crowd` control injects synthetic entrants so the waiting room is demonstrable by a single visitor — the demo counterpart to a real on-sale surge.

## When this would change

At much larger scale the single admitter and one sorted set become the bottleneck; sharding the queue per event, or moving admission onto a streaming system, would be the next step. Until then the shape is deliberately boring: one queue, one admitter, one signed token.

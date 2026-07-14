# ADR 0002: Postgres-authoritative seat holds, Redis for speed only

Status: Accepted (2026-07-15)

## Context

Seat holds are the heart of the product: when a buyer taps a seat, that seat must be theirs for a few minutes, and two buyers must never both believe they hold it. The classic implementations are Redis locks with TTL (fast, self-expiring) or database rows (transactional, durable). Our Redis runs on a free tier with no persistence guarantees, and losing every active hold on a Redis restart would corrupt in-flight checkouts.

## Decision

Postgres owns hold state. A hold is a row with a unique `(event_id, seat_id)` constraint and an `expires_at` timestamp; taking a hold is `INSERT ... ON CONFLICT DO NOTHING` inside a transaction, and taking over an expired hold happens in the same transaction. The ticket table's own unique constraint on `(event_id, seat_id)` is the final backstop: even a buggy code path cannot sell one seat twice.

Redis still earns its place, but never as the source of truth: Socket.IO fanout across instances, BullMQ job queues (including the hold-expiry sweeper), rate limiting, and later the waiting-room queue — which is ephemeral by design, because losing a queue is annoying while losing a sold seat is unacceptable.

## Consequences

- Correctness survives a Redis wipe; at worst, realtime updates and queued jobs are delayed while the outbox re-dispatches.
- The hot path costs one database round-trip instead of a Redis one. At portfolio scale this is nowhere near a bottleneck; the load-test report (M5) will put numbers on it.
- Expiry is lazy (checked in transactions) plus swept (BullMQ repeatable job), so a dead sweeper degrades cleanup latency, not correctness.

## When to revisit

If hold contention ever saturates Postgres (sustained thousands of hold attempts per second on hot events), introduce a Redis reservation layer in front — but keep the ticket-table constraint as the invariant of last resort.

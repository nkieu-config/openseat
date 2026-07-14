# ADR 0003: Transactional outbox + BullMQ instead of Kafka

Status: Accepted (2026-07-15)

## Context

Ticket issuance must be exactly-once from the buyer's perspective: when a payment webhook marks an order paid, the tickets, the confirmation email, and the seat-map update must all eventually happen — even across crashes. That calls for reliable, ordered, retried event processing. Kafka is the canonical answer at scale, but it is heavy to operate, has no honest free tier, and at this system's volume it would be resume-driven engineering.

## Decision

Events that must not be lost are written to an `outbox_events` table in the same transaction as the state change that produced them. A dispatcher moves unprocessed outbox rows onto BullMQ (Redis) queues, where workers handle delivery: sending email, publishing realtime updates, expiring orders. Handlers are idempotent, so at-least-once delivery is safe; BullMQ provides retries with backoff and delayed jobs (order expiry, hold sweeping).

## Consequences

- Atomicity comes from Postgres, not from a broker: an event exists if and only if its transaction committed.
- A Redis flush loses queued jobs but not events — the dispatcher re-enqueues from the outbox.
- We accept the operational simplicity ceiling: no replay for new consumers, no cross-service ordering guarantees, no fan-in from other teams.

## When to revisit

Adopt Kafka (or a managed equivalent) when any of these appear: multiple consumer teams needing independent replayable subscriptions, event throughput beyond what a single Postgres outbox table sweeps comfortably (~thousands of events/second sustained), or audit requirements for long-horizon event retention. The outbox pattern survives that migration: the dispatcher's target changes from BullMQ to Kafka while producers stay untouched.

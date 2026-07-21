# ADR 0014: Webhook handlers carry their own idempotency

Status: Accepted (2026-07-21)

## Context

`POST /api/payments/webhook` deduplicated deliveries by inserting a row into `webhook_events` keyed on the provider's event id, and that insert ran in its own transaction, before processing. The unique index on `provider_event_id` was therefore the gate: the first delivery inserted and processed, and any later delivery of the same event lost the insert with a `P2002`, was answered `200 {duplicate: true}`, and never reached `processEvent`.

That gate was doing more work than it looked like. It was not only a deduplicator — it was a structural, event-level exactly-once guarantee, enforced by the database, covering every handler that existed and every handler anyone might add.

It also had a hole that cost money. The dedup row committed *before* processing, and the `processed_at` column it carried was written but never read. If `processEvent` threw once — a transient database error, a restart mid-flight, a bug in one branch — the event was permanently marked as seen while none of its effects had happened. PayMock's retry then arrived, lost the insert, and got a cheerful `200 duplicate`. The buyer's money was captured, no ticket existed, and no compensation ran, because nothing downstream ever learned the event had failed. The failure was silent by construction: the retry that was supposed to fix it was the thing being suppressed.

## Decision

**`recordEvent` reports what it found, and only a genuinely finished event short-circuits.** It returns `fresh` when the insert succeeds, and on `P2002` it reads the existing row and returns `processed` or `unprocessed` depending on whether `processed_at` is set. The controller answers `200 {duplicate: true}` only for `processed`; `fresh` and `unprocessed` both fall through to `processEvent`. A crash no longer strands a captured payment, because the redelivery that follows it is allowed to do the work.

The cost is stated plainly: **exactly-once is no longer enforced at the event level.** Two deliveries of the same event can now both pass the gate whenever the first has not yet reached `markProcessed`. So the guarantee moves down a layer:

**Every handler in the `processEvent` switch must be idempotent on its own.** Each one opens with a conditional claim — a compare-and-set whose `WHERE` names the state it is transitioning *out of* — and does nothing if the claim matches no rows:

- `handleSucceeded` claims the payment at `status: 'requires_action'`
- `handleFailed` claims the same payment status
- `handleRefunded` claims the refund at `status: 'pending'` via the `reference` the API minted (ADR 0013)

Under `READ COMMITTED`, a second execution blocks on the row the first holds, re-evaluates its `WHERE` against the committed result, matches nothing, and returns before touching anything. Every dangerous effect — the order status flip, the `remaining` decrement, `ticket.createMany`, the outbox writes that send email, the `refundedSatang` increment — sits *after* the claim, inside the same transaction.

This is a weaker mechanism than a unique index, so it is deliberately not the only one. The database still backstops the outcomes that matter: `tickets_event_seat_unique` is a partial unique index on `(event_id, seat_id)` that makes double-selling a seat impossible regardless of how the code got there, `ticket_types` carries `CHECK (remaining >= 0)`, and `refunds` is unique on `(order_id, idempotency_key)` — which is what stops a racing compensation from returning the money twice. Per this repo's convention, the invariants live in the database; the handler claims are how the application avoids *reaching* them.

## Consequences

- **A new `case` added without a claim is a silent double-execution bug.** This is the real cost of the change and the reason it is written down. The switch is small and every branch currently holds, but nothing mechanical enforces the rule — no type, no test, no lint. Anyone extending `processEvent` is inheriting an obligation that the old design carried for them.

- **The documented double-send does not exercise this.** PayMock deliberately delivers every webhook twice, which sounds like the race but is not: `Deliver` only fires the duplicate *after* the first delivery returned 2xx, and a 2xx means `markProcessed` already committed. The concurrent path is reachable by other routes — a retry after the 15-second client timeout while the first is still in flight, or two API instances behind the Redis Socket.IO adapter. The `e2e` test added with this change covers the sequential reprocess, which is the bug that was fixed; it does not cover concurrency.

- **`webhookEvents{outcome="processed"}` can over-count.** A duplicate that claims nothing still falls through to the metric at the end of `processEvent`. The counter measures deliveries processed, not state transitions, and should not be read as a count of payments captured.

- **The loser of a race waits for the winner's whole transaction.** Row-level blocking is what makes the claims correct, but it means a second delivery is held for the duration of ticket issuance and the outbox writes. If that ever exceeds Prisma's transaction timeout the delivery fails, the provider sees a non-2xx, and it retries — into the same contention. It has not been observed at this scale, and the fix if it is would be a lease rather than a longer timeout.

## When this would change

If a handler ever needs to do something that cannot be expressed as a single conditional claim — a multi-step saga, a call to an external system whose effect is not conditional on a row — then per-handler idempotency stops being sufficient and the gate belongs back at the event level. The shape that keeps both properties is a lease on `webhook_events`: claim the row with a conditional update (`processed_at IS NULL AND (claimed_at IS NULL OR claimed_at < now() - interval)`) and process only when that update matched. That restores exactly-once under concurrency while still permitting the reprocess-after-crash this ADR exists to allow. It was not done now because it adds a column, a staleness constant, and a recovery story for leases that outlive their process, in exchange for closing a race that the current handlers already survive.

# ADR 0013: The money path compensates instead of logging

Status: Accepted (2026-07-20)

## Context

A full-repo review after the roadmap closed found no critical defects and no authorization holes, but it found the same shape of problem four times over, always on the same seam: the failure paths around money. The happy paths were sound and the contention paths were proven by tests. What was missing was the *third* case — the leg that arrives late, twice, or not at all.

Each instance ended the same way: a `logger.warn` and a `return`. That is a decision to notice a problem and do nothing about it, and it was never written down as one, which is how it survived four milestones. Concretely:

- A refund whose provider call threw was marked `failed` unconditionally — including when the settlement webhook had *already* marked it `succeeded`, because PayMock dispatches from a goroutine before its HTTP response returns. The organizer then saw a Retry button on money that had already moved, and retrying sent it again: `store.Refund()` had no dedup, so ADR 0011's claim that "re-sending money is idempotent on the provider side" was true of the argument and false of the code.
- A buyer who paid after the 15-minute window had their money captured and got nothing. The order was already `expired`, its inventory already released, so the webhook logged a warning and returned — while the `payment → succeeded` write in the same transaction committed. M9 had built every piece needed to give that money back, and none of it was wired to this branch.
- Settlement trusted the `orderId` and `amountSatang` the provider echoed back rather than the refund row the API had just claimed, so a provider bug or a leaked secret could move the ledger under a valid signature.
- Seated `remaining` was decremented on every sale and never restored on refund, so the number drifted down forever and would eventually go negative — with nothing but application logic standing in the way, in a repo whose own convention says correctness invariants belong in the database.

## Decision

**When the system takes money it cannot honour, it gives the money back on its own initiative.** A `payment.succeeded` that finds its order in `expired` or `canceled` now creates a full refund and sends the money leg, instead of warning. This is the first action in the system that moves money with no human asking, and that is the point: there is no one to ask. The buyer is gone, the organizer never knew, and the alternative is silently keeping money for a ticket that does not exist.

That refund carries `requestedById = NULL`. Attributing it to the organizer or the event owner would be a lie about who acted, and inventing a system user would put a fake human in a table of real ones. Null means *the system compensated*, and it is queryable as exactly that — which is also how the compensation stays idempotent across duplicate webhooks: a second late success finds the existing null-requester refund and stops.

The order stays `expired`. Only the money moves. An order that was never fulfilled did not become a refunded purchase, and the organizer's roster should not grow a phantom sale that was cancelled.

**Every settlement reads the row the API owns.** `handleRefunded` claims the refund by `reference` and then settles from *that row's* `orderId` and `amountSatang`; `handleSucceeded` and `handleFailed` resolve the order through the unique `providerIntentId` on the payment row rather than the payload's `orderId`. The webhook is still authenticated by HMAC and still deduped by event id — this narrows what a valid signature is allowed to assert. A provider may tell us *that* something happened; it does not get to tell us to which order, or for how much. ADR 0011 already treats `reference` as the one field the caller minted and therefore trusts; this extends the same reasoning to everything else the payload carries.

**Idempotency is enforced where the money actually moves.** PayMock now dedups refunds by `reference`: a replayed call returns the original refund id, moves nothing, and emits no second webhook. On the API side the failure branch is a conditional claim (`status: 'pending'`), so a late error can no longer un-settle a settled refund. The two together make ADR 0011's retry story true rather than merely intended — and the provider-side half is the one that matters, because the API can be restarted mid-flight but the provider is the ledger.

**`remaining >= 0` is a database constraint.** A `CHECK` on `ticket_types` now enforces the floor that three separate code paths were individually responsible for, and the admin quantity change became a guarded `UPDATE` so a concurrent sale produces a 409 instead of a constraint violation inside a webhook transaction. The refund restore loop was corrected to return seated tickets to their tier alongside GA ones, which removes the drift that would have reached the floor in the first place. The migration clamps any already-negative row before adding the constraint, because a constraint that cannot be applied to existing data is a failed deploy, not a safety net.

**Delivery gets the same treatment, one layer down.** The outbox claims each row with a conditional update before running its side effect, so the post-transaction `nudge()` and the polling worker can no longer both send the same confirmation email. The order-expiry job gained retries with backoff, and — because a job queue that loses a message loses inventory forever — a periodic reconcile sweep over `awaiting_payment` orders past their expiry, which is the backstop that does not depend on the queue having remembered anything.

## Consequences

- **A test that asserted the bug had to be rewritten.** `payments.e2e-spec.ts` contained *"expires an unpaid order, restores inventory, and ignores late success"* — the name is the defect, written down and passing. It now asserts the compensation. A test can encode a decision nobody made; this one did for two milestones.

- **The RESTRICT lesson recurred in a new form.** Refunds reference orders under `onDelete: Restrict`, and M9 already taught the seed to delete refunds first. But the compensation path creates refunds for orders that *no test ever expected to have one*, which broke the payments spec teardown the first time it ran. The rule generalises past what M9 recorded: it is not enough to fix cleanup when a table is added — it must be revisited whenever a new code path can write to that table for a new class of row.

- **The outbox trades a narrower failure for a broader one, deliberately.** Claiming by optimistic increment on `attempts` means a slow handler can still be re-claimed by the next poll, but two dispatchers can never run the same row concurrently, and a crash mid-handle leaves the row retryable rather than lost. The alternative the review suggested — claiming by setting `processedAt` up front — prevents the duplicate but drops the event on a crash. For a system whose one durable side effect is the buyer's only ticket link, losing it is worse than sending it twice.

- **Auto-refund is mechanism, not policy.** It fires only for `expired` and `canceled`, the two states where the system knows it has nothing to deliver. Any richer rule — partial capture, a grace window, letting the organizer honour a late payment instead — is product surface that does not exist yet, and the null-requester row is the seam where it would attach.

## When this would change

If a real provider replaces PayMock, its idempotency contract has to be read rather than assumed — the `reference` dedup is now load-bearing, and a provider that keys idempotency differently (a header, a request hash) moves that guarantee to a different place. If buyer-initiated refunds arrive, `requestedById = NULL` stops being unambiguous and the row needs an explicit actor kind. And if the compensating refund itself fails repeatedly, there is currently no escalation beyond the organizer's Retry button and an error log; that is the point where the durable queue rejected in ADR 0003 and again in ADR 0011 would finally have a claim worth hearing.

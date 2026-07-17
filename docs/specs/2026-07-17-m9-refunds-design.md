# M9 — Refunds ("Give the money back")

Status: Proposed (2026-07-17)

## Goal

An organizer can refund any subset of a paid order's tickets. The refunded tickets are void at the door, their seats and GA slots return to sale live, the buyer sees the money confirmed by the payment provider, and every step survives the provider's deliberately duplicated webhooks. M3 proved this system can take money honestly; M9 proves it can give money back the same way.

This reverses a recorded scope cut — `README.md` and the original design spec both list refunds as deliberately out of scope. The reversal is itself part of the story: the cut was right for a demo, and it stops being right the moment the product claims to be extensible to production, because refunds are the first thing a real event runs into.

## Non-goals

- **Buyer self-service refunds.** Who may refund themselves, within what window, with what fee — that is refund *policy*, a product conversation. M9 builds the *mechanism*; the only trigger is the organizer.
- **Partial amounts on a single ticket.** A ticket refunds at its full paid price. Granularity comes from choosing which tickets, not from splitting one.
- **RBAC.** Deferred to M10. Refund authorization is the existing ownership check; M9's dangerous new action is precisely what makes M10's roles worth building.
- **A `refund.failed` webhook from PayMock.** Real providers fail refunds asynchronously but rarely; simulating it would double the provider's state machine for marginal demo value. PayMock rejects invalid refund requests synchronously (4xx) and settles valid ones. Recorded as the simulation's known simplification.
- **Resale, transfers, exchanges.** Different features entirely.

## Stack analysis — what goes where, and what was rejected

The question for M9 is not "which framework" but "which side of the provider boundary". The rule that has kept PayMock honest since M3: **it may only do what a real payment provider does.** Stripe has a refund endpoint, refund objects, and a `charge.refunded` event. It does not know what a ticket is. So:

- **PayMock (Go) gets the provider surface only**: `POST /intents/{id}/refunds` (API-key auth, same as intents), cumulative refund state on the intent, and a `payment.refunded` webhook signed and **double-sent** through the existing dispatcher. No ticket, seat, or inventory concept crosses into Go — that boundary is what makes the swap-for-Stripe story in `docs/aws-production.md` credible.
- **The API (NestJS) owns every invariant**: the `Refund` record, ticket voiding, inventory restoration, order state, and the race against check-in — all Postgres transactions, because correctness invariants live in the database (ADR 0002's standing rule).
- **The web app carries the largest single chunk**: the organizer console today renders only aggregates; there is no per-order surface at all. M9 builds the order roster page a refund button needs to exist on.

Rejected alternatives, for the record: refund logic inside PayMock (a simulator smarter than Stripe is a dishonest simulation, and domain logic would leave the database's transaction boundary); a separate refunds service (ADR 0001 names cut points without exercising them prematurely — refunds are a payments-module concern); any queue upgrade (outbox + BullMQ already carry the async legs; no ADR 0003 criterion is touched). **New dependencies across all three codebases: zero.** One Prisma migration.

## Decisions

1. **Reclaim the goods first, settle the money second — the inverse mirror of purchase.** Buying: the provider confirms money moved, *then* tickets are issued. Refunding: tickets are voided and inventory restored in one transaction, *then* the provider confirms the money moved back. In each direction the system hands over its own asset only on confirmation, and each ledger settles where it is owned — seats in Postgres at request time, money at the provider via webhook. The alternative (void only when the webhook lands) leaves a window where the money is refunded but the ticket still scans at the door; blocking the door first means the failure mode is "retry sending the money", which is recoverable, instead of "claw back a seat someone else may already hold", which is not.
2. **Per-ticket refunds, price derived — no schema denormalization.** A ticket's refund value is the `unitPriceSatang` of its order's `OrderItem` matching its `ticketTypeId` (seated purchases already group into items per tier, so the lookup is total within an order). `Order.refundedSatang` accumulates on settlement; `refunded` vs `partially_refunded` is derived from comparing it to `totalSatang`.
3. **The `void` write-side finally lands.** `TicketStatus.void` has existed since M2 and is read in nine places — check-in rejects it, dashboards exclude it, and the hold-acquisition SQL (`tickets.status <> 'void'`) already returns a voided seat to sale automatically. Nothing has ever written it. M9 is the write-side the read-side has been waiting for; seated inventory restoration costs zero new code.
4. **Races are decided by conditional updates, in the M2 tradition.** Refund-vs-check-in is two writers to `Ticket.status`. Both already use / will use guarded updates (`where: { status: 'issued' }`); the refund transaction voids with `updateMany` and aborts with 409 if the count disagrees — someone was admitted mid-request. A dedicated e2e race test fires both concurrently and asserts exactly one winner.
5. **The webhook dispatcher is hardened first — it is currently a latent bug.** `payments.service.ts` dispatches with if/else: anything that is not `payment.succeeded` falls into `handleFailed`, and the controller never validates `type`. The day PayMock emits `payment.refunded`, today's API would *cancel the order and release everything as if payment failed*. The fix is an explicit switch — `succeeded` / `failed` / `refunded` — with unknown types acknowledged (200), logged, and counted, never guessed at. Rejecting unknowns would force a real provider into infinite retries; Stripe adds event types without asking.
6. **Refund requests are idempotent the same way orders are.** The REST endpoint takes an `Idempotency-Key` (unique on `Refund`); a replay returns the existing refund. Even without the key, a double-submit cannot double-refund: the second transaction finds the tickets no longer `issued` and 409s before any provider call. Webhook settlement dedups by `provider_event_id` exactly as payments do — PayMock's double-send tests this for free.
7. **Free tickets refund without a provider.** A free order has no `Payment` row and no intent. Voiding free tickets settles immediately in the request transaction (`Refund` born `succeeded`, amount 0, no PayMock call). This is the free-event organizer's "cancel their RSVP" feature, and it must not depend on a payment leg that never existed.
8. **Reads via GraphQL, the mutation via REST — each per its charter (ADR 0006).** The order roster is an organizer-dashboard read → a GraphQL query beside the existing attendee/analytics reads. The refund itself is a mutation → REST, like every other mutation in the system.

## Architecture

### Data (one migration)

- `Refund`: `id`, `orderId`, `providerRefundId?`, `amountSatang`, `status: pending | succeeded | failed`, `idempotencyKey? @unique`, `requestedById`, `createdAt`, `settledAt?`.
- `Ticket.refundId?` — FK; a ticket refunds at most once, so no join table.
- `Order.refundedSatang Int @default(0)`; `OrderStatus` gains `partially_refunded`, `refunded`.
- `Payment.status` is untouched — Stripe keeps the charge `succeeded` and hangs refund objects off it; so do we.

### The flow

1. `POST /api/events/:eventId/orders/:orderId/refunds` `{ ticketIds }` + `Idempotency-Key` (JWT, ownership check — 404 not 403, matching every other organizer route until M10 centralizes them).
2. Validate: order is `paid`/`partially_refunded` and belongs to the event; tickets belong to the order; amount = Σ matching `unitPriceSatang`.
3. **Transaction 1 (reclaim):** `updateMany` tickets `issued → void` + `refundId` — count mismatch aborts 409; GA `remaining` incremented per voided GA ticket; `Refund` created `pending` (or `succeeded` immediately when the amount is 0); outbox `seats.released` (live seat return in open browsers — the M2 event, reused) and `order.updated`.
4. After commit: call PayMock `POST /intents/{id}/refunds`. Synchronous failure → `Refund` marked `failed`; tickets **stay void** and the roster offers retry of the money leg. This compensation direction mirrors the purchase path's existing `createIntent`-after-commit handling, inverted.
5. PayMock validates (intent `succeeded`, cumulative refunds ≤ amount paid → else 409/422), records, responds `{ refundId, status }`, and dispatches `payment.refunded` **twice** with HMAC.
6. **Webhook (settle):** verify → dedup → transaction: `Refund pending → succeeded` (guarded), `Order.refundedSatang += amount`, order status derived, outbox `order.refunded` (buyer email via the existing notifications path) + `order.updated`.
7. Metrics: `refunds_total{result}` at the settle site; `webhook_events_total` picks up the new type with no change.

### Web

- **New:** `/organizer/events/[id]/orders` — the roster. Orders with buyer, items, totals, status; expandable tickets with per-ticket selection (only `issued` selectable); refund with a destructive-styled confirmation stating the amount; pending/failed-retry states. Linked from the Backstage Console.
- Console: revenue figures subtract `refundedSatang` (dashboard service currently sums `totalSatang` of paid orders and would silently overstate).
- Buyer: order page gains `refunded`/`partially_refunded` branches; voided tickets badge as void on the order page and My Tickets. QR of a void ticket stays visible but the door already rejects it (`checkin.service.ts` has thrown "Ticket is void" since M4).

## Deliverables

- `services/paymock` — refund endpoint + intent refund state + webhook dispatch, with Go table tests (validation matrix, double dispatch).
- `apps/api` — migration; refunds module (controller/service/DTO); payments dispatch switch + `refunds` settlement branch; dashboard revenue fix; GraphQL roster query; outbox/email/metric wiring; `openapi:dump` + contracts rebuild.
- `apps/web` — roster page; console link; order/ticket refund states; typed client regen.
- `tests/e2e` — one browser journey: organizer refunds a seated ticket, a second browser watches the seat turn `available` live, buyer's order shows refunded. (The M8 harness earning rent.)
- Jest e2e: full seated + GA refund cycles with forged-signed webhooks (pattern from M3's payments spec), duplicate-webhook idempotency, refund-after-check-in 409, concurrent check-in-vs-refund race (exactly one winner), free-order instant settle, over-refund rejection, replayed `Idempotency-Key`.
- Docs: ADR 0011 (reclaim-first/settle-second + the provider-honesty rule + rejected alternatives); `CONTEXT.md` vocabulary (Refund, Void, partially_refunded); scope-reversal edits in `README.md` and the original design spec, stating *why* the cut was revisited; runbook incident #7 — "refund stuck pending" (lost webhook: diagnose via `webhook_events_total` + Loki, remediate by PayMock re-send/reconcile); `APP_VERSION` → m9.

## Verification

- Full gate green (`lint typecheck build test`), all 41 existing jest e2e untouched and green, Go suites green.
- The new jest specs above; the forged-webhook payment tests updated for the dispatch switch without weakening.
- Browser suite: 8 journeys green twice consecutively; the refund journey's live-seat-return assertion watched to fail before trusted (invert the void), per the M8 discipline.
- Manual on production after deploy: refund a demo ticket end-to-end, seat returns, email arrives.

## Risks

- **Void-then-money-fails leaves tickets void with no refund sent.** Accepted deliberately (decision 1): the roster shows `failed` with retry; money-retry is recoverable, seat-clawback is not. The runbook entry covers the operator side.
- **Order-status enum growth touches every branch on it.** The web order page and dashboards switch on status; the migration forces those branches now, which is the point — grep-able, typed, and caught by typecheck.
- **Webhook hardening could break M3's forged-webhook tests.** They are updated in the same task as the switch, keeping the same forged-signature strictness.
- **Roster is net-new UI on the largest page budget.** Contained by reusing Backstage Console primitives (panels, stats, confirm patterns) — no new design system work.

## Rollout

PayMock first (the provider must exist before its caller), then the API (dispatch hardening → migration → refund service), then web, then the browser journey. Docs and scope-reversal edits land with the close. Every stage leaves `main` deployable.

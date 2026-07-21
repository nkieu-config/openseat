# ADR 0005: Build a fake payment vendor instead of wiring a test-mode gateway

Status: Accepted (2026-07-15)

## Context

M3 needs the hard parts of payments — asynchronous confirmation, signed webhooks, retries, duplicate delivery, expiry races — without moving real money. The obvious options were Stripe test mode (realistic but mostly glue code, needs vendor accounts, and its failure modes can't be scripted) or skipping payments entirely (loses the most interview-relevant backend surface in the roadmap).

## Decision

Ship **PayMock**, a ~400-line Go service that behaves like a hostile-but-honest payment provider: bearer-authenticated intent creation, a hosted payment page where the buyer chooses success or failure, and webhooks signed Stripe-style (`t=…,v1=HMAC-SHA256(secret, t.body)`) delivered with exponential-backoff retries. It deliberately **sends every webhook twice** so the consumer's idempotency is exercised on every single payment, in production, forever — not just in tests.

Go is the right tool here on purpose: the service is a small, well-bounded box (in-memory store, stdlib HTTP) where the concurrency-native webhook dispatcher is idiomatic, and a defect can never corrupt order data because the API trusts nothing PayMock says without a verified signature and a dedup check.

## Consequences

- The API's payment integration is vendor-shaped (intents, checkout redirect, webhooks), so swapping in Stripe/Omise later is a client change, not a redesign.
- Failure scenarios are scriptable: declined payments, duplicate events, delayed delivery — all demonstrable on demand.
- PayMock's state is in-memory by design; a restart forgets pending intents, which mirrors the "provider is a separate system you don't control" reality. Orders recover via expiry.
- On the free tier PayMock sleeps when idle; the first checkout of the day pays a cold-start. Acceptable for a demo, called out in the UI copy.
- **Amended 2026-07-22.** PayMock still sleeps, but it is no longer the buyer who wakes it: an event page with a paid, unsold ticket type fires one `no-cors` request at `/health` on mount (`ServiceWarmer`), so the ~22 s spin-up overlaps seat selection instead of blocking checkout. The same page wakes the Gate when the event is in drop mode. A cron ping was rejected: Render grants **750 free instance-hours per workspace per month** and suspends *every* free service once they are gone, so holding three services awake (~2,190 h) would take the whole demo down rather than cost money. Waking on demand spends hours only when someone is actually buying.

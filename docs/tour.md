# Read this repo in ten minutes

OpenSeat is a ticketing platform with real-time reserved seating, built to production standards as a portfolio project. This is the guided path: the pitch, the proof to open first, the code worth reading, and how the work was run.

## The thirty-second pitch

Create an event, share the link, let people pick their exact seat live. The hard part is correctness under concurrency — two people tapping one seat, a payment that settles asynchronously, a ten-thousand-person on-sale rush — and every one of those is solved with the boring, correct mechanism and a test that proves it.

## Open these three first

1. [The seat race](tests/e2e/specs/seat-race.spec.ts) — two real browsers reach for one seat; the loser sees it turn held, live, with no reload. The API-level version puts 50 buyers on one seat and asserts a single winner.
2. [The load report](docs/load-tests/gate-report.md) — the Go waiting room at ~13k joins/second, p95 < 20ms, zero errors.
3. [The cross-language trace](docs/observability/trace-web-to-gate.png) — one request whose browser span parents a span inside a Go service.

## The code worth reading

- **The seat map is hand-built SVG** — pan, zoom, hit-test, live seat states, no seat-map library: [`seat-picker.tsx`](apps/web/src/app/events/[slug]/seat-picker.tsx).
- **Holds live in the database, not in Redis** — `INSERT … ON CONFLICT DO NOTHING` in a transaction, a 7-minute TTL, expired-hold takeover, and a unique index on `(event_id, seat_id)` as the last-line backstop: [`holds.service.ts`](apps/api/src/holds/holds.service.ts), swept by [`hold-sweeper.service.ts`](apps/api/src/queues/hold-sweeper.service.ts).
- **The waiting room is Go** — a token-bucket admitter draining a Redis sorted set, minting a stateless admission JWT the API verifies itself: [`admitter.go`](services/gate/admitter.go), [`main.go`](services/gate/main.go).
- **Payments settle on a signed webhook** — a mock provider that signs over the raw body and deliberately double-sends, so idempotency is exercised forever: [`webhook.go`](services/paymock/webhook.go), [`signer.go`](services/paymock/signer.go).
- **Authorization is data, not a token claim** — a three-rank role ladder resolved per request, so removing a staffer takes effect on their next call: [`access.service.ts`](apps/api/src/access/access.service.ts).

## How the work was run

Each milestone is a spec in [docs/specs](docs/specs), an implementation plan in [docs/plans](docs/plans), and — where a decision had a tempting wrong answer — an [ADR](docs/adr). Commits are conventional; every milestone ends deployable. The domain language is fixed in [CONTEXT.md](CONTEXT.md): a *hold* is a hold, money is integer satang, time is UTC.

# Browser end-to-end suite

Seven Playwright journeys driving real Chromium against the real stack — web, API, PayMock, Gate, Postgres, Redis. Nothing is stubbed. See `docs/specs/2026-07-17-m8-browser-e2e-design.md` for the design and ADR 0010 for the decisions behind it.

## Run it

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm e2e
```

`pnpm e2e` builds the API and the web app first, then Playwright boots all four services itself. Postgres and Redis are the only things it expects to already be there.

Two things will surprise you the first time:

- **Stop `pnpm dev` first.** The suite refuses to run if anything is already listening on 3000, 4000, 4100, or 4200. That is deliberate — Playwright's usual `reuseExistingServer` identifies a server by whether anything answers on the port, and on this suite's very first run it reused an unrelated app and tested *that* instead. A busy port is now a loud failure.
- **It reseeds.** `globalSetup` runs `db:seed`, which hard-deletes and recreates both demo events. Local demo-event state does not survive a run.

## Layout

```
fixtures/   locale-pinned contexts, demo auth, seat locators, guest checkout, Gate helpers
specs/      one file per journey
```

| Spec | What it proves |
|---|---|
| `seated-purchase` | The money path: seat → hold → PayMock → webhook → paid → ticket. Crosses every service. |
| `seat-race` | Two browsers, one seat. The loser watches it turn held over the socket, then is refused — and a buyer whose live update never arrives earns a real 409. |
| `payment-failure` | A declined payment cancels the order and frees the seat immediately, not after the expiry window. |
| `ga-rsvp` | Free general admission, guest checkout, no account, no payment leg. |
| `waiting-room` | A visitor queues behind a crowd, watches their position over SSE, and is let in by the token bucket. |
| `check-in` | A ticket scans in once; the second scan is refused. |

## Reading a failed run

Playwright writes a trace on the first retry and a video on failure. Locally:

```bash
pnpm --filter @openseat/e2e exec playwright show-trace tests/e2e/test-results/<spec>/trace.zip
```

In CI the job uploads `playwright-report` as an artifact on failure — download it and run `npx playwright show-report`. A red CI run should arrive with the replay attached; you should never have to reproduce it by hand.

The suite also drops an `error-context.md` next to each failure containing an accessibility snapshot of the page at the moment it broke. That file is usually faster than the video: it shows what the test could actually see.

## Conventions worth knowing before editing

- **Locate by role and name, never `data-testid`.** If a control cannot be found that way, the fix belongs in the markup — a screen reader has the same problem.
- **Seat locators anchor on the label prefix.** A seat's accessible name carries its status (`Front A1 — available` → `Front A1 — yours`), so a locator built on the full name goes stale exactly when the test gets interesting. Use `seat()` / `expectSeatStatus()` from `fixtures/seats.ts`.
- **`workers: 1` is load-bearing.** Every spec shares one seat inventory.
- **Watch a spec fail before trusting it.** Every assertion here was inverted once during development. Two specs passed for the wrong reason until a deliberate wait was added — see ADR 0010.

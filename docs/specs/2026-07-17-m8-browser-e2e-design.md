# M8 — Browser end-to-end ("Prove it in the browser")

Status: Approved (2026-07-17)

## Goal

Every claim this product makes is currently proven one layer below the user. The jest suites prove the API upholds its invariants; the k6 report proves the Gate absorbs a spike; M7 proves the system can be operated. Nothing proves that a **person with a browser** can find a seat, pay for it, and get in — or that when two of them reach for the same seat, the loser sees the seat turn red instead of a stack trace.

M8 closes that. Six Playwright journeys drive real Chromium against the real stack — web, API, PayMock, Gate, Postgres, Redis — and run on every pull request. After M8, "the demo works" is a CI badge rather than a promise.

## Non-goals

- **Cross-browser matrix.** Chromium only. This is not a browser-compatibility showcase, and Firefox/WebKit runs would triple CI time to guard a risk this product does not have.
- **Visual regression / screenshot diffing.** Brittle against a design system that already enforces tokens, and it fails for reasons that are not defects.
- **The seat-map editor's drag-and-drop.** High effort, low signal: pointer-drag emulation over an SVG canvas is the flakiest thing we could write, and the materialization it drives is already covered by API tests.
- **Google sign-in.** Real Google credentials in CI would leak into logs on every run. The ID-token path is covered by jest with a spied verifier (ADR 0008).
- **Replacing the jest API suites.** Different layer, different failure modes. Both stay. Browser tests are the expensive ones; they cover journeys, not permutations.
- **Testing against production.** The suite mutates seat inventory and issues tickets. It runs against a disposable stack, never the deployed one.

## Decisions

1. **Locate by accessible role and name — no `data-testid`.** The web app has zero test ids today, but M6's accessibility pass left something better: seats are `<rect role="button" aria-label="Front A1 — available">`, GA steppers are `aria-label="Add one General admission"`. Tests use `getByRole`. This adds nothing to production markup, and it means the suite **doubles as an accessibility assertion** — if Playwright can find a control by role and name, so can a screen reader. The cost is coupling to copy, which decision 2 contains.
2. **Pin the locale.** Public-page copy comes from the i18n dictionary, selected by the `os_locale` cookie (`en` default, `th` available). Every browser context sets `os_locale=en`, so a Thai translation can never redden the suite.
3. **Regex-prefix the seat locators.** A seat's accessible name carries its status — `Front A1 — available` becomes `Front A1 — yours` the moment it is held. A locator built on the full name goes stale mid-journey by design. Tests match `/^Front A1 —/` and assert the status separately, which is also how the status assertions become explicit rather than incidental.
4. **The suite is its own workspace package, `tests/e2e`.** It drives four services; it is not a test of `apps/web`. This adds a `tests/*` glob to `pnpm-workspace.yaml`. Its script is named `e2e`, **not** `test`, so the `quality` CI job's `turbo run test` — which has no stack behind it — never tries to launch a browser.
5. **Serial by default (`workers: 1`).** The suite shares one database and one seat inventory; two specs reaching for `Front A1` in parallel would fight over the very invariant under test. This matches the API suite's existing `maxWorkers: 1`. The trade-off is wall clock, accepted at six journeys. Parallelism would mean partitioning seats per spec — recorded in the ADR as the move if the suite grows.
6. **`globalSetup` reseeds.** `db:seed` hard-deletes and recreates both demo events, which is exactly the reset a repeatable suite needs. Consequence: running the suite locally discards demo-event state. Documented, and harmless in CI where the database is disposable.
7. **Production build, not the dev server.** `next start` over `next dev` — it is what ships, and on-demand compilation makes first-navigation timing flaky enough to matter at `workers: 1`.
8. **No inter-test dependencies.** The check-in journey does not consume the purchase journey's ticket. It issues its own through the free GA path via the API, then drives the scanner UI. Each spec sets up what it needs; a failure in one never cascades.
9. **PayMock stays in the loop.** Its pay page is a real HTML form with `Pay ฿1,500` and `Simulate a failed payment` buttons, and its webhooks are real, asynchronous, and deliberately double-sent. Stubbing it would delete the most interesting seam in the system.

## Architecture

### Package layout

```
tests/e2e/
├── playwright.config.ts     webServer × 4, workers: 1, chromium
├── global-setup.ts          reseed
├── fixtures/
│   ├── auth.ts              storageState via POST /api/demo/login
│   ├── api.ts               resolve event by slug, issue a GA ticket
│   └── seats.ts             seat locator + status helpers
└── specs/
    ├── seated-purchase.spec.ts
    ├── seat-race.spec.ts
    ├── payment-failure.spec.ts
    ├── ga-rsvp.spec.ts
    ├── waiting-room.spec.ts
    └── check-in.spec.ts
```

`playwright.config.ts` starts all four services through Playwright's `webServer` array — API `:4000`, web `:3000`, PayMock `:4100`, Gate `:4200` — so `pnpm e2e` works identically on a laptop with the compose stack up and in CI. Postgres and Redis stay external: compose locally, service containers in CI.

### Fixtures

- **Auth.** `POST /api/demo/login` takes `{ role: 'buyer' | 'organizer' }` and returns an access token plus a refresh cookie. It is not env-gated, so it works in any environment with a seeded database. Contexts are built from that stored state rather than by typing into the login form — not as a shortcut, but because the seeded demo users have `passwordHash: null` and **cannot** log in through the UI at all. The honest consequence: the password login form is not exercised by these six journeys. It stays covered at the API layer by the jest auth suite, and `ga-rsvp` runs as a guest with no account, so the unauthenticated path is real. Covering the form itself would mean registering a throwaway user through the UI — a worthwhile seventh journey, deliberately not in this milestone's scope.
- **Data resolution.** Slugs (`bangkok-indie-fest`, `midnight-drop`) are stable across reseeds; **every id is regenerated**. Nothing is hardcoded — helpers resolve ids by slug through the API.
- **Seats.** `seat(page, 'Front A1')` returns the role-based locator; `expectSeatStatus(page, 'Front A1', 'held')` asserts on the accessible name's suffix.

### The six journeys

| Spec | Path through the system | The assertion that matters |
|---|---|---|
| `seated-purchase` | seat picker → hold → order → PayMock pay → webhook → paid | A ticket with a QR exists and the seat reads `sold`. Crosses web, API, PayMock, Postgres, and an async webhook. |
| `seat-race` | two browser contexts, one seat | B watches A's seat turn `held` **without reloading**, then B's click is refused. |
| `payment-failure` | seat → order → `Simulate a failed payment` | The order never reaches `paid`, and the seat returns to `available` — released in the failed-webhook transaction, not after the payment window. |
| `ga-rsvp` | stepper → claim → tickets | Free GA issues tickets with no payment leg. Guest checkout, no account. |
| `waiting-room` | join queue → SSE position → admitted → checkout | The admission token gates checkout, and the Gate's token bucket (`ADMIT_BATCH=3` / `ADMIT_INTERVAL_MS=2000`) admits a lone visitor within ~2s. |
| `check-in` | paste QR token → checked in → paste again | Rescan answers `already_checked_in`. Uses the scanner's manual input (`Scan or paste a ticket QR token`), so no camera emulation. |

**`seat-race` is the point of the milestone.** M2's jest race test proves fifty concurrent requests yield one winner — that the database constraint holds. It cannot show what the loser *sees*. This spec drives two real browsers at one seat and asserts that the losing user gets a live update and a refusal, which is the difference between "the invariant holds" and "the product behaves".

### CI

A new `browser` job, parallel to `quality` / `integration` / `paymock` / `gate`:

Postgres + Redis service containers · setup-node + pnpm + **setup-go** (PayMock and Gate are Go) · install · `db:generate` → `db:migrate:deploy` → `db:seed` · cached Playwright Chromium download · `turbo run build` for api + web · `pnpm --filter @openseat/e2e e2e` · upload the HTML report as an artifact **on failure**.

`retries: 2` in CI, `0` locally: a retry in CI is cheaper than a human re-running a flake, while locally a retry would hide a real race from the person who just wrote it. `trace: 'on-first-retry'` and `video: 'retain-on-failure'` mean a red CI run arrives with a replay attached.

## Configuration

All four services run on localhost, so the wiring is defaults plus the shared secrets. The three that will not be obvious in six months:

- **`WEB_ORIGIN=http://localhost:3000`** — the API's CORS allowlist. The page reaches the API same-origin through the Next rewrite, *but* the realtime socket and the Gate's SSE stream connect directly to their origins (ADR 0004). Without this, the seat-race and waiting-room journeys fail for a reason that looks nothing like CORS.
- **`API_PUBLIC_URL=http://localhost:4000`** — where PayMock posts its webhooks. Wrong here means the purchase journey hangs at `awaiting_payment` forever.
- **`NEXT_PUBLIC_API_ORIGIN` / `NEXT_PUBLIC_GATE_ORIGIN`** — inlined at **build** time, not run time. They must be set before `next build`, not just before `next start`.

`PAYMOCK_WEBHOOK_SECRET` and `GATE_ADMISSION_SECRET` must match on both sides of each pair; the dev defaults (`paymock-dev-webhook-secret`, `gate-dev-admission-secret`) already agree and CI's `integration` job already uses them.

`NEXT_PUBLIC_GATE_ORIGIN` is **missing from `apps/web/.env.example`** — the web app reads it with a `http://localhost:4200` fallback, so the omission is invisible until someone changes the Gate's port. M8 fixes it.

## Deliverables

- `tests/e2e` — package, Playwright config, global setup, three fixture modules, six specs.
- `.github/workflows/ci.yml` — the `browser` job.
- `docs/adr/0010-browser-tests-locate-by-role.md` — accessible locators over test ids, and serial execution: what each buys, what each costs, and what would change the answer.
- `tests/e2e/README.md` — how to run it, why the suite reseeds, how to read a failed run's trace.
- `apps/web/.env.example` — `NEXT_PUBLIC_GATE_ORIGIN`.
- Root `package.json` — a `pnpm e2e` script delegating to the package, so the suite is reachable the same way as every other gate.
- `CLAUDE.md` — `pnpm e2e` alongside the existing commands.

## Verification

- Six specs green locally against the compose stack, and green in CI on the pull request that introduces them.
- `pnpm turbo run lint typecheck build test` stays green — the new package is linted and typechecked, and `turbo run test` does **not** pick up the browser suite.
- The suite is repeatable: two consecutive runs pass without manual cleanup.
- Every spec is watched to fail before it is trusted. During development each assertion is inverted once — a green test that has never been red may be asserting nothing, and a browser suite is the easiest place in this codebase to write a test that passes vacuously.

## Risks

- **Realtime timing.** The seat batcher flushes every ~250ms, so `seat-race` asserts on state that arrives asynchronously. Playwright's auto-waiting expectations handle this correctly; polling loops would not. The risk is writing the assertion wrong, not the timing itself.
- **~~The canceled-order UI.~~** Retired before implementation. The concern was that a failed payment produces `canceled` while the order page only branched on `awaiting_payment`/`paid`/`expired`. Reading the page settled it: it already renders "This order was canceled" and toasts "The payment was declined — your order was canceled". `payment-failure` therefore asserts existing behaviour rather than discovering a gap. Recorded because a risk disproved by reading the code is worth exactly as much as one confirmed.
- **CI wall clock.** The job builds two apps and downloads a browser. Mitigated by the existing turbo cache and a Playwright browser cache; it runs parallel to the other jobs, so the pull request's total time moves only if this becomes the slowest one.
- **Reseed versus a live API.** `globalSetup` reseeds while nothing is running; Playwright starts the services afterwards. Reversing that order would race the hold sweeper against the delete.

## Rollout

Land the harness and one journey first — package, config, fixtures, `seated-purchase` — and get it green in CI. A working harness with one real journey de-risks the other five, which are then additive and independently reviewable. `seat-race` comes second, because it is the one the whole milestone exists for.

# ADR 0010: Browser tests locate by role, run serially, and own their stack

Status: Accepted (2026-07-17)

## Context

Through M7 every claim this product makes was proven one layer below the user. The jest suites prove the API upholds its invariants; the k6 report proves the Gate absorbs a spike; the Grafana dashboard proves the system can be operated. Nothing proved that a person with a browser could find a seat, pay for it, and get in.

M8 adds seven Playwright journeys driving real Chromium against the real stack — web, API, PayMock, Gate, Postgres, Redis — on every pull request. Three questions had to be answered before writing the first spec: how tests find things, how many run at once, and which servers they talk to. The third turned out to be the one that mattered.

## Decision

**Locate by accessible role and name — never `data-testid`.** The app had zero test ids, and M6's accessibility pass had already left every control with a role and an accessible name: seats are `<rect role="button" aria-label="Front A1 — available">`, steppers are `aria-label="Add one General admission"`. So the suite adds nothing to production markup, and it **doubles as an accessibility assertion** — if Playwright can find a control the way a screen reader would, a screen reader can too. The cost is coupling to copy, contained two ways: every context pins `os_locale=en`, and seat locators anchor on the label prefix (`/^Front A1 —/`) because a seat's accessible name carries its status and would otherwise go stale the moment the test got interesting.

**Serial execution (`workers: 1`).** Every spec shares one seat inventory. Parallel specs would contend for the very invariant under test, and a red run would be indistinguishable from the bug it was meant to catch. This matches the API suite's existing `maxWorkers: 1`. The cost is wall clock, accepted at seven journeys (~21s).

**The suite owns its stack — `reuseExistingServer: false`, against Playwright's own default.** This is the decision that was discovered rather than designed. The documented default is `!process.env.CI`, and on its first run it reused an unrelated Next.js app already listening on port 3000 and asserted against that app's login page. Playwright identifies a server by whether *anything* answers on the port; that is liveness, not identity. A busy port is now a loud startup failure instead of a silent wrong-application test. The cost: `pnpm dev` cannot be running during a local `pnpm e2e`.

**`pnpm e2e` builds the web app itself, with the API origin pinned to localhost.** The same class of bug, found twice. `next.config.ts` resolves the proxy target when `rewrites()` runs — at **build** time — and bakes it into `routes-manifest.json`; setting `API_PROXY_TARGET` for `next start` does nothing. Without it the build defaults to the deployed Render URL, and the suite issued its requests against **production**: `/api/auth/refresh` answered 401 from the live API, and seat-map lookups 404'd because production has never heard of a locally seeded event id. `turbo.json` now declares `API_PROXY_TARGET` and the two `NEXT_PUBLIC_*` origins as build inputs, so a bundle aimed at localhost and one aimed at Render cannot share a cache entry.

**`globalSetup` reseeds.** `db:seed` hard-deletes and recreates both demo events, which is exactly the reset a repeatable suite needs. Consequence: running the suite locally discards demo-event state.

**PayMock is not stubbed.** Its pay page is a real form and its webhooks are real, asynchronous, and deliberately double-sent. Stubbing them would delete the most interesting seam in the system.

## Consequences

- The suite found a live production bug on the day it landed, before a single spec went green: the seat map captured the pointer on `pointerdown`, which retargets the compatibility mouse events, so `click` fired on the `<svg>` instead of the `<rect>` and **picking a seat with a mouse did nothing at all**. Only keyboard selection worked — which is why it survived every manual pass, and why "the accessible path works" is not the same claim as "the product works".
- Locators are copy-coupled. A Thai translation cannot redden the suite (the locale is pinned), but an English rewording of a button will, and that is the trade accepted in exchange for testing what the user perceives.
- Two of the seven specs are deliberately timing-aware rather than timing-lucky. The stale-buyer spec blocks a websocket and then waits six realtime batches before asserting staleness; the check-in spec waits out the scanner's 2.5s same-token debounce. Both were written first without those waits and passed for the wrong reason. A wait that makes a test fail when removed is an assertion, not padding.
- The browser job runs parallel to the existing jobs, so a pull request's total time moves only if it becomes the slowest.

## When this would change

A second writer to the same inventory — a parallel CI shard, a shared staging database — breaks the `workers: 1` assumption; per-spec seat partitioning is the answer, not per-spec databases. If `data-testid` ever becomes necessary, that is a signal the accessible names have decayed, and the fix belongs in the markup rather than the tests. And if the app ever needs the proxy target to differ at run time rather than build time, the rewrite has to move out of `next.config.ts` and into a route handler.

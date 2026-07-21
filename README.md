# OpenSeat

Open ticketing with real-time reserved seating — create an event, share the link, and let people pick their exact seat. Built to survive on-sale rushes without ever double-selling a seat.

![Two buyers, one seat: a hold appearing live across browsers](docs/media/hero.gif)

**Live**: [openseat-ticket.vercel.app](https://openseat-ticket.vercel.app) · [API health](https://openseat-api.onrender.com/api/health) · [API docs](https://openseat-api.onrender.com/api/docs)

> **Status: complete — eleven milestones, each shipped deployable.** OpenSeat was built in two acts. **Build** (M0–M6) shipped the product: reserved seating under concurrency, async payments over a Go payment simulator, a waiting room for on-sale drops, and a drag-and-drop seat-map editor. **Harden** (M7–M10) turned the demo into a system: OpenTelemetry observability, a browser end-to-end suite on every PR, organizer-triggered refunds, and per-event team RBAC read from the database.

## Why this project exists

OpenSeat is a portfolio project built like a product. It deliberately takes on the hard parts of ticketing:

- **Inventory correctness under concurrency** — two people tap the same seat; exactly one wins, always
- **Asynchronous payments** — a mock provider (built in Go) with signed webhooks, retries, and failure injection
- **Surge traffic** — a waiting room in front of checkout, proven with published k6 load tests
- **A frontend that pulls its weight** — live seat maps rendered with a hand-built SVG engine, and a drag-and-drop seat-map editor

<img src="docs/media/seat-map.png" width="600" alt="A public event page with the live seat map: available, held, and sold seats marked on a hand-built SVG floor plan">

Every technology choice has a written rationale with trade-offs — see [docs/adr](docs/adr) and the [design spec](docs/specs/2026-07-15-openseat-design.md).

## Proof, not claims

- **No double-selling, proven two ways** — an API race test puts 50 buyers on one seat and exactly one wins; a [two-browser Playwright journey](tests/e2e/specs/seat-race.spec.ts) shows the loser's seat turn red, not crash.
- **The surge is load-tested** — the Go waiting room absorbs [~13,000 joins/second at p95 < 20ms with zero errors](docs/load-tests/gate-report.md).
- **One request, traced across languages** — a browser fetch parents a span inside the Go gate over W3C traceparent ([the trace](docs/observability/trace-web-to-gate.png), [dashboard](docs/observability/dashboard.png)).
- **The whole demo runs in CI** — 80+ API integration tests plus 9 browser journeys on every pull request.
- **Every decision is written down** — 15 [ADRs](docs/adr) and a spec per milestone, each ending deployable.

## Architecture at a glance

| Component | Tech | Role |
|---|---|---|
| `apps/web` | Next.js (App Router), Tailwind, shadcn/ui | Public event pages (SSR), seat-map viewer/editor, checkout, organizer dashboard |
| `apps/api` | NestJS modular monolith | REST + OpenAPI, read-only GraphQL for the dashboard, Socket.IO realtime, BullMQ workers |
| `services/paymock` | Go | Simulated payment vendor: intents, hosted pay page, signed webhooks with retries |
| `services/gate` | Go (M5) | Waiting-room front door: Redis queue, SSE positions, stateless admission JWTs |
| Data | PostgreSQL (Prisma 7), Redis | Postgres is the single source of truth (incl. transactional outbox); Redis does jobs, fanout, rate limits, queues |

The web app renders both surfaces of the product. Here is the organizer's **Backstage Console** — live KPIs, a sales sparkline, tier faders, and an occupancy heatmap:

<img src="docs/media/console.png" width="600" alt="The Backstage Console: live sales KPIs, a sales-over-time sparkline, per-tier price faders, and an occupancy heatmap">

...and the drag-and-drop **seat-map editor**, where an organizer lays out sections seat by seat — hand-built SVG, undo/redo, no library:

<img src="docs/media/seatmap-editor.png" width="600" alt="The drag-and-drop seat-map editor with two sections placed on the canvas and the seat inspector open">

Key invariant: `tickets` carries a unique constraint on `(event_id, seat_id)` — even a buggy code path cannot sell one seat twice. See [ADR 0002](docs/adr/0002-db-authoritative-holds.md).

## Local development

Prerequisites: Node 22+, pnpm 11+, Go 1.26+, Docker.

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm --filter api db:generate
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm dev
```

`pnpm dev` runs all four services together — the Next.js web app, the NestJS API, and both Go services:

- Web: http://localhost:3000
- API: http://localhost:4000/api/health · Swagger at http://localhost:4000/api/docs
- PayMock (payment simulator): http://localhost:4100 — every paid checkout goes through it
- Gate (waiting room): http://localhost:4200 — the drop event queues here
- Mailpit (local email): http://localhost:8025 — ticket emails and QR codes land here

The web app has to get port 3000. `WEB_ORIGIN` is the API's CORS allowlist and the browser opens the realtime socket straight at the API origin, so if Next falls back to 3001 the pages still render while live seat updates stop.

Open http://localhost:3000 and use the demo buttons on the landing page — buyer, organizer, and staff each sign in with one click, no registration.

### Run it with only Docker

If you would rather not install Node, pnpm, and Go, the whole product also builds as four images and comes up with one command:

```bash
docker compose -f infra/docker-compose.full.yml up --build
```

Postgres, Redis, and Mailpit start first; a one-shot `migrate` service applies the migrations and seeds the demo data; then the API, both Go services, and the web app come up behind health checks. Same URLs as above. `docker compose -f infra/docker-compose.full.yml down -v` removes it all, database included.

This is a demonstration path, not the dev loop — the images are production builds with no file watching, so `pnpm dev` stays the way to work on the code. The images are what the ECS migration in [docs/aws-production.md](docs/aws-production.md) would deploy.

Quality gates (same commands CI runs):

```bash
pnpm turbo run lint typecheck build test
pnpm --filter api test:e2e
```

## Roadmap

The first act — *build*:

| Milestone | Ships |
|---|---|
| **M0 — Foundation** ✅ | Turborepo monorepo, Docker Compose stack, CI, deploy skeleton, ADRs |
| **M1 — Events & free tickets** ✅ | Auth with rotating refresh tokens + guest checkout, SSR event pages, atomic GA inventory (100-buyer race test), QR e-tickets by email, OpenAPI-generated client, demo mode |
| **M2 — Reserved seating** ✅ | Live seat map (hand-built SVG with pan/zoom), 7-minute holds with countdown and takeover, Socket.IO + Redis fanout, BullMQ hold sweeper, 50-buyer seat race test, partial-unique DB backstop |
| **M3 — Payments** ✅ | PayMock payment simulator in Go (signed + duplicated webhooks), awaiting_payment state machine with 15-minute expiry, transactional outbox for email/realtime effects, webhook dedup proven by e2e |
| **M4 — Organizer console** ✅ | "Backstage Console" design language, sales analytics + timeline, occupancy heatmap, attendee CSV export, read-only GraphQL layer, QR check-in scanner (concurrent double-scan proven) |
| **M5 — Waiting room** ✅ | Go **Gate** service (Redis queue, SSE positions, token-bucket admitter), stateless admission JWTs the API verifies itself, k6 load report (~13k joins/s), Simulate Crowd |
| **M6 — Seat-map editor** ✅ | Drag-and-drop seat-map editor (hand-built SVG, undo/redo), EN/TH i18n on the landing and waiting-room flows, light-theme audit, [AWS production doc](docs/aws-production.md), [demo video script](docs/demo-script.md) |

<img src="docs/media/waiting-room.png" width="600" alt="The drop-mode waiting room showing a buyer's live queue position and the Simulate Crowd control">

The second act — *harden*:

| Milestone | Ships |
|---|---|
| **M7 — Observability** ✅ | OpenTelemetry traces/metrics/logs to Grafana Cloud, domain funnel dashboard, a cross-language browser→Gate trace, 5xx alerting ([ADR 0009](docs/adr/0009-observability-otel-grafana-cloud.md)) |
| **M8 — Browser end-to-end** ✅ | Playwright journeys driving all four services, located by accessible role, green on every PR ([ADR 0010](docs/adr/0010-browser-tests-locate-by-role.md)) |
| **M9 — Refunds** ✅ | Organizer-triggered refunds that reclaim the seat live and settle on the provider's webhook ([ADR 0011](docs/adr/0011-refunds-reclaim-first.md)) |
| **M10 — Team RBAC** ✅ | Per-event owner/manager/staff, a role ladder read from the database so revocation is instant ([ADR 0012](docs/adr/0012-event-team-rbac.md)) |

<img src="docs/media/team-panel.png" width="600" alt="The event team panel: a linked staff member and a pending manager invitation awaiting registration">

Deliberately out of scope: real-money processing, ticket resale, native mobile apps.

## Walk the demo in 2 minutes

No sign-up — the landing page has one-tap demo entry.

1. **As a buyer** — open the demo event, pick a seat on the live map, and pay on the PayMock page; your QR ticket lands on the order page.
2. **As the organizer** — open the Backstage Console for live sales, occupancy, and the door scanner; refund a seat and watch it return to sale.
3. **As door staff** — the same console, walled to the door: check-ins only, no revenue, no refunds.

## Where to look next

- [docs/tour.md](docs/tour.md) — read this repo well in ten minutes
- [Design spec](docs/specs/2026-07-15-openseat-design.md) and per-milestone specs in [docs/specs](docs/specs)
- [ADRs](docs/adr) — why each decision went the way it did
- [CONTEXT.md](CONTEXT.md) — the project's ubiquitous language

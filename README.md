# OpenSeat

Open ticketing with real-time reserved seating — create an event, share the link, and let people pick their exact seat. Built to survive on-sale rushes without ever double-selling a seat.

**Live**: [openseat-ticket.vercel.app](https://openseat-ticket.vercel.app) · [API health](https://openseat-api.onrender.com/api/health) · [API docs](https://openseat-api.onrender.com/api/docs)

> Status: **M4 — Organizer console, live**. Organizers get a "Backstage Console" — live sales analytics, an occupancy heatmap on the real seat map, attendee CSV export, and a QR check-in scanner — with dashboard reads served over a read-only GraphQL layer (see [ADR 0006](docs/adr/0006-graphql-read-only-dashboard.md)). Everything before it still works: hold a seat at the [demo event](https://openseat-ticket.vercel.app/events/bangkok-indie-fest), pay with fake money through **PayMock**, and watch the order flip to paid in realtime.

## Why this project exists

OpenSeat is a portfolio project built like a product. It deliberately takes on the hard parts of ticketing:

- **Inventory correctness under concurrency** — two people tap the same seat; exactly one wins, always
- **Asynchronous payments** — a mock provider (built in Go) with signed webhooks, retries, and failure injection
- **Surge traffic** — a waiting room in front of checkout, proven with published k6 load tests
- **A frontend that pulls its weight** — live seat maps rendered with a hand-built SVG engine, and eventually a drag-and-drop seat-map editor

Every technology choice has a written rationale with trade-offs — see [docs/adr](docs/adr) and the [design spec](docs/specs/2026-07-15-openseat-design.md).

## Architecture at a glance

| Component | Tech | Role |
|---|---|---|
| `apps/web` | Next.js (App Router), Tailwind, shadcn/ui | Public event pages (SSR), seat-map viewer/editor, checkout, organizer dashboard |
| `apps/api` | NestJS modular monolith | REST + OpenAPI, read-only GraphQL for the dashboard, Socket.IO realtime, BullMQ workers |
| `services/paymock` | Go | Simulated payment vendor: intents, hosted pay page, signed webhooks with retries |
| `services/gate` | Go (M5) | Waiting-room front door: Redis queue, SSE positions, stateless admission JWTs |
| Data | PostgreSQL (Prisma 7), Redis | Postgres is the single source of truth (incl. transactional outbox); Redis does jobs, fanout, rate limits, queues |

Key invariant: `tickets` carries a unique constraint on `(event_id, seat_id)` — even a buggy code path cannot sell one seat twice. See [ADR 0002](docs/adr/0002-db-authoritative-holds.md).

## Local development

Prerequisites: Node 22+, pnpm 11+, Docker.

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm --filter api db:generate
pnpm --filter api db:migrate
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/health · Swagger at http://localhost:4000/api/docs
- Mailpit (local email): http://localhost:8025

Quality gates (same commands CI runs):

```bash
pnpm turbo run lint typecheck build test
pnpm --filter api test:e2e
```

## Roadmap

| Milestone | Ships |
|---|---|
| **M0 — Foundation** ✅ | Turborepo monorepo, Docker Compose stack, CI, deploy skeleton, ADRs |
| **M1 — Events & free tickets** ✅ | Auth with rotating refresh tokens + guest checkout, SSR event pages, atomic GA inventory (100-buyer race test), QR e-tickets by email, OpenAPI-generated client, demo mode |
| **M2 — Reserved seating** ✅ | Live seat map (hand-built SVG with pan/zoom), 7-minute holds with countdown and takeover, Socket.IO + Redis fanout, BullMQ hold sweeper, 50-buyer seat race test, partial-unique DB backstop |
| **M3 — Payments** ✅ | PayMock payment simulator in Go (signed + duplicated webhooks), awaiting_payment state machine with 15-minute expiry, transactional outbox for email/realtime effects, webhook dedup proven by e2e |
| **M4 — Organizer console** ✅ | "Backstage Console" design language, sales analytics + timeline, occupancy heatmap, attendee CSV export, read-only GraphQL layer, QR check-in scanner (concurrent double-scan proven) |
| M5 — Waiting room | Go gate service, admission tokens, k6 load-test report, Simulate Crowd demo |
| M6 — Seat-map editor | Drag-and-drop editor, i18n (EN/TH), demo video, AWS production architecture doc |

Deliberately out of scope: real money and refunds, ticket resale, organizer team RBAC, native mobile apps.

## Documentation

- [Design spec](docs/specs/2026-07-15-openseat-design.md) — the approved system design
- [ADRs](docs/adr) — why each significant decision went the way it did
- [CONTEXT.md](CONTEXT.md) — the project's ubiquitous language

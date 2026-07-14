# OpenSeat

Open ticketing with real-time reserved seating — create an event, share the link, and let people pick their exact seat. Built to survive on-sale rushes without ever double-selling a seat.

> Status: **M0 — Foundation**. The monorepo, CI, local stack, and deploy skeleton are in place; product features land milestone by milestone (roadmap below).

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
| M1 — Events & free tickets | Auth + guest checkout, event pages (SSR), atomic GA inventory, QR e-tickets by email |
| M2 — Reserved seating | Live seat maps (custom SVG), holds with countdown, Socket.IO + Redis, race-condition test suite |
| M3 — Payments | PayMock (Go), order state machine, transactional outbox, idempotent checkout, webhook dedup |
| M4 — Organizer dashboard | Sales analytics, occupancy heatmap, CSV export, read-only GraphQL, QR check-in |
| M5 — Waiting room | Go gate service, admission tokens, k6 load-test report, Simulate Crowd demo |
| M6 — Seat-map editor | Drag-and-drop editor, i18n (EN/TH), demo video, AWS production architecture doc |

Deliberately out of scope: real money and refunds, ticket resale, organizer team RBAC, native mobile apps.

## Documentation

- [Design spec](docs/specs/2026-07-15-openseat-design.md) — the approved system design
- [ADRs](docs/adr) — why each significant decision went the way it did
- [CONTEXT.md](CONTEXT.md) — the project's ubiquitous language

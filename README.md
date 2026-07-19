# OpenSeat

Open ticketing with real-time reserved seating — create an event, share the link, and let people pick their exact seat. Built to survive on-sale rushes without ever double-selling a seat.

**Live**: [openseat-ticket.vercel.app](https://openseat-ticket.vercel.app) · [API health](https://openseat-api.onrender.com/api/health) · [API docs](https://openseat-api.onrender.com/api/docs)

> Status: **M6 — Complete**. The final milestone adds a drag-and-drop **seat-map editor** (hand-built SVG, undo/redo, no library), **EN/TH internationalization** on the public pages, a **light-theme** pass, and an [AWS production architecture doc](docs/aws-production.md). All six milestones are live and documented. Browse the [demo](https://openseat-ticket.vercel.app), design a room from the organizer console, or join the [Midnight Drop](https://openseat-ticket.vercel.app/events/midnight-drop) waiting room and "Simulate a crowd."

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
| **M5 — Waiting room** ✅ | Go **Gate** service (Redis queue, SSE positions, token-bucket admitter), stateless admission JWTs the API verifies itself, k6 load report (~13k joins/s), Simulate Crowd |
| **M6 — Seat-map editor** ✅ | Drag-and-drop seat-map editor (hand-built SVG, undo/redo), EN/TH i18n on public pages, light-theme audit, [AWS production doc](docs/aws-production.md), [demo video script](docs/demo-script.md) |

Deliberately out of scope: real-money processing, ticket resale, native mobile apps. (Refunds and organizer team RBAC were originally cut here; M9 and M10 revisited them once the product claimed production extensibility. Refunds are now organizer-triggered, reclaiming the seat live and settling on the provider's webhook — [ADR 0011](docs/adr/0011-refunds-reclaim-first.md). An event's owner now staffs a per-event team of managers and staff, gated by a role ladder read from the database so revocation is instant — [ADR 0012](docs/adr/0012-event-team-rbac.md).)

## Documentation

- [Design spec](docs/specs/2026-07-15-openseat-design.md) — the approved system design
- [ADRs](docs/adr) — why each significant decision went the way it did
- [CONTEXT.md](CONTEXT.md) — the project's ubiquitous language

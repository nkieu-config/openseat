# OpenSeat — Design Specification

Date: 2026-07-15
Status: Approved

## Context

OpenSeat is a portfolio-grade, production-shaped ticketing platform with real-time reserved seating. It exists to demonstrate balanced full-stack engineering: a frontend complex enough to stand on its own (interactive seat maps, live updates, an eventual drag-and-drop seat-map editor) and a backend built around the hard problems of ticketing (inventory correctness under concurrency, asynchronous payments, surge traffic).

The product is genuinely usable: anyone can create an event with free tickets and reserved seating and run it for a meetup, university show, or small concert. No real money moves through the system; payments are simulated by a purpose-built mock provider.

Constraints: hosting budget is $0 (free tiers only), the timeline is flexible and milestone-based, and every milestone must end in a deployable, coherent product.

## Locked decisions

| Topic | Decision |
|---|---|
| Payments | PayMock, a self-built mock payment provider written in Go: async webhooks, HMAC signatures, retry with exponential backoff, configurable failure injection |
| Waiting room | In scope (M5); a dedicated Go gate service issuing stateless admission JWTs, queue state in Redis only |
| Seat maps | Template layouts first; full drag-and-drop editor arrives as the M6 frontend showcase |
| Auth | Self-built in NestJS: email/password (argon2) + Google OAuth, short-lived JWT + refresh rotation, guest checkout by email |
| API style | REST + OpenAPI as the primary surface (generated TS client); GraphQL is a read-only layer for the organizer dashboard; all mutations stay REST |
| Async work | Transactional outbox in Postgres + BullMQ workers on Redis; no Kafka (see ADR 0003) |
| Realtime | Socket.IO with the Redis adapter for seat/order/dashboard updates; the gate uses SSE |
| Hosting | Vercel (web) + Render free (api kept awake by a scheduled ping; paymock/gate may sleep) + Neon Postgres + managed Redis + Resend for email |
| AWS | Not deployed (budget); `docs/aws-production.md` will map every component to a costed AWS design |
| Demo | Seeded demo event plus a "Simulate crowd" mode so a single visitor sees the realtime behavior |

## Architecture

Runtime components:

- `apps/web` — Next.js App Router on Vercel: public event pages (SSR/ISR), seat-map viewer/editor, checkout, organizer dashboard, check-in scanner
- `apps/api` — NestJS modular monolith on Render: REST under `/api`, read-only GraphQL under `/graphql`, Socket.IO gateway, BullMQ workers in-process
- `services/paymock` — Go: payment intents, a hosted mock payment page, webhook dispatch with retries
- `services/gate` — Go (M5): waiting-room front door; Redis-only state; issues admission JWTs the API verifies statelessly
- Data: Postgres on Neon is the single source of truth (including the outbox); Redis carries jobs, socket fanout, rate limits, and the waiting-room queue

NestJS modules follow bounded contexts: `auth`, `events`, `seatmaps`, `inventory`, `orders`, `payments`, `tickets`, `checkin`, `realtime`, `waiting-room`, `notifications`, `analytics`, `outbox`. Each module boundary is a candidate future service split; the triggers for splitting are recorded in ADR 0001.

## Data model

Core tables: `users`, `events`, `seat_maps` (layout as versioned JSONB), `seats` (materialized from the layout), `price_tiers`, `ticket_types` (GA with `quantity`/`remaining`), `holds`, `orders`, `order_items`, `tickets`, `payments`, `webhook_events`, `outbox_events`.

Invariants:

- Money is stored as integer satang; times are stored in UTC; THB is the only currency
- `holds` are unique per `(event_id, seat_id)` and carry `expires_at` (7 minutes)
- `tickets` enforce `UNIQUE (event_id, seat_id) WHERE seat_id IS NOT NULL` — the final guard against double-selling
- `orders` carry a unique `idempotency_key`; states are `awaiting_payment → paid | expired | canceled`
- `webhook_events` dedupe provider events by unique `provider_event_id`
- The waiting-room queue lives only in Redis; it is ephemeral by design

## Key mechanisms

Double-sell protection has three layers: live seat-state pushed over websockets keeps most collisions from happening; holds are taken with `INSERT ... ON CONFLICT DO NOTHING` inside a transaction so the loser gets an immediate 409; and the unique constraint on `tickets` makes an oversell impossible even in the presence of an application bug. General admission uses a conditional decrement (`UPDATE ... SET remaining = remaining - n WHERE remaining >= n`).

Checkout is fully asynchronous: an idempotent `POST /orders` binds holds to an `awaiting_payment` order, PayMock hosts the payment step, and a signed webhook lands back in the API where it is verified, deduplicated, acknowledged fast, and processed by a worker in a single transaction (order → paid, holds → tickets, outbox rows written). The outbox dispatcher then emails the QR e-ticket and pushes realtime updates. Unpaid orders expire after 15 minutes via a delayed job, releasing their seats.

The waiting room (M5) turns on per event at `sale_opens_at`: checkout requires an admission JWT, buyers join a Redis queue at the gate service, positions stream over SSE, and a token-bucket admitter controls the inflow. The API verifies admission tokens by signature alone.

## Milestones

- M0 Foundation — monorepo, Docker Compose, CI, deploy skeleton, docs
- M1 Events & free GA tickets — auth, guest checkout, event CRUD, SSR event pages, atomic GA inventory, QR e-tickets by email, seeded demo
- M2 Reserved seating & realtime — seat-map templates, SVG viewer, holds with countdown, Socket.IO + Redis adapter, hold sweeper, race-condition integration tests
- M3 Payments — PayMock (Go), order state machine, outbox, idempotency, webhook dedup
- M4 Organizer dashboard — sales analytics, occupancy heatmap, CSV export, read-only GraphQL, QR check-in
- M5 Waiting room & load proof — gate service (Go), admission tokens, k6 drop scenario with a published report, Simulate Crowd demo mode
- M6 Seat-map editor & polish — drag-and-drop editor, i18n (EN/TH), OG images, demo video, complete docs

Deliberately out of scope (recorded here on purpose): real money and refund flows, ticket resale, organizer team RBAC, native mobile apps.

## Quality bars

- Unit tests for domain logic; integration tests against real Postgres/Redis (the no-double-sell race tests are the flagship); Playwright e2e for the buyer and organizer journeys; k6 for load
- CI runs lint, typecheck, unit, integration, and build on every PR; merges to main deploy automatically
- Every technology choice carries a written rationale and its trade-offs, in README and ADRs

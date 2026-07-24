# CLAUDE.md

## Project

OpenSeat — a ticketing platform with real-time reserved seating. Portfolio project built to production standards. The approved design lives in `docs/specs/2026-07-15-openseat-design.md`; significant decisions are ADRs under `docs/adr/`; domain vocabulary is `CONTEXT.md`. Milestones M0–M11 all shipped (see README roadmap): M0–M6 built the product, M7–M10 hardened it (observability, browser e2e, refunds, team RBAC), M11 is the presentation pack. Every milestone ends deployable.

## Structure

Turborepo + pnpm workspaces:

- `apps/web` — Next.js App Router, Tailwind v4, shadcn/ui (dark-first)
- `apps/api` — NestJS modular monolith: REST + OpenAPI at `/api`, Swagger at `/api/docs`, read-only GraphQL for the organizer console at `/api/graphql` (ADR 0006), Socket.IO realtime at namespace `/rt` (Redis adapter when `REDIS_URL` is set), BullMQ hold sweeper, OpenTelemetry traces/metrics/logs (ADR 0009), per-event role checks through `access/` (ADR 0012), Prisma 7 (client generated to `apps/api/src/generated/prisma`, gitignored). Seat holds are DB-authoritative; the browser talks to websockets directly at the API origin (`NEXT_PUBLIC_API_ORIGIN`), not through the Next.js proxy
- `services/paymock` — Go payment simulator (intents, hosted pay page, refunds, HMAC webhooks sent twice on purpose); test with `go -C services/paymock test ./...` — each service is its own Go module, so root-relative package paths do not resolve. Both Go services carry a `package.json` holding only a `dev` script so `pnpm dev` can start them alongside the TypeScript apps; they own no npm dependencies
- `services/gate` — Go waiting room (Redis queue, SSE positions, stateless admission JWTs), shipped in M5
- `packages/contracts` — both published contracts turned into TypeScript (types only, no runtime schemas): the OpenAPI spec at the package root, the GraphQL schema types at `@openseat/contracts/graphql`; `packages/config` — the shared tsconfig every workspace extends, split into a policy base and a Node platform layer
- `tests/e2e` — Playwright browser journeys driving all four services at once; locates by accessible role and name, never `data-testid` (ADR 0010)
- `infra/` — docker-compose (Postgres 16, Redis 7, Mailpit), deploy config

## Commands

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm dev                                     # all four: web :3000, api :4000, paymock :4100, gate :4200
pnpm --filter @openseat/paymock dev          # or run one service on its own (same as `go -C services/paymock run .`)
pnpm turbo run lint typecheck build test     # the CI quality gate
pnpm --filter @openseat/api test:e2e         # integration tests (needs compose stack)
pnpm e2e                                     # browser journeys (needs compose stack; stop `pnpm dev` first)
pnpm --filter @openseat/api db:migrate       # prisma migrate dev
pnpm --filter @openseat/api db:seed          # reseed the demo event + demo users (refuses any host but localhost/compose)
pnpm --filter @openseat/api openapi:dump     # regenerate packages/contracts/openapi.json after API changes
pnpm capture                                 # refresh docs/media (hero GIF + screenshots); needs free ports like pnpm e2e
```

Two contracts are published and CI fails on drift in either, so neither side of the wire has a hand-written type — delete a field and the web typecheck breaks, which is the point.

- **REST** — after changing a controller or a DTO, run `openapi:dump`, then `pnpm --filter @openseat/contracts build`. CI regenerates `openapi.json` and fails on any diff.
- **GraphQL** — after changing a resolver or an `@ObjectType()` model in `dashboard.models.ts`, `apps/api/src/schema.gql` is rewritten the next time the app boots outside production (running the integration suite is enough; `openapi:dump` is not, because it boots Nest in preview mode). Then `contracts build` regenerates the types the web imports from `@openseat/contracts/graphql`. CI fails if `schema.gql` moved.

The web app talks to the API through a same-origin Next.js rewrite (`/api/*`); see ADR 0004.

The web app has to come up on :3000. `WEB_ORIGIN` is the API's CORS allowlist and the browser opens the realtime socket straight at the API origin rather than through the rewrite, so if something else holds the port and Next falls back to :3001, pages still render while live seat updates silently stop. Free the port instead of accepting the fallback.

Prisma 7 notes: connection URL lives in `apps/api/prisma.config.ts` (not in schema); the client requires the pg driver adapter; jest needs `NODE_OPTIONS=--experimental-vm-modules` for e2e (already baked into the script).

## Conventions

- Code, docs, and commit messages are in English
- No code comments; design reasoning belongs in ADRs and docs
- No AI attribution in commits
- Money is integer satang; timestamps are UTC
- Domain terms come from `CONTEXT.md` — a hold is a "hold", never a "lock" or "reservation"
- UI follows `docs/design.md` (Stage Light): tokens only (no raw hex), dark is the canonical theme via next-themes, containers from the documented scale, touch targets ≥ 44px on mobile
- Correctness invariants live in the database (unique constraints), not only in application logic

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/` in this repo; there is no remote tracker and PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

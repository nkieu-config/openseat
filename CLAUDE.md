# CLAUDE.md

## Project

OpenSeat — a ticketing platform with real-time reserved seating. Portfolio project built to production standards. The approved design lives in `docs/specs/2026-07-15-openseat-design.md`; significant decisions are ADRs under `docs/adr/`; domain vocabulary is `CONTEXT.md`. Work proceeds in milestones M0–M6 (see README roadmap) and every milestone must end deployable.

## Structure

Turborepo + pnpm workspaces:

- `apps/web` — Next.js App Router, Tailwind v4, shadcn/ui (dark-first)
- `apps/api` — NestJS modular monolith: REST + OpenAPI at `/api`, Swagger at `/api/docs`, Prisma 7 (client generated to `apps/api/src/generated/prisma`, gitignored)
- `services/paymock`, `services/gate` — Go services (arrive in M3/M5)
- `packages/contracts` — shared types/schemas; `packages/config` — shared tsconfig
- `infra/` — docker-compose (Postgres 16, Redis 7, Mailpit), deploy config

## Commands

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm dev                                   # web :3000, api :4000
pnpm turbo run lint typecheck build test   # the CI quality gate
pnpm --filter api test:e2e                 # integration tests (needs compose stack)
pnpm --filter api db:migrate               # prisma migrate dev
pnpm --filter api db:seed                  # reseed the demo event + demo users
pnpm --filter api openapi:dump             # regenerate packages/contracts/openapi.json after API changes
```

After changing any controller or DTO, run `openapi:dump` then `pnpm --filter @openseat/contracts build` so the web app's typed client stays in sync. The web app talks to the API through a same-origin Next.js rewrite (`/api/*`); see ADR 0004.

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

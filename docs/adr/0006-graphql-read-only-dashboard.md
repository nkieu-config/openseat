# ADR 0006: A read-only GraphQL layer for the organizer dashboard

Status: Accepted (2026-07-16)

## Context

M4's organizer console reads one event from many angles at once — headline totals, a daily sales timeline, per-tier breakdowns, per-section occupancy, and an attendee list. Over REST that is either one bespoke `/dashboard` endpoint that over-fetches for every caller, or a handful of narrow endpoints the client fans out to and stitches together. Both make the read model rigid: every new widget becomes a backend change.

Meanwhile the write side — orders, holds, check-in — already has hard-won REST semantics (idempotency keys, status codes, rawBody webhooks) we have no reason to re-express in a second paradigm.

## Decision

Add **GraphQL for organizer reads only**, mounted at `/api/graphql` behind the same-origin proxy (ADR 0004). It exposes exactly three queries — `organizerEvents`, `eventDashboard(eventId)`, `eventAttendees(eventId)` — behind a JWT guard that reuses the existing passport strategy through a GraphQL-context `getRequest`, with per-event ownership enforced in the resolver. There are **no mutations and no subscriptions**: every state change stays on REST, realtime stays on Socket.IO.

The schema is code-first (`@nestjs/graphql` + Apollo), emitted to `apps/api/src/schema.gql`, so the web app types its queries against a committed contract — the GraphQL mirror of the OpenAPI → openapi-typescript pipeline the REST client already uses.

## Consequences

- The dashboard asks for the fields it renders and gets them in one round trip; a new widget is usually a field on an existing type, not a new endpoint.
- Two API styles now coexist. The boundary is a rule, not a preference: **dashboard reads are GraphQL; anything that changes state is REST.** The global rate limiter had to learn GraphQL execution contexts (`GqlThrottlerGuard`) so one guard still covers both.
- Money is exposed as `Float` satang (integer-valued, safe to 2^53) rather than a custom scalar — a documented shortcut, revisited if a non-THB currency ever lands.
- Read-only keeps the blast radius bounded: a resolver bug can misreport data to its own owner but can never corrupt inventory. Introspection stays on as a portfolio affordance; every query still requires auth and ownership.

## When this would change

If a second consumer (mobile, partners) needed writes, or read latency demanded persisted queries and caching, we would revisit — either promoting GraphQL to a full API or pulling the dashboard back onto REST. At one internal consumer and demo scale, neither pressure exists.

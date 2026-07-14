# ADR 0001: Modular monolith first, services only where justified

Status: Accepted (2026-07-15)

## Context

OpenSeat needs to demonstrate system-design judgment. Microservices are fashionable in portfolios, but a fleet of services for a single-team, low-traffic product adds operational cost without benefit — and reviewers at senior level recognize that instantly. At the same time, the codebase must show where and how it would split when scale demands it.

## Decision

The core API is a single NestJS application organized as a modular monolith. Module boundaries follow bounded contexts (`auth`, `events`, `seatmaps`, `inventory`, `orders`, `payments`, `tickets`, `checkin`, `realtime`, `waiting-room`, `notifications`, `analytics`, `outbox`). Modules communicate through injected services and domain events, not by reaching into each other's tables.

Two components are separate services because their boundaries are real, not aspirational:

- `services/paymock` (Go) simulates an external payment vendor. A payment provider is by nature a separately deployed system with its own lifecycle.
- `services/gate` (Go, M5) absorbs on-sale surge traffic. Its load profile (tens of thousands of cheap connections) differs from the API's by orders of magnitude, and isolating it protects checkout.

## Consequences

- One deployable API keeps the free-tier footprint and the operational story simple.
- BullMQ workers run in the API process for now; the worker is the first candidate to split out, and the code is already structured so that split is a deployment change, not a refactor.
- Realtime (Socket.IO) is the second split candidate; the Redis adapter already makes the gateway horizontally scalable.

## When to revisit

Split a module out when one of these becomes true: its deploy cadence diverges from the rest, its resource profile requires independent scaling, or more than one team owns the codebase.

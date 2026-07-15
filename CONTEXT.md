# OpenSeat — Ubiquitous Language

The vocabulary below is the project's source of truth for naming things — in code, issues, tests, and docs. When output needs one of these concepts, use exactly these terms.

## Selling side

- **Organizer** — a user who creates and runs events. Any user can become one by creating an event.
- **Event** — a dated occasion with a venue name, a seat map and/or GA ticket types, and a sales window. Has `sale_opens_at`; may run in drop mode.
- **Seat map** — the versioned layout (sections, rows, seats) attached to an event. Starts from a template until the editor (M6) exists.
- **Section / Row / Seat** — the physical hierarchy. A seat is the unit of inventory for reserved seating.
- **Price tier** — a named price level assigned to seats (e.g. VIP, Standard).
- **GA (General Admission)** — untiered standing/zone tickets sold by quantity, not by seat.

## Buying side

- **Attendee** — anyone holding a ticket; may be a guest (email only, no account).
- **Hold** — a temporary claim on a seat (7 minutes) while the buyer decides. Holds expire, get taken over, or convert into tickets. Never called "lock" or "reservation".
- **Order** — a buyer's purchase attempt. States: `awaiting_payment → paid | expired | canceled`.
- **Ticket** — the issued right to attend; carries the QR token. Issuing is the act of converting a paid order's holds into tickets.
- **Check-in** — scanning a ticket QR at the door; a ticket checks in at most once.

## Organizer console

- **Console / Dashboard** — the organizer's read-only control surface for one event (the "Backstage Console" UI): live totals, sales timeline, tier and occupancy breakdowns, attendees. Reads run over the GraphQL layer (ADR 0006).
- **Occupancy** — the sold / held / available state of a seat map, aggregated per section and drawn as a heatmap (the "occupancy rig").
- **Sell-through** — issued tickets as a share of capacity.

## Surge machinery

- **Drop** — an on-sale moment expected to attract surge traffic; enables the waiting room.
- **Waiting room** — the queue buyers join before checkout during a drop. Queue state is ephemeral and lives in Redis.
- **Gate** — the Go service that fronts a drop: it owns the queue and admits buyers.
- **Admission** — the short-lived signed token (JWT) the gate grants; checkout during a drop requires it.

## Money & plumbing

- **PayMock** — our simulated external payment provider (Go). Speaks payment intents and signed webhooks; can inject failures.
- **Payment intent** — PayMock's record of an attempt to pay an order.
- **Outbox** — the `outbox_events` table written transactionally with state changes; the dispatcher relays rows to queues.
- **Satang** — all money is stored as integer satang (THB only).

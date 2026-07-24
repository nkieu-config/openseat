# OpenSeat — Ubiquitous Language

The vocabulary below is the project's source of truth for naming things — in code, issues, tests, and docs. When output needs one of these concepts, use exactly these terms.

## Selling side

- **Organizer** — loosely, anyone who runs an event from the console. Precisely, an event's **owner** is the user who created it; the owner may also add **team members** (managers and staff) who run it alongside them. "Organizer" the role is the owner; "organizer" the surface is the console the whole team shares.
- **Event** — a dated occasion with a venue name, a seat map and/or GA ticket types, and a sales window. Has `sale_opens_at`; may run in drop mode.
- **Seat map** — the versioned layout (sections, rows, seats) attached to an event. Built from a template or the drag-and-drop editor (M6), then materialized into individual seats.
- **Section / Row / Seat** — the physical hierarchy. A seat is the unit of inventory for reserved seating.
- **Price tier** — a named price level assigned to seats (e.g. VIP, Standard).
- **GA (General Admission)** — untiered standing/zone tickets sold by quantity, not by seat.
- **Claimed vs issued** — two counts against a price tier's `quantity`, never interchangeable. **Issued** is tickets that exist and are not void — the sales number, and what sell-through and gross are built from. **Claimed** is `quantity − remaining`, the capacity already committed — the floor a capacity change must not drop below. They diverge while money is in flight, and they diverge differently per kind: GA subtracts from `remaining` when the order is created, because that atomic subtraction is what stops overselling; seated subtracts only when payment succeeds and parks its in-flight seats in holds instead. So `claimed − issued` reads as "in checkout" for GA and is always zero for seated.

## Buying side

- **Attendee** — anyone holding a ticket; may be a guest (email only, no account).
- **Hold** — a temporary claim on a seat (7 minutes) while the buyer decides. Holds expire, get taken over, or convert into tickets. Never called "lock" or "reservation".
- **Order** — a buyer's purchase attempt. States: `awaiting_payment → paid | expired | canceled`; a paid order may go on to `partially_refunded → refunded` as its tickets are refunded.
- **Ticket** — the issued right to attend; carries the QR token. Issuing is the act of converting a paid order's holds into tickets.
- **Void** — the terminal ticket state a refund leaves behind. A void ticket is invalid at the door and frees its seat back to sale, but keeps its `seat_id` so the buyer can still see which seat they gave up. Never a transient state — nothing un-voids a ticket.
- **Check-in** — scanning a ticket QR at the door; a ticket checks in at most once.

## Organizer console

- **Console / Dashboard** — the organizer's read-only control surface for one event (the "Backstage Console" UI): live totals, sales timeline, tier and occupancy breakdowns, attendees. Reads run over the GraphQL layer (ADR 0006).
- **Occupancy** — the sold / held / available state of a seat map, aggregated per section and drawn as a heatmap (the "occupancy rig").
- **Sell-through** — issued tickets as a share of capacity.
- **Team** — the people who may run one event: its owner plus any members the owner adds. Per event, not per organization.
- **Member** — a person on an event's team, keyed by lowercase email. Links to a user account lazily — a member added before they register sits *pending* until that email signs up. The owner is never a member row (ownership derives from the event).
- **Role** — a team member's rank on the ladder `owner > manager > staff`: staff scans tickets and reads the door list; manager runs the event including refunds; owner also manages the team. Resolved from the database per request, never from a token, so removing someone takes effect immediately (ADR 0012).

## Surge machinery

- **Drop** — an on-sale moment expected to attract surge traffic; enables the waiting room.
- **Waiting room** — the queue buyers join before checkout during a drop. Queue state is ephemeral and lives in Redis.
- **Gate** — the Go service that fronts a drop: it owns the queue and admits buyers.
- **Admission** — the short-lived signed token (JWT) the gate grants; checkout during a drop requires it.

## Money & plumbing

- **PayMock** — our simulated external payment provider (Go). Speaks payment intents and signed webhooks; can inject failures.
- **Payment intent** — PayMock's record of an attempt to pay an order.
- **Refund** — the money-back record for a chosen subset of a paid order's tickets. Requested by the organizer; voids the tickets and returns their inventory at once, then settles the money on the provider's `payment.refunded` webhook (ADR 0011). A ticket refunds at its full paid price — granularity is which tickets, not how much of one.
- **Outbox** — the `outbox_events` table written transactionally with state changes; the dispatcher relays rows to queues.
- **Satang** — all money is stored as integer satang (THB only).

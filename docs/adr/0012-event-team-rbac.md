# ADR 0012: Event team roles are a ladder read from the database, not claims in a token

Status: Accepted (2026-07-19)

## Context

For nine milestones an event had exactly one person who could touch it: its creator, matched by `organizerId === user.id`, with everyone else met by a flat 404. That check was copied by hand into five services. It was enough while the only privileged action was reading a dashboard — and it stopped being enough the moment M9 shipped refunds, because "who may give this buyer their money back" only has an answer worth enforcing once more than one person can hold the console. ADR 0011 said as much: refunds were "the pressure that justifies M10's RBAC." M10 replaces the identity check with per-event team roles.

Three questions decided the shape: how roles compare, where a role is resolved, and what a denied request is told. Each had a tempting wrong answer.

## Decision

**Roles are a strictly-nested ladder, compared by rank.** `owner (3) > manager (2) > staff (1)`, and every gate is "at least this role." One module — `AccessService` — owns the ladder and answers three things: resolve who you are to this event, require at least a role (or throw), and the role-or-null for read paths that shape output rather than deny. The five copied `ownedEvent` helpers collapse into calls on it.

A ladder works only because the capability sets nest cleanly: everything staff may do (scan tickets, read the door list), manager may; everything manager may do (edit, publish, dashboard, CSV, **refund**), owner may; owner alone manages the team. The day a role stops nesting — a finance role that may refund but not edit the event — the ladder is the wrong model and a per-action → allowed-roles map replaces it. This ADR is the marker for that fork: reach for the map when a rank comparison can no longer express a capability, not before.

**Authorization is data, read per request — never a claim baked into the token.** The JWT still says only *who you are*; the role is a `SELECT` on `team_members` (or the `organizerId` match) on every guarded call. The rejected alternative was to stamp the role into the access token: one fewer query, at the cost of a removed staffer keeping their access until the token expired. A person taken off the door must lose the scanner *now*, not in fifteen minutes — and an over-privileged token is a worse failure than a slightly chattier one. The e2e suite proves the immediacy: remove a member, their very next request 404s; demote a manager to staff, their next edit 403s. Revocation-is-instant is the property that a token claim would have quietly taken away.

**The owner is not a row.** Ownership derives from `Event.organizerId` at resolution time; `team_members` holds only managers and staff. There is no owner membership record to delete, demote, or drift out of sync with the event — the owner cannot be removed because there is nothing to remove, and there is exactly one source of truth for "who owns this." The cost is that ownership transfer has no mechanism (deliberately out of scope), because it would mean the owner *is* a mutable row after all.

**Membership is keyed by lowercase email and links lazily.** The owner types an email and picks a role; if a user with that email exists, the row links at insert, and if not it waits as *pending* (`user_id` null) and links the instant that email registers or first signs in with Google. Both auth paths already normalize email with `trim().toLowerCase()` and membership stores lowercase, so the match is exact. There is no invitation-accept ceremony — being added is being added, Google-Docs style. The trade this accepts is the typo: an email nobody owns sits pending forever. That is visible and deletable in the team panel, and it is a smaller cost than an accept flow's state machine, tokens, and expiry for an event whose staff are a handful of people the owner already knows.

**Outside the team, 404; inside it, 403.** A non-member asking for any management surface gets the same 404 they always did — the management surface does not acknowledge outsiders, which is also why every pre-M10 test passed untouched. A member whose role is insufficient gets a 403 with a plain message ("Your role does not allow this"), because someone standing in the console, looking at the event, must not be told it does not exist. The two denials answer two different questions: *is there anything here for you* versus *may you pull this particular lever*.

**Three mechanisms were rejected before the policy service was chosen:**

- **A guard + decorator** (`@RequireEventRole('manager')` on controllers). Declarative and the obvious Nest idiom — and it lies about our routes. `POST /refunds/:refundId/retry` carries no `eventId`; the guard would have to load the refund, then its order, then its event before it could even name the scope it guards. GraphQL resolvers need a second guard variant that reads `args` instead of route params. `organizerEvents` has no event at all. A decorator that needs a bag of escape hatches is not declarative; it is imperative code wearing a decorator's coat. The policy call sits *inside* the service, after the row it needs is in hand.
- **CASL.** A real ability library, rejected for a three-rank nested ladder: it adds a dependency and an ability-definition ceremony to express what a rank comparison states in one line, and the portfolio reads stronger when the whole policy is a hundred lines we can defend.
- **Role claims in the JWT** — covered above; the revocation-latency cost sank it.

## Consequences

- **The check-in page was reading revenue it never showed.** It called `eventDashboard` — a manager-level, money-bearing query — for a title and two counts. Gated at manager, that would have broken the one screen staff exist for. A slim `eventSummary` query (title, venue, counts, `myRole` — no satang-typed field anywhere in its shape) now serves the door at staff level, and the page repoints to it. This was the one forced refactor of an existing consumer, and it is a small honesty win: the door screen no longer even has the *shape* of money in its response.

- **Money goes null below manager, not zero.** `EventCard.grossSatang` became nullable; a staff member's card carries `null`, which the web renders as "—". A zero would be a lie — the event has revenue, the staffer simply may not see it — and an absent answer is the honest one. This was unspecified by the spec (which only said "staff sees no money") and is recorded here as the resolution.

- **The console learns a staff member's role from the very refusal that redirects them.** Staff cannot load `eventDashboard` at all, so the event console page tries it, catches the 403, fetches `eventSummary` to read `myRole`, and on `staff` redirects to check-in. The redirect survives the forbiddenness that triggers it — the page never shows a staffer a half-empty dashboard.

- **Two deliberate departures from the plan, both toward less surface.** The plan listed a GraphQL `eventTeam` query alongside the REST team routes; it was left unbuilt because the web panel reads and writes team membership through the one typed REST client, and a GraphQL query nothing calls is dead code. Team reads therefore stay on the REST route the mutations already use — one data path, not two. And refund `retry`, which has no `eventId` in its path, now resolves the refund row first and then checks the role on its event; a non-member's 404 message shifts from "Refund not found" to "Event not found," which is still a 404 and still tells an outsider nothing.

- **The browser journey surfaced a latent test-isolation flake, not an RBAC bug.** Three specs grab the first-available Main seat in sequence under a single reseed; the refund spec sells and refunds it, and the seat-race spec that runs next kept catching it mid-settle. Moving seat-race to an uncontended section fixed it. The bug predated M10 (it arrived with M9's refund spec as the second Main-churner); running the full suite enough times to close M10 is simply what exposed it.

## When this would change

A non-nested role — finance that refunds but cannot edit — breaks the ladder, and the rank comparison gives way to a per-action allowed-roles map. An organization or platform tier above the event breaks "roles are per event," and the `access` module grows a second scope to resolve before the event one. Buyer self-service refunds (M9 built mechanism, not policy) make the ownership-descended check insufficient on their own: *who* may refund *themselves*, within *what* window, becomes real product surface and real policy, not a rank on a ladder. And if the role ever needs to be known without a database round-trip — a read replica lagging, a very hot guarded path — that is the moment the token-claim rejected here earns a second look, paid for with an explicit, short revocation window rather than the silent token-lifetime one this decision refused.

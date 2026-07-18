# M10 — Event team RBAC ("Who may pull this lever")

Status: Proposed (2026-07-19)

## Goal

An event's owner staffs their event: they add people by email as **manager** or **staff**, and every management surface — console reads, event edits, check-in, and above all refunds — now asks *what is your role here* instead of *are you the one account that created this event*. M9 built the first genuinely dangerous organizer action and shipped it behind the weakest defensible check (`organizerId === user.id`, 404 otherwise); M10 replaces that check with a policy layer, exactly as ADR 0011 said it would.

This reverses the last recorded scope cut that matters: `README.md` lists "organizer team RBAC" as deliberately out of scope. Same reasoning as M9's reversal — right for a demo, wrong the moment refunds exist, because the question "who may refund" only has a real answer when more than one person can hold the console.

## Non-goals

- **Org-level or platform-level roles.** Teams are per event. There is no organization entity, no site admin, no cross-event role inheritance.
- **Custom permissions.** Three fixed roles. No per-member permission toggles, no permission matrix UI.
- **Invitation acceptance flow.** Being added is being added, Google-Docs style. No invite tokens, no accept page, no expiry state machine. The typo risk this accepts is recorded in the ADR.
- **Audit log.** Who refunded what, who changed whose role — a real production need, deliberately cut. The `invitedById` and `requestedById` columns leave the breadcrumbs a future audit surface would read.
- **Ownership transfer.** The owner is the event's creator, permanently. No handover mechanism.

## Stack analysis — what goes where, and what was rejected

Everything lands in the NestJS monolith; the Go services are untouched (the Gate checks admission signatures, not roles; PayMock knows nothing about people). No new dependencies.

Three mechanisms were considered for the policy layer:

1. **Guard + decorator** (`@RequireEventRole('manager')` on controllers). Declarative and Nest-idiomatic, but it lies about our routes: `POST /refunds/:refundId/retry` carries no `eventId` param — the guard would have to load refund → order → event before it could even name the scope; GraphQL resolvers need a second guard variant reading args instead of params; and `organizerEvents` has no event at all. A decorator that needs three escape hatches is not declarative.
2. **Policy service called from services** — chosen. One injectable module owns the role ladder and the 404/403 semantics; call sites replace today's copy-pasted `ownedEvent` helpers one for one. Works identically for REST, GraphQL, and scope-buried routes. The honest cost: it is imperative — a new route can forget to call it, the same way a new route today can forget `ownedEvent`. The mitigation is the same as M9's: an e2e matrix that walks every gated surface per role.
3. **CASL.** A real ability library, rejected for a three-role strictly-nested ladder: it adds a dependency and an ability-definition ceremony to express what a 100-line module states plainly, and the portfolio story is stronger when every line of the policy is ours to defend.

**Roles are compared as a ladder, not an action map.** `owner > manager > staff`, and every check is "at least this role" — because the capability sets are strictly nested (everything staff may do, manager may; everything manager may, owner may). The day a non-nested role appears (a finance role that refunds but cannot edit the event), the ladder is wrong and an action→role map replaces it; the ADR records that trigger.

**Authorization is data, not claims.** The JWT continues to say only *who you are*; role resolution is a per-request indexed lookup. Rejected alternative: role claims in the token — faster, but stale for up to the access-token TTL, and a staffer removed mid-event must lose the scanner *now*, not in fifteen minutes. Revocation-is-immediate is worth one cheap query on low-traffic management routes.

## Decisions

1. **Three roles, strictly nested.** `staff` — check-in scanning and the door list, nothing with money on it. `manager` — runs the event: edits, seat map, publish, dashboard, orders roster, CSV, **refunds**. `owner` — everything, plus team management; the only role that may add, remove, or re-role members.
2. **Owner is not a row.** Ownership derives from `Event.organizerId` at resolution time. Structurally: the owner cannot be demoted, removed, or duplicated, because there is nothing to delete and no second source of truth to drift.
3. **Membership is keyed by email and links lazily.** The owner types an email and picks a role. If a user with that email exists, `userId` links at insert; if not, the row waits (`userId` null, shown as *pending*) and links the moment that email registers or first signs in with Google — both auth paths already normalize email with `trim().toLowerCase()`, and membership rows store lowercase, so the match is exact. No acceptance step.
4. **Denial semantics: outside the team 404, inside the team 403.** A non-member asking for any management surface gets the same 404 they always did — the management surface of an event does not acknowledge outsiders, and every existing test keeps passing. A member whose role is insufficient gets 403 with a plain message ("Your role does not allow this") — someone standing in the console must not be told the event does not exist.
5. **Refunds are the proof.** `refund create` and `retry` require manager. A staff attempt is the canonical 403 — the M9 action that motivated this milestone, now visibly gated by role rather than identity.
6. **The check-in page loses the money query.** Today it calls `eventDashboard` — which carries revenue — for a title and check-in counts. Gated at manager, that would break the one page staff exist for. A slim `eventSummary` GraphQL query (title, venue, startsAt, status, issued and checked-in counts — no satang field anywhere in its type) lands at staff level and the check-in page repoints to it. This is the one forced refactor of an existing consumer.
7. **Draft visibility widens to the team.** `getBySlug` shows unpublished events only to `organizer.id === viewerId` today; a manager editing a draft needs to see its public page. The check widens to any team member.
8. **Demo mode gets a third chair.** `DEMO_EMAILS` gains `staff`; the seed puts a linked staff member and one deliberately *pending* manager row (an email that never registers) on the demo event's team, so the team panel demonstrates both states, and any visitor can enter the console as staff and feel the walls.

## Architecture

**Schema — one migration, no changes to existing tables:**

```prisma
enum EventRole {
  manager
  staff
}

model TeamMember {
  id          String    @id @default(uuid())
  eventId     String    @map("event_id")
  email       String
  userId      String?   @map("user_id")
  role        EventRole
  invitedById String    @map("invited_by_id")
  createdAt   DateTime  @default(now()) @map("created_at")
  linkedAt    DateTime? @map("linked_at")

  event     Event @relation(fields: [eventId], references: [id])
  user      User? @relation("memberships", fields: [userId], references: [id])
  invitedBy User  @relation("invitations", fields: [invitedById], references: [id])

  @@unique([eventId, email])
  @@index([userId])
  @@map("team_members")
}
```

**The policy module** (`apps/api/src/access/`): `AccessService.requireEventRole(eventId, userId, minRole)` — loads the event (absent → 404), resolves the effective role (`organizerId` match → owner; else membership lookup by `userId`; none → 404), compares on the ladder (below `minRole` → 403), returns `{ event, role }` so call sites stop re-fetching the event they already paid for. A sibling `resolveRole` returns the role-or-null without throwing, for read paths that shape output rather than deny (`getBySlug`, `myRole` fields). Every `ownedEvent` helper and inline `organizerId` where-clause is deleted in favor of these two calls. The refund retry path resolves its event from the refund row first, then calls the same method — no special case in the policy.

**Membership lifecycle:** add (owner-only) inserts lowercase email + role, linking `userId` immediately when the user exists; adding the owner's email is 400, an existing member 409. Re-role and remove are owner-only, keyed by memberId and scoped by eventId in the same where-clause. Lazy link is two hooks in `auth.service` — after register and after Google find-or-create: `updateMany({ where: { email, userId: null }, data: { userId, linkedAt } })`. Removal or demotion takes effect on the very next request, because nothing about roles lives in the token.

**API surface.** Mutations REST (ADR 0006): `POST /api/events/:eventId/team { email, role }`, `PATCH /api/events/:eventId/team/:memberId { role }`, `DELETE /api/events/:eventId/team/:memberId` — all owner. Reads GraphQL: `eventTeam(eventId)` (owner) returning members with linked/pending state; new `eventSummary(eventId)` (staff); `myRole` added to `EventCard` and `EventDashboard`. `organizerEvents` widens from `where: { organizerId }` to *owned or member of*, each card carrying `myRole`.

**Role minimums across the existing surface:** staff — check-in scan, `attendees` (the door list carries names and status, no prices), `eventSummary`, `getBySlug` draft visibility. manager — event update, publish, ticket types, seat map, `eventDashboard`, `eventOrders`, attendees CSV (bulk PII export is not a door-list read), refund create, refund retry. owner — team CRUD, `eventTeam`.

**Web.** The organizer list renders each card's role badge. The event console page branches on `myRole`: staff is redirected to the check-in page (no half-empty dashboard); manager sees everything except the team panel; owner sees the team panel — member list with linked/pending badges, add form (email + role), re-role, and a remove button that arms in two clicks like the refund button. A member hitting a URL above their role gets a clear "your role does not allow this" state, not a blank. The demo entry gains the staff option.

**Untouched:** buyers, guest checkout, holds, payments, webhooks, realtime, the Go services. No public route changes semantics for anyone who is not on a team.

## Deliverables

1. Migration + `TeamMember` model + `EventRole` enum.
2. `access` module: `requireEventRole` / `resolveRole`, ladder, 404/403 semantics.
3. `team` module: REST mutations, ownership guard via `access`, lazy-link hooks in auth.
4. Existing surface converted: events, seatmaps, checkin, dashboard, refunds services all call `access`; `ownedEvent` helpers deleted.
5. GraphQL: `eventTeam`, `eventSummary`, `myRole` fields; check-in page repointed off `eventDashboard`.
6. Web: team panel, role-aware console, staff redirect, role badges, demo staff entry.
7. Seed: demo staff user + linked staff row + pending manager row.
8. Tests: `rbac.e2e-spec.ts` matrix + lifecycle; browser journey 9.
9. Docs: ADR 0012, CONTEXT.md (Team / Member / Role), README scope reversal, `APP_VERSION` → m10.

## Verification

- **Matrix e2e:** every gated surface × {outsider, staff, manager, owner} asserting exact status — outsider 404, insufficient 403, sufficient 2xx. The staff-attempts-refund case is the flagship assertion.
- **Lifecycle e2e:** add unknown email → pending; that email registers → next request succeeds with no further action (lazy link). Remove a member → their next request 403s (revocation without token invalidation). Member of event A → 404 on event B. Duplicate add → 409; owner's own email → 400.
- **Existing suites unchanged:** every pre-M10 spec runs the owner path, which resolves `owner` and passes — a green run without editing old tests is itself evidence the conversion preserved behavior.
- **Browser journey 9:** the owner opens the team panel and adds a fresh email as staff (appears pending); the demo staff context enters the console, is redirected to check-in, scans successfully, and the page shows no revenue and no path to refunds.
- Full gate: turbo lint/typecheck/build/test, jest e2e, browser suite twice, Go suites.

## Risks

- **A forgotten call site.** The policy is imperative; a converted-but-missed route would silently keep the old ownership check (fail-safe: 404 for everyone but the owner — over-restrictive, not permissive). The matrix e2e walks every management route precisely to make this loud.
- **The `eventDashboard` → `eventSummary` repoint** touches the check-in page mid-flight; journey 6 (check-in) and journey 9 both cover it.
- **Email-typo membership.** Accepted with the lazy-link decision; the pending state is visible and deletable in the team panel, and the ADR records the trade.
- **`organizerEvents` shape change** (owned → owned-or-member) touches the console landing page for every existing user; the owner path must return exactly what it returns today plus `myRole: 'owner'`.

## Rollout

Single deploy, additive migration, no backfill (existing events simply have empty teams and behave exactly as before — the owner path is the identity conversion). `APP_VERSION` → m10. No env, no new services, no Render changes beyond the version stamp.

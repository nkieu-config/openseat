# ADR 0015: The team roster identifies people by the email they were invited with

Status: Accepted (2026-07-21)

Amends ADR 0012.

## Context

Both reviews flagged the same thing about `POST /api/events/:id/team`. Adding a member looks the email up in `users`, and the response — plus every later read of the roster — carried `linked` and the account's `displayName`. An owner could type any address and learn two things about a stranger: that the address has an OpenSeat account, and the real name on it. Nothing about the invitee's own intent was involved; the row linked itself the moment it was created.

The first review rated it Low and suggested withholding both fields until the invitee links. That fix was reverted during paydown, because it does not survive contact with ADR 0012: the whole point of lazy linking is that an owner adding a colleague needs to know whether that person can open the console now or has to register first. `linked` is how the panel says so, and the `pending` badge is the only signal in the UI. Removing it to close a Low-severity disclosure would have broken a deliberate feature to fix a smaller problem.

So the finding sat open across two reviews — not through neglect, but because the suggested fix was worse than the defect. What was missing was the observation that the two disclosures are not one thing.

## Decision

**`linked` stays. `displayName` goes.**

The roster now shows the email address the owner typed, its role, and a `pending` badge until the account exists. `TeamMemberView` no longer carries a name, the Prisma `include` on `user` is gone entirely, and the team endpoints no longer read the `users` table at all — the disclosure is removed at the query, not hidden at the edge.

The split follows what each field is for. `linked` answers an operational question the owner has a legitimate need for and already half-knows: they chose this address, and they need to know whether access is live. It is a yes/no about an address they typed, gated behind `requireEventRole(eventId, userId, 'owner')`. `displayName` answers nothing the owner asked — it attaches a human identity to an address, which is the part that turns a permissions screen into a lookup tool.

Identifying teammates by email is also simply more honest for this feature. An invitation is addressed to an email; that is the identifier the owner used and the one that stays stable whether or not an account exists yet. Showing a name sourced from somewhere else implied the system knew more about the invitee than the owner had supplied.

## Consequences

- **A residual account-existence oracle is accepted, deliberately.** An owner can still enumerate which addresses have accounts, one at a time, as an authenticated owner of a real event. That is a far weaker primitive than a name, most systems leak the same thing through login and password-reset flows, and closing it entirely requires the invite-acceptance flow below.

- **The regression tests assert the absence, not the value.** `rbac.e2e-spec.ts` registers a user with a known display name and then asserts the roster response has no `displayName` property at all. Restoring the field fails exactly those three assertions — checked by putting it back.

- **The roster reads less warmly.** A list of addresses is colder than a list of names. For a permissions panel operated by the person who wrote those addresses down, that is the correct trade; for a directory it would not be.

## When this would change

If team invitations ever become a real flow — an email to the invitee, an accept endpoint, a row that stays pending until they say yes — then consent exists, and after it is given the roster may show whatever the invitee agreed to expose, name included. That also closes the residual oracle, because linking would no longer be something an owner can trigger unilaterally. It was not built here because it is a feature, not a fix: it needs the mail, the endpoint, the screen, and its own browser journey, and the disclosure it closes does not justify that on its own.

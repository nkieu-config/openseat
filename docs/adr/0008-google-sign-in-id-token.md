# ADR 0008: Google sign-in by ID-token verification, not a redirect flow

Status: Accepted (2026-07-16)

## Context

The auth module already issues its own sessions: an argon2 password check mints a short access token plus a rotating refresh token, the refresh cookie is scoped to `/api/auth`, and the browser reaches the API through the same-origin Next.js rewrite (ADR 0004). Google sign-in has to slot into that machinery without introducing a second, parallel session mechanism.

The schema was provisioned for this from M1: `users.google_id` is unique and nullable, and `password_hash` is nullable, so a Google-only account is already a legal row. What remained was the flow: how the browser obtains a Google identity and how the API trusts it.

Two shapes were on the table:

- **Server-side Authorization Code flow (passport-google-oauth20).** The browser is redirected to Google and back to a callback *on the API origin*. The API exchanges the code (needs the client secret), then has to hand a session back to a web app that lives on a different origin (Vercel).
- **Google Identity Services (GIS), ID-token verification.** Google renders the button in the browser and returns a signed ID token (a JWT). The web POSTs it to the API, which verifies the signature and `aud` against the Client ID and issues its own session.

## Decision

Use **GIS ID-token verification**. `POST /api/auth/google` takes `{ credential }`, verifies it with `google-auth-library` (`OAuth2Client.verifyIdToken`, audience = `GOOGLE_CLIENT_ID`), then find-or-creates the user and returns the **exact same `{ user, accessToken }` + refresh cookie** as `login`/`register`.

- **Account model.** Match on `google_id` first; failing that, link to an existing row by verified email (Google marks `email_verified`), so a password user who later clicks Google keeps one account; otherwise create a passwordless user. A concurrent first-login race falls back to a unique-violation re-read, mirroring `register`.
- **Stateless and config-gated.** Verification needs only the public Client ID — no client secret, no server session, no passport strategy. When `GOOGLE_CLIENT_ID` is unset the endpoint returns 503 and the web button (gated on `NEXT_PUBLIC_GOOGLE_CLIENT_ID`) renders nothing, so the feature is dark until configured.

This fits the same-origin design: the ID token is posted through the `/api/*` rewrite, so `Set-Cookie` for the refresh token lands on the web origin at `/api/auth` — identical to password login. Reusing `issueTokens` means Google accounts inherit refresh rotation and reuse detection for free.

## Consequences

- One session mechanism, not two. Everything downstream of `issueTokens` — rotation, reuse detection, the `/api/auth`-scoped cookie, the access token — is unchanged, so there is no second code path to secure.
- No cross-origin cookie problem. The redirect flow would set the session on the API origin, which the browser then would not send on the web-origin `/api/auth/refresh` calls; ID-token POST avoids the callback entirely.
- The Client ID is public by nature (it ships in the frontend bundle) and is origin-restricted in the Google console, so it is deploy config, not a secret: `sync: false` on Render, a `NEXT_PUBLIC_` var on Vercel, and authorized JavaScript origins for `localhost:3000` and the production web origin.
- We depend on Google's GIS script (`accounts.google.com/gsi/client`) for the button and One Tap. That is the trade for not shipping a redirect dance; it is loaded lazily and only on the auth pages.
- Passwordless accounts exist now. `login` already guards on `passwordHash` being present, so a Google-only user cannot fall through the password path.

## When this would change

If OpenSeat needed Google *authorization* (calling Google APIs on the user's behalf — Calendar, contacts) rather than *authentication*, ID-token verification would no longer be enough and we would move to the Authorization Code flow with a stored refresh grant. Adding a second identity provider would also push the find-or-create/link logic behind a small provider abstraction instead of living inline in `AuthService`.

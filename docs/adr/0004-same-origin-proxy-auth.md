# ADR 0004: Auth rides a same-origin proxy, not third-party cookies

Status: Accepted (2026-07-15)

## Context

The web app lives on a Vercel domain and the API on a Render domain. That makes any cookie the API sets a third-party cookie, which Safari already blocks and Chrome is phasing out — so a refresh-token cookie set directly by the API would silently fail for a growing share of visitors. The common workarounds are storing tokens in localStorage (exposed to any XSS) or moving both apps onto one custom domain (costs money; this project runs on $0).

## Decision

Next.js rewrites proxy every `/api/*` request to the API host, so the browser only ever talks to one origin. The refresh token lives in an httpOnly, SameSite=Lax cookie scoped to `/api/auth`, set by the API but delivered through the proxy — a first-party cookie from the browser's point of view. Access tokens are short-lived (15 minutes), held in memory only, and rotated via `/api/auth/refresh`; refresh tokens rotate on every use, and reusing a revoked token revokes the whole family.

## Consequences

- No CORS in the browser path and no third-party cookie problem; CORS stays enabled on the API for Swagger and direct consumers.
- All browser API traffic transits Vercel's proxy — one extra hop, immaterial at this scale, and it disappears if the apps ever share a domain.
- Server-side rendering calls the API directly via `API_PROXY_TARGET`, skipping the proxy.
- WebSockets (arriving in M2) do not ride Next.js rewrites; the realtime client will connect straight to the API origin and authenticate with the in-memory access token instead of cookies.

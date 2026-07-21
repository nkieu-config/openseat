# Lighthouse — the two pages a visitor actually lands on

The seat map is the product's most expensive page: a hand-built SVG floor plan, a live websocket, and a countdown, all client-side. This is what Lighthouse makes of it in production, alongside the landing page.

Reproduce it against the deployed site:

```bash
npx lighthouse@12 https://openseat-ticket.vercel.app/events/bangkok-indie-fest \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless --no-sandbox --disable-gpu"
```

## Environment

Lighthouse 12.8.2, headless Chrome, default mobile emulation and network throttling, run from an Apple M-series laptop on **2026-07-22**. The web app is on Vercel; the event page server-renders against the API on a Render free instance, so its first byte carries a real cross-provider hop. The API was awake for this run — a cold instance would cost a few seconds of TTFB that belong to the hosting tier, not the page.

## Results

| | Landing `/` | Seat map `/events/bangkok-indie-fest` |
|---|---|---|
| Performance | 88 | **96** |
| Accessibility | **100** | **100** |
| Best practices | 96 | 96 |
| SEO | **100** | **100** |
| First contentful paint | 1.1 s | 1.1 s |
| Largest contentful paint | 3.8 s | 2.6 s |
| Total blocking time | 10 ms | 90 ms |
| Cumulative layout shift | **0** | **0** |
| Speed index | 3.0 s | 2.2 s |

## Reading it

**Accessibility scores 100 on both pages**, which is a second, independent opinion on the same question the axe pass answers in CI (`tests/e2e/specs/a11y.spec.ts`) — different engine, same verdict.

**Cumulative layout shift is 0 on both.** Nothing reflows once painted: the seat map reserves its viewport from the layout engine before any seat data arrives, and skeletons hold the space the real content will take.

**The seat map outscores the landing page**, which is the opposite of the intuitive order and worth saying plainly. The landing page's 3.8 s LCP is its hero block; the seat map ships more JavaScript but paints its expensive element sooner. The seat map's 90 ms of blocking time is the SVG engine hydrating — under the 200 ms threshold, and the honest cost of not using a seat-map library.

The landing page's LCP is the one number here worth chasing, and it is a hero-image problem rather than an application-architecture one.

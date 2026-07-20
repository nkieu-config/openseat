# OpenSeat — demo video script

A ~3.5-minute screen recording that shows the product working, not slides. Record at 1280×720+, dark theme, on the live site (`openseat-ticket.vercel.app`). Each shot lists what to do and one line to say. Keep the cursor deliberate; let realtime moments breathe.

> Tip: open two browser windows side by side for the realtime beats (Shots 2 and 5). The demo reseeds on every deploy, so grab as many tickets as you like.

## Shot 1 — The promise (0:00–0:15)

- **Do:** Land on the home page. Hover the "Every seat, exactly once." headline. Toggle the language switcher in the footer to Thai, then back.
- **Say:** "OpenSeat is open ticketing built to survive on-sale rushes — the landing and waiting-room flows are bilingual, English and Thai."

## Shot 2 — Reserved seating, live (0:15–0:45)

- **Do:** Open the demo event. In a second window, open the same event. In window A, click a seat — watch it turn "held" in window B in real time. Start the 7-minute countdown, then claim.
- **Say:** "Seats hold in real time across every browser. Two people tap the same seat — exactly one wins, always. That's proven by a race test on every pull request."

## Shot 3 — Fake money, real webhooks (0:45–1:05)

- **Do:** From the held seat, hit Claim → land on the PayMock pay page (`openseat-paymock.onrender.com`). Show the ฿ amount. Click pay. Return to the order page and watch it flip to **paid** with the QR ticket.
- **Say:** "Checkout runs through PayMock — a payment provider I built in Go that signs, retries, and deliberately duplicates every webhook, so idempotency is tested in production forever."

## Shot 4 — The Backstage Console (1:05–1:40)

- **Do:** Log in as the demo organizer. Open an event's **Console**. Pan across the Master Bus KPIs, the sales sparkline, tier faders, and the **occupancy rig** heatmap. Click **Check-in**, paste/scan a ticket QR — show the green ADMITTED lamp and the live scan log.
- **Say:** "The organizer side is a 'backstage console' — live analytics over a read-only GraphQL layer, an occupancy heatmap, and a door scanner where a ticket checks in exactly once, even under concurrent scans."

## Shot 5 — Refund a live seat (1:40–2:00)

- **Do:** In the console's **Orders** roster, pick a paid seated order and refund it. Switch to the public event page (a second window) and show the seat flip from sold back to available in real time.
- **Say:** "An organizer can refund a seat — it voids the ticket and returns it to sale the instant it happens, then settles the money on the provider's webhook. Refunds are reclaim-first."

## Shot 6 — A team that sees only its job (2:00–2:20)

- **Do:** In the console's **Team** panel, add someone by email — it appears *pending* until they register. Then enter as the demo door staff: the console redirects straight to check-in, and there is no revenue and no refund button anywhere.
- **Say:** "Events have teams — owner, manager, staff — with roles read from the database on every request, so access is revoked the moment you remove someone. Staff see the door and nothing with money on it."

## Shot 7 — Design the room (2:20–2:40)

- **Do:** On a fresh event's console, click **Design seat map**. Drag two sections around the canvas, bump one section's rows/cols, set a tier price. Hit **Publish map**, then open the public page to show the seats you just drew.
- **Say:** "Seat maps are drawn in a drag-and-drop editor I built from scratch — no seat-map library — and materialized straight into the live map."

## Shot 8 — Operated, not just deployed (2:40–2:55)

- **Do:** Cut to the Grafana dashboard: the sales funnel, queue depth draining, RED traffic. Then the cross-service trace: one request crossing from the browser into the Go gate.
- **Say:** "Every service ships OpenTelemetry — one trace crosses from the browser into a Go service over standard traceparent — and a domain dashboard watches holds, orders, and admissions."

## Shot 9 — The stampede (2:55–3:25)

- **Do:** Open the **Midnight Drop** event. Click "Enter the on-sale" → the live waiting room. Show your queue position. Hit **Simulate a crowd** — watch a few hundred rivals pile in and your position tick down, then get admitted and land on the sale.
- **Say:** "Ticket drops open behind a Go waiting-room service backed by Redis — load-tested at thirteen thousand joins a second — that admits buyers at a controlled rate with a stateless signed token."

## Close (3:25–3:45)

- **Do:** Cut to the README roadmap — eleven milestones across two acts, build then harden, all ✅ — or the repo.
- **Say:** "Eleven milestones in two acts: build the product, then harden it into a system. Each one deployed, each one documented with the trade-offs written down — and it all costs nothing to run."

## Capture checklist

- Dark theme, no browser extensions/bookmarks bar visible.
- Prewarm the Render services (open `/api/health`, the Gate `/health`, and PayMock once) so nothing cold-starts on camera.
- Have one ticket's QR handy (from **My tickets**) for the Shot 4 scan.
- Have a paid seated order ready in the roster for the refund shot (the demo seed provides several).
- Prewarm Grafana Cloud and have the dashboard + the browser→Gate trace open in tabs for Shot 8.
- End on the live URL: `openseat-ticket.vercel.app`.

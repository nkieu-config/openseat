# OpenSeat Design System — "Stage Light"

The single reference for how the web app looks and behaves. If a rule here conflicts with code, the code is wrong.

## Layers

1. **Tokens** — `apps/web/src/app/globals.css`. Every color, font, radius, and seat-state lives here as a semantic CSS variable. Components never use raw hex/rgb values; assets (favicon, OG images) are the only exemption because they render outside the theme system.
2. **Primitives** — `src/components/ui/*` (shadcn on Base UI). Regenerable; customize through tokens and variants, with deliberate patches kept minimal (current patch: `Button` auto-sets `nativeButton={false}` when rendering links).
3. **Product components** — `src/components/*`: `SiteHeader`, `SiteFooter`, `TicketCard`, `Skeleton` usage patterns, `EmptyState`, `SeatMapTeaser`. Pages compose these instead of repeating utility strings.
4. **Pages** — `src/app/*`: layout and data fetching only.

## Theme policy

- **Dark is canonical.** The brand (amber-on-midnight) is designed dark-first; every new screen is reviewed on dark. Light is supported best-effort and gets a dedicated audit in M6.
- Themes are managed by `next-themes` (`attribute="class"`, default `dark`, system detection off) via `ThemeProvider`; the toggle lives in the footer. Never hardcode the `dark` class or read `prefers-color-scheme` directly.
- Both token blocks set `color-scheme`, so native controls (date pickers, scrollbars) follow the theme.
- Mobile browser chrome color comes from the `viewport.themeColor` export in `layout.tsx`.
- Seat-state tokens are reserved for the seat map and its previews: `--seat-available`, `--seat-selected` (amber, the only glowing element), `--seat-held` (indigo), `--seat-sold`.

## Typography

- Body/UI: Geist (`font-sans`). Display: Outfit (`font-display`) — applied to `h1–h3` globally.
- Mono (`font-mono`) is for identifiers, badges' technical text, and the STAGE label idiom.
- Any number that updates in place (prices, remaining counts, countdowns, queue positions) uses `tabular-nums`.

## Layout & responsive

- Mobile-first with default Tailwind breakpoints; design at 375px, then widen.
- Container scale (all with `mx-auto px-4`): `max-w-sm` auth cards · `max-w-2xl` focused flows (forms, order confirmation) · `max-w-3xl/4xl` reading and list dashboards · `max-w-5xl` marketing and event pages. Pick from this scale; don't invent widths.
- Full-height layouts use `min-h-dvh` (already on `body`), never `100vh`.
- No horizontal scroll at 375px is a hard requirement per screen.

## Interaction

- Touch targets ≥ 44px on mobile. Compact desktop sizing is fine behind `sm:` (idiom: `className="size-11 sm:size-7"`).
- Motion: 150–300ms, `transform`/`opacity` only, meaningful (state change, entrance), and `prefers-reduced-motion` must degrade gracefully.
- Loading over ~300ms shows `Skeleton` shaped like the content — never a bare "Loading…" string. No-content states use `EmptyState` with one action.
- Focus rings are amber (`--ring`) and must stay visible; icon-only buttons carry `aria-label`.
- Icons are Lucide only — one family, no emoji as UI glyphs.

## New-screen checklist

- [ ] Colors and fonts come from tokens only (grep for `#` should find nothing new)
- [ ] Reviewed on dark at 375px and desktop; light gets a sanity pass
- [ ] No horizontal scroll at 375px; touch targets ≥ 44px
- [ ] Numbers that change use `tabular-nums`
- [ ] Loading = skeleton, empty = `EmptyState`, errors show a recovery path
- [ ] Interactive icons have labels; focus visible end-to-end

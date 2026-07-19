# M11 — Presentation pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ten shipped milestones legible to a recruiter, an engineer, and an interviewer without changing any product behavior — a rewritten README with real media, a guided tour, a current demo script, GitHub copy, and a bilingual interview pack kept outside the repo.

**Architecture:** This is a documentation-and-media milestone. Media is produced by a self-contained Playwright capture harness (a separate config + specs that reuse the e2e webServer stack) plus an ffmpeg GIF pipeline; everything else is Markdown. The only source edits are the `APP_VERSION` stamp and deleting unused Next scaffold SVGs. No runtime code, no migration, no ADR.

**Tech Stack:** Markdown, Playwright (`@openseat/e2e` package, reused stack), ffmpeg (installed at `/opt/homebrew/bin/ffmpeg`, v8.x), the existing demo seed.

## Global Constraints

- Code, docs, and commit messages are in **English**. Conversation with the user is Thai.
- **No code comments** anywhere (no `//`, `#`, `/** */`) — this includes the capture specs and the shell script. A shell shebang (`#!/usr/bin/env bash`) is required and is not a comment.
- **No AI attribution** in commit messages — no `Co-Authored-By: Claude` or any equivalent trailer.
- **Conventional Commits** (`docs:`, `chore:`, `test:` …).
- Money is integer **satang**; timestamps **UTC**. Domain terms come from `CONTEXT.md` — a "hold" is a **hold**, never a "lock" or "reservation".
- UI is dark-canonical; media is captured in dark theme.
- The user pushes to the public repo, not the agent. This plan commits locally only.
- The interview pack is written **outside the repo** at `~/Documents/openseat-interview-pack/` and is **never committed**.
- Demo facts (from `apps/api/src/seed.ts`): instant-checkout event slug `bangkok-indie-fest` (title "Bangkok Indie Fest 2026", 44 GA + seated sections **Front** 4×10 and **Main** 6×12, each with pre-sold seats); drop event slug `midnight-drop` (queue at `/events/midnight-drop/queue`). Demo logins via `POST /api/demo/login { role }` with roles `buyer | organizer | staff`; the demo organizer owns both events.

---

## File Structure

**New (committed):**
- `docs/media/` — `hero.gif` (or `hero-left.png` + `hero-right.png` fallback), `seat-map.png`, `console.png`, `seatmap-editor.png`, `waiting-room.png`, `team-panel.png`, `check-in.png`, `social-preview.png`.
- `docs/tour.md` — the ten-minute guided read for engineers.
- `docs/github-repo.md` — About/topics copy for the user to paste into GitHub settings.
- `tests/e2e/playwright.capture.ts` — capture-only Playwright config (reuses the e2e webServer + globalSetup, records video, matches `*.capture.ts`).
- `tests/e2e/capture/hero.capture.ts` — records the two-browser held-seat moment (video + still fallback).
- `tests/e2e/capture/shots.capture.ts` — the product screenshots + social preview.
- `tests/e2e/capture/make-gif.sh` — ffmpeg composition with size cap + retry.

**Modified (committed):**
- `README.md` — full rewrite (status, two-act roadmap, proof section, media, docs map).
- `docs/demo-script.md` — three new beats, retimed, closes on M10.
- `render.yaml:33` — `APP_VERSION` `m10` → `m11`.
- `apps/web/src/i18n/dictionaries.ts` — refresh the stale "milestone 6" landing status badge (EN + TH), so the captured social preview and landing tell the true status.
- `tests/e2e/package.json` — add `capture` script.
- `package.json` (root) — add `capture` script.
- `tests/e2e/.gitignore` (create if absent) — ignore `capture/out/`.

**Deleted (committed):**
- `apps/web/public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` — only after confirming no references.

**Outside the repo (never committed):**
- `~/Documents/openseat-interview-pack/resume-bullets.md`, `architecture-walk.md`, `likely-questions.md`, `numbers.md`.

---

## Task 1: Media capture harness + assets

**Files:**
- Create: `tests/e2e/playwright.capture.ts`
- Create: `tests/e2e/capture/hero.capture.ts`
- Create: `tests/e2e/capture/shots.capture.ts`
- Create: `tests/e2e/capture/make-gif.sh`
- Create: `tests/e2e/.gitignore` (or append)
- Modify: `tests/e2e/package.json`, root `package.json`
- Output: `docs/media/*.png`, `docs/media/hero.gif`

**Interfaces:**
- Consumes: existing fixtures `tests/e2e/fixtures/auth.ts` (`guestContext`, `demoContext`, `WEB`), `tests/e2e/fixtures/seats.ts` (`firstAvailableSeat`, `seat`, `expectSeatStatus`), the webServer array + `global-setup.ts` from `tests/e2e/playwright.config.ts`.
- Produces: image files under `docs/media/` that Task 2 (README) and Task 3 (tour) reference by exact filename.

- [ ] **Step 1: Write the capture-only Playwright config**

Create `tests/e2e/playwright.capture.ts`. It copies the four `webServer` entries and `globalSetup` from `playwright.config.ts` (so the stack boots and reseeds identically), matches `*.capture.ts`, and runs one worker with generous timeouts.

```ts
import { defineConfig, devices } from '@playwright/test';

const WEB = 'http://localhost:3000';
const API = 'http://localhost:4000';
const PAYMOCK = 'http://localhost:4100';
const GATE = 'http://localhost:4200';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://openseat:openseat@localhost:5432/openseat';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export default defineConfig({
  testDir: './capture',
  testMatch: /.*\.capture\.ts$/,
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: WEB,
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'pnpm --filter api start:prod',
      url: `${API}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        DATABASE_URL,
        REDIS_URL,
        PORT: '4000',
        JWT_SECRET: process.env.JWT_SECRET ?? 'e2e-jwt-secret',
        PAYMOCK_WEBHOOK_SECRET: 'paymock-dev-webhook-secret',
        GATE_ADMISSION_SECRET: 'gate-dev-admission-secret',
        PAYMOCK_URL: PAYMOCK,
        API_PUBLIC_URL: API,
        WEB_ORIGIN: WEB,
        APP_ORIGIN: WEB,
      },
    },
    {
      command: 'go run .',
      cwd: '../../services/paymock',
      url: `${PAYMOCK}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: '4100',
        PAYMOCK_WEBHOOK_SECRET: 'paymock-dev-webhook-secret',
        PAYMOCK_API_KEY: 'paymock-dev-key',
        API_PUBLIC_URL: API,
      },
    },
    {
      command: 'go run .',
      cwd: '../../services/gate',
      url: `${GATE}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: '4200',
        REDIS_URL,
        GATE_ADMISSION_SECRET: 'gate-dev-admission-secret',
        WEB_ORIGIN: WEB,
      },
    },
    {
      command: 'pnpm --filter web start',
      url: WEB,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: '3000',
        API_PROXY_TARGET: API,
        NEXT_PUBLIC_API_ORIGIN: API,
        NEXT_PUBLIC_GATE_ORIGIN: GATE,
      },
    },
  ],
});
```

- [ ] **Step 2: Write the hero capture spec**

Create `tests/e2e/capture/hero.capture.ts`. Two recorded contexts open the same event; the left clicks a Front seat and the right shows it turn `held`. It saves both videos under `capture/out/` and also grabs still frames as the pre-agreed fallback.

```ts
import { mkdirSync, renameSync } from 'node:fs';
import { test } from '@playwright/test';
import { WEB } from '../fixtures/api';
import { expectSeatStatus, firstAvailableSeat, seat } from '../fixtures/seats';

const OUT = 'capture/out';
const SIZE = { width: 640, height: 720 };
const LOCALE = { name: 'os_locale', value: 'en', url: WEB };

test('hero — a held seat crossing two browsers', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const left = await browser.newContext({
    baseURL: WEB,
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
  });
  const right = await browser.newContext({
    baseURL: WEB,
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
  });
  await left.addCookies([LOCALE]);
  await right.addCookies([LOCALE]);
  await left.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
  await right.addInitScript(() => window.localStorage.setItem('theme', 'dark'));

  const a = await left.newPage();
  const b = await right.newPage();
  await a.goto('/events/bangkok-indie-fest');
  await b.goto('/events/bangkok-indie-fest');

  const label = await firstAvailableSeat(a, 'Front');
  await seat(a, label).scrollIntoViewIfNeeded();
  await seat(b, label).scrollIntoViewIfNeeded();
  await a.waitForTimeout(1200);

  await seat(a, label).click();
  await expectSeatStatus(a, label, 'yours');
  await expectSeatStatus(b, label, 'held');
  await a.waitForTimeout(1500);

  await a.screenshot({ path: `${OUT}/hero-left.png` });
  await b.screenshot({ path: `${OUT}/hero-right.png` });

  const videoA = a.video();
  const videoB = b.video();
  await left.close();
  await right.close();

  const pathA = await videoA?.path();
  const pathB = await videoB?.path();
  if (!pathA || !pathB) {
    throw new Error('hero capture produced no video');
  }
  renameSync(pathA, `${OUT}/hero-left.webm`);
  renameSync(pathB, `${OUT}/hero-right.webm`);
});
```

- [ ] **Step 3: Write the screenshots capture spec**

Create `tests/e2e/capture/shots.capture.ts`. All organizer shots reuse `demoContext(browser, 'organizer')`. The **console, team, and check-in** shots use the **Bangkok Indie Fest 2026** card (the seated event — so the console carries the occupancy heatmap and the team panel shows the seeded linked-staff + pending-manager rows). The **seat-map editor** shot uses the **Midnight Drop** card instead: the editor only opens its drag-and-drop canvas for an event *without* a seat map, so the GA event is the one that reaches the editable canvas (the seated event shows an "already has a seat map" message). A `consoleHref(title)` helper resolves each card's console link from its `/organizer/events/` anchor, which never depends on link-vs-button role.

```ts
import { mkdirSync } from 'node:fs';
import { test } from '@playwright/test';
import { demoContext, guestContext } from '../fixtures/auth';

const OUT = 'capture/out';
const VIEW = { width: 1280, height: 800 };

test('shots — the curated product surfaces', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });

  const guest = await guestContext(browser);
  await guest.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
  const gp = await guest.newPage();
  await gp.setViewportSize(VIEW);

  await gp.goto('/events/bangkok-indie-fest');
  await gp
    .getByRole('button', { name: /^Front \w+\d+ — / })
    .first()
    .scrollIntoViewIfNeeded();
  await gp.waitForTimeout(800);
  await gp.screenshot({ path: `${OUT}/seat-map.png`, fullPage: true });

  await gp.goto('/events/midnight-drop/queue');
  await gp.waitForTimeout(1500);
  await gp
    .getByRole('button', { name: /simulate/i })
    .click()
    .catch(() => undefined);
  await gp.waitForTimeout(2000);
  await gp.screenshot({ path: `${OUT}/waiting-room.png`, fullPage: true });
  await guest.close();

  const org = await demoContext(browser, 'organizer');
  await org.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
  const op = await org.newPage();
  await op.setViewportSize(VIEW);

  async function consoleHref(title: string): Promise<string> {
    await op.goto('/organizer');
    const link = op
      .locator('div.rounded-md')
      .filter({ has: op.getByRole('heading', { name: title }) })
      .first()
      .locator('a[href^="/organizer/events/"]')
      .first();
    await link.waitFor({ state: 'visible' });
    const value = await link.getAttribute('href');
    if (!value) {
      throw new Error(`no console link for ${title}`);
    }
    return value;
  }

  const seatedHref = await consoleHref('Bangkok Indie Fest 2026');
  await op.goto(seatedHref);
  await op.waitForTimeout(1500);
  await op.screenshot({ path: `${OUT}/console.png`, fullPage: true });

  await op.getByRole('heading', { name: 'Team' }).scrollIntoViewIfNeeded();
  await op.waitForTimeout(500);
  await op.screenshot({ path: `${OUT}/team-panel.png` });

  await op.goto(`${seatedHref}/checkin`);
  await op.waitForTimeout(1000);
  await op.screenshot({ path: `${OUT}/check-in.png`, fullPage: true });

  const dropHref = await consoleHref('Midnight Drop');
  await op.goto(`${dropHref}/seatmap`);
  const addSection = op.getByRole('button', { name: 'Section', exact: true });
  await addSection.waitFor({ state: 'visible' });
  await addSection.click();
  await op.waitForTimeout(800);
  await op.screenshot({ path: `${OUT}/seatmap-editor.png`, fullPage: true });
  await org.close();

  const social = await guestContext(browser);
  await social.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
  const sp = await social.newPage();
  await sp.setViewportSize({ width: 1280, height: 640 });
  await sp.goto('/');
  await sp.waitForTimeout(1500);
  await sp.screenshot({ path: `${OUT}/social-preview.png` });
  await social.close();
});
```

- [ ] **Step 4: Write the ffmpeg GIF script**

Create `tests/e2e/capture/make-gif.sh`. It hstacks the two webms into one GIF under a ~5MB cap, retrying once at lower fps/width. Make it executable (`chmod +x`).

```bash
#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-capture/out}"
DEST="${2:-../../docs/media}"
CAP_KB=5120

mkdir -p "$DEST"

compose() {
  local fps="$1" width="$2"
  ffmpeg -y -i "$OUT/hero-left.webm" -i "$OUT/hero-right.webm" \
    -filter_complex "[0:v][1:v]hstack=inputs=2[s];[s]fps=${fps},scale=${width}:-1:flags=lanczos,split[x][y];[x]palettegen=stats_mode=diff[p];[y][p]paletteuse=dither=bayer" \
    "$DEST/hero.gif"
}

compose 15 900
SIZE_KB=$(du -k "$DEST/hero.gif" | cut -f1)
echo "hero.gif = ${SIZE_KB}KB (cap ${CAP_KB}KB)"

if [ "$SIZE_KB" -gt "$CAP_KB" ]; then
  echo "over cap, retrying at 12fps / 720px"
  compose 12 720
  SIZE_KB=$(du -k "$DEST/hero.gif" | cut -f1)
  echo "hero.gif = ${SIZE_KB}KB"
fi

if [ "$SIZE_KB" -gt "$CAP_KB" ]; then
  echo "STILL over cap — remove hero.gif and use the still fallback (hero-left.png / hero-right.png)"
fi
```

- [ ] **Step 5: Ignore raw capture output; wire the scripts**

Create or append `tests/e2e/.gitignore` with:

```
capture/out/
```

Add to `tests/e2e/package.json` scripts (after `"e2e:ui"`):

```json
"capture": "playwright test --config=playwright.capture.ts",
```

Add to root `package.json` scripts (after `"e2e"`):

```json
"capture": "pnpm run e2e:build && pnpm --filter @openseat/e2e capture",
```

- [ ] **Step 6: Lint and typecheck the harness**

The capture files live in the `@openseat/e2e` package, so they must pass its gates even though CI never runs them.

Run: `pnpm --filter @openseat/e2e typecheck && pnpm --filter @openseat/e2e lint`
Expected: PASS (no type errors, no eslint errors, no comment-rule violations).

- [ ] **Step 7: Stop any dev stack, then run the capture**

The capture config uses `reuseExistingServer: false` and needs ports 3000/4000/4100/4200 free. Ensure `pnpm dev` is not running and the compose stack (Postgres/Redis) is up.

Run: `docker compose -f infra/docker-compose.yml up -d`
Run: `pnpm run capture`
Expected: both capture specs pass; `tests/e2e/capture/out/` now holds `hero-left.webm`, `hero-right.webm`, `hero-left.png`, `hero-right.png`, `seat-map.png`, `console.png`, `seatmap-editor.png`, `waiting-room.png`, `team-panel.png`, `check-in.png`, `social-preview.png`.

- [ ] **Step 8: Build the GIF and place the screenshots**

Run (from `tests/e2e`): `bash capture/make-gif.sh`
Expected: `docs/media/hero.gif` exists and prints a size at or under 5120KB. If the script's final line reports "STILL over cap", delete `docs/media/hero.gif` and instead copy `capture/out/hero-left.png` and `capture/out/hero-right.png` to `docs/media/` (Task 2 will branch on which exists).

Copy the eight screenshots into place:

Run (from repo root): `mkdir -p docs/media && cp tests/e2e/capture/out/{seat-map,console,seatmap-editor,waiting-room,team-panel,check-in,social-preview}.png docs/media/`
Expected: the files exist in `docs/media/`.

- [ ] **Step 9: Verify media dimensions and sizes**

Run: `ffprobe -v error -show_entries stream=width,height -of csv=p=0 docs/media/social-preview.png`
Expected: `1280,640`

Run: `ls -1 docs/media && du -k docs/media/hero.gif 2>/dev/null`
Expected: every referenced screenshot present; `hero.gif` ≤ 5120KB (or absent, with the two `hero-*.png` stills present instead).

Open each screenshot and eyeball it: dark theme, the intended surface, no error toast, no half-loaded panel. Re-run `pnpm run capture` if any shot is wrong.

- [ ] **Step 10: Commit**

```bash
git add tests/e2e/playwright.capture.ts tests/e2e/capture tests/e2e/.gitignore tests/e2e/package.json package.json docs/media
git commit -m "chore(media): capture the hero and product screenshots"
```

---

## Task 2: README overhaul

**Files:**
- Modify: `README.md` (full rewrite)

**Interfaces:**
- Consumes: `docs/media/*` from Task 1; existing docs (`docs/adr/0009`–`0012`, `docs/load-tests/gate-report.md`, `docs/observability/`), the demo slugs.
- Produces: the repo's front page; Task 5 crops nothing further (social preview already produced), Task 7 link-checks it.

- [ ] **Step 1: Rewrite the status blockquote and intro**

Replace the current `> Status: **M6 — Complete** …` blockquote. The new intro keeps the one-line pitch, embeds the hero, and states the two-act shape. Use this structure (fill real copy in the house voice):

```markdown
# OpenSeat

Open ticketing with real-time reserved seating — create an event, share the link, and let people pick their exact seat. Built to survive on-sale rushes without ever double-selling a seat.

![Two buyers, one seat: a hold appearing live across browsers](docs/media/hero.gif)

**Live**: [openseat-ticket.vercel.app](https://openseat-ticket.vercel.app) · [API health](https://openseat-api.onrender.com/api/health) · [API docs](https://openseat-api.onrender.com/api/docs)

> **Status: complete — eleven milestones, each shipped deployable.** OpenSeat was built in two acts. **Build** (M0–M6) shipped the product: reserved seating under concurrency, async payments over a Go payment simulator, a waiting room for on-sale drops, and a drag-and-drop seat-map editor. **Harden** (M7–M10) turned the demo into a system: OpenTelemetry observability, a browser end-to-end suite on every PR, organizer-triggered refunds, and per-event team RBAC read from the database.
```

If Task 1 produced stills instead of a GIF, replace the single `![…](docs/media/hero.gif)` line with the two stills side by side:

```markdown
<p align="center">
  <img src="docs/media/hero-left.png" width="49%" alt="Buyer A taps a seat">
  <img src="docs/media/hero-right.png" width="49%" alt="The same seat turns held in buyer B's browser, live">
</p>
```

- [ ] **Step 2: Add a "Proof, not claims" section**

Insert after "Why this project exists". This is the recruiter's evidence list, each item a link to the artifact:

```markdown
## Proof, not claims

- **No double-selling, proven two ways** — an API race test puts 50 buyers on one seat and exactly one wins; a [two-browser Playwright journey](tests/e2e/specs/seat-race.spec.ts) shows the loser's seat turn red, not crash.
- **The surge is load-tested** — the Go waiting room absorbs [~13,000 joins/second at p95 < 20ms with zero errors](docs/load-tests/gate-report.md).
- **One request, traced across languages** — a browser fetch parents a span inside the Go gate over W3C traceparent ([the trace](docs/observability/trace-web-to-gate.png), [dashboard](docs/observability/dashboard.png)).
- **The whole demo runs in CI** — 73 API integration tests plus 9 browser journeys on every pull request.
- **Every decision is written down** — 12 [ADRs](docs/adr) and a spec per milestone, each ending deployable.
```

- [ ] **Step 3: Extend the roadmap table with M7–M10**

Keep the existing M0–M6 rows. Add a divider note for the second act and four rows in the same voice, each linking its ADR:

```markdown
The second act — *harden*:

| Milestone | Ships |
|---|---|
| **M7 — Observability** ✅ | OpenTelemetry traces/metrics/logs to Grafana Cloud, domain funnel dashboard, a cross-language browser→Gate trace, 5xx alerting ([ADR 0009](docs/adr/0009-observability-otel-grafana-cloud.md)) |
| **M8 — Browser end-to-end** ✅ | Playwright journeys driving all four services, located by accessible role, green on every PR ([ADR 0010](docs/adr/0010-browser-tests-locate-by-role.md)) |
| **M9 — Refunds** ✅ | Organizer-triggered refunds that reclaim the seat live and settle on the provider's webhook ([ADR 0011](docs/adr/0011-refunds-reclaim-first.md)) |
| **M10 — Team RBAC** ✅ | Per-event owner/manager/staff, a role ladder read from the database so revocation is instant ([ADR 0012](docs/adr/0012-event-team-rbac.md)) |
```

- [ ] **Step 4: Add inline screenshots near the relevant prose**

Place the curated shots where they reinforce a claim (not a gallery). Suggested anchors:
- `docs/media/seat-map.png` beside the reserved-seating bullet under "Why this project exists".
- `docs/media/console.png` and `docs/media/seatmap-editor.png` near the `apps/web` architecture row.
- `docs/media/waiting-room.png` near the surge/waiting-room mention.
- `docs/media/team-panel.png` near the M10 roadmap row.

Use Markdown images with descriptive alt text and a width where a raw image would dominate:

```markdown
<img src="docs/media/console.png" width="600" alt="The Backstage Console: live KPIs, a sales sparkline, tier faders, and an occupancy heatmap">
```

- [ ] **Step 5: Add a "Walk the demo in 2 minutes" section and a docs map**

Golden path through the three demo chairs, then pointers so an engineer knows where to read next:

```markdown
## Walk the demo in 2 minutes

No sign-up — the landing page has one-tap demo entry.

1. **As a buyer** — open the demo event, pick a seat on the live map, and pay on the PayMock page; your QR ticket lands on the order page.
2. **As the organizer** — open the Backstage Console for live sales, occupancy, and the door scanner; refund a seat and watch it return to sale.
3. **As door staff** — the same console, walled to the door: check-ins only, no revenue, no refunds.

## Where to look next

- [docs/tour.md](docs/tour.md) — read this repo well in ten minutes
- [Design spec](docs/specs/2026-07-15-openseat-design.md) and per-milestone specs in [docs/specs](docs/specs)
- [ADRs](docs/adr) — why each decision went the way it did
- [CONTEXT.md](CONTEXT.md) — the project's ubiquitous language
```

- [ ] **Step 6: Verify the README renders and reads clean**

Run: `grep -n "M6 — Complete" README.md`
Expected: no output (the stale status is gone).

Preview the Markdown (open in an editor preview or `npx -y markdown-cli README.md` if available) and confirm: the hero displays, the tables render, no broken image icons. Link resolution is checked in Task 7 across the whole README.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: rewrite the README for eleven shipped milestones"
```

---

## Task 3: docs/tour.md — the ten-minute read

**Files:**
- Create: `docs/tour.md`

**Interfaces:**
- Consumes: real source paths (verified below), the proof artifacts, `docs/media/*`.
- Produces: the engineer's guided path, linked from the README (Task 2, Step 5).

- [ ] **Step 1: Write the tour**

Create `docs/tour.md` with four movements. Every "the code is here" bullet must link a file that exists (Step 2 verifies). Use these real anchors:

- Hand-built SVG seat picker (no library): `apps/web/src/app/events/[slug]/seat-picker.tsx`
- DB-authoritative holds (`INSERT … ON CONFLICT`, TTL, takeover): `apps/api/src/holds/holds.service.ts`; the sweeper `apps/api/src/queues/hold-sweeper.service.ts`
- The Go waiting room (token-bucket admitter, stateless admission JWT): `services/gate/admitter.go`, `services/gate/main.go`
- Signed, deliberately-duplicated webhooks: `services/paymock/webhook.go`, `services/paymock/signer.go`
- The role ladder read per request: `apps/api/src/access/access.service.ts`

```markdown
# Read this repo in ten minutes

OpenSeat is a ticketing platform with real-time reserved seating, built to production standards as a portfolio project. This is the guided path: the pitch, the proof to open first, the code worth reading, and how the work was run.

## The thirty-second pitch

Create an event, share the link, let people pick their exact seat live. The hard part is correctness under concurrency — two people tapping one seat, a payment that settles asynchronously, a ten-thousand-person on-sale rush — and every one of those is solved with the boring, correct mechanism and a test that proves it.

## Open these three first

1. [The seat race](tests/e2e/specs/seat-race.spec.ts) — two real browsers reach for one seat; the loser sees it turn held, live, with no reload. The API-level version puts 50 buyers on one seat and asserts a single winner.
2. [The load report](docs/load-tests/gate-report.md) — the Go waiting room at ~13k joins/second, p95 < 20ms, zero errors.
3. [The cross-language trace](docs/observability/trace-web-to-gate.png) — one request whose browser span parents a span inside a Go service.

## The code worth reading

- **The seat map is hand-built SVG** — pan, zoom, hit-test, live seat states, no seat-map library: [`seat-picker.tsx`](apps/web/src/app/events/[slug]/seat-picker.tsx).
- **Holds live in the database, not in Redis** — `INSERT … ON CONFLICT DO NOTHING` in a transaction, a 7-minute TTL, expired-hold takeover, and a unique index on `(event_id, seat_id)` as the last-line backstop: [`holds.service.ts`](apps/api/src/holds/holds.service.ts), swept by [`hold-sweeper.service.ts`](apps/api/src/queues/hold-sweeper.service.ts).
- **The waiting room is Go** — a token-bucket admitter draining a Redis sorted set, minting a stateless admission JWT the API verifies itself: [`admitter.go`](services/gate/admitter.go), [`main.go`](services/gate/main.go).
- **Payments settle on a signed webhook** — a mock provider that signs over the raw body and deliberately double-sends, so idempotency is exercised forever: [`webhook.go`](services/paymock/webhook.go), [`signer.go`](services/paymock/signer.go).
- **Authorization is data, not a token claim** — a three-rank role ladder resolved per request, so removing a staffer takes effect on their next call: [`access.service.ts`](apps/api/src/access/access.service.ts).

## How the work was run

Each milestone is a spec in [docs/specs](docs/specs), an implementation plan in [docs/plans](docs/plans), and — where a decision had a tempting wrong answer — an [ADR](docs/adr). Commits are conventional; every milestone ends deployable. The domain language is fixed in [CONTEXT.md](CONTEXT.md): a *hold* is a hold, money is integer satang, time is UTC.
```

- [ ] **Step 2: Verify every tour link resolves**

Run this from the repo root — it extracts each relative link target from `docs/tour.md` and reports any that do not exist on disk:

```bash
grep -oE '\]\(([^)]+)\)' docs/tour.md | sed -E 's/\]\(([^)]+)\)/\1/' \
  | grep -vE '^https?://' \
  | while read -r p; do [ -e "$p" ] || echo "MISSING: $p"; done
```

Expected: no `MISSING:` lines. (Bracketed link paths containing `[slug]` are literal directory names on disk here, so they resolve.)

- [ ] **Step 3: Commit**

```bash
git add docs/tour.md
git commit -m "docs: add a ten-minute guided tour of the repo"
```

---

## Task 4: Refresh the demo script

**Files:**
- Modify: `docs/demo-script.md`

**Interfaces:**
- Consumes: nothing new; edits prose only.
- Produces: a recordable script current to M10.

- [ ] **Step 1: Retime the intro and add three beats**

Open `docs/demo-script.md`. Change the runtime line from "~2.5-minute" to "~3.5-minute". Keep Shots 1–6. Insert three new shots after Shot 4 (the console), renumbering the stampede/close that follow:

```markdown
## Shot 5 — Refund a live seat (1:45–2:05)

- **Do:** In the console's **Orders** roster, pick a paid seated order and refund it. Switch to the public event page (a second window) and show the seat flip from sold back to available in real time.
- **Say:** "An organizer can refund a seat — it voids the ticket and returns it to sale the instant it happens, then settles the money on the provider's webhook. Refunds are reclaim-first."

## Shot 6 — A team that sees only its job (2:05–2:25)

- **Do:** In the console's **Team** panel, add someone by email — it appears *pending* until they register. Then enter as the demo door staff: the console redirects straight to check-in, and there is no revenue and no refund button anywhere.
- **Say:** "Events have teams — owner, manager, staff — with roles read from the database on every request, so access is revoked the moment you remove someone. Staff see the door and nothing with money on it."

## Shot 7 — Operated, not just deployed (2:25–2:40)

- **Do:** Cut to the Grafana dashboard: the sales funnel, queue depth draining, RED traffic. Then the cross-service trace: one request crossing from the browser into the Go gate.
- **Say:** "Every service ships OpenTelemetry — one trace crosses from the browser into a Go service over standard traceparent — and a domain dashboard watches holds, orders, and admissions."
```

- [ ] **Step 2: Renumber the stampede and close, update the close line**

The former "Shot 6 — The stampede" becomes **Shot 8**, retimed to 2:40–3:10. The close becomes **Shot 9 — Close (3:10–3:30)** and its `Do` line changes from "M0–M6 all ✅" to the full set:

```markdown
- **Do:** Cut to the README roadmap — eleven milestones across two acts, build then harden, all ✅ — or the repo.
- **Say:** "Eleven milestones in two acts: build the product, then harden it into a system. Each one deployed, each one documented with the trade-offs written down — and it all costs nothing to run."
```

- [ ] **Step 3: Add the new shots to the capture checklist**

Under "## Capture checklist", add:

```markdown
- Have a paid seated order ready in the roster for the refund shot (the demo seed provides several).
- Prewarm Grafana Cloud and have the dashboard + the browser→Gate trace open in tabs for Shot 7.
```

- [ ] **Step 4: Verify the retiming is consistent**

Run: `grep -nE "Shot [0-9]|—[0-9]:[0-9]|M0–M6|2\.5-minute" docs/demo-script.md`
Expected: shots numbered 1–9 in order, no "M0–M6" and no "2.5-minute" remaining, timestamps monotonically increasing.

- [ ] **Step 5: Commit**

```bash
git add docs/demo-script.md
git commit -m "docs: bring the demo script up to M10"
```

---

## Task 5: GitHub repo copy

**Files:**
- Create: `docs/github-repo.md`

**Interfaces:**
- Consumes: `docs/media/social-preview.png` from Task 1.
- Produces: paste-ready copy for the user (the agent cannot edit GitHub settings).

- [ ] **Step 1: Write the copy block**

Create `docs/github-repo.md`. It is the source of truth for what the user should set in GitHub → repo settings. Keep the About under GitHub's ~350-character limit and topics to ~15 lowercase-hyphenated tags.

```markdown
# GitHub repo presentation

Paste these into the repository's GitHub settings. The agent cannot edit repo settings; this file is the source of truth for what was set.

## About (Settings → General → Description)

> Open ticketing with real-time reserved seating: pick your exact seat live, never double-sold. NestJS + Next.js + Postgres + Redis, a Go payment simulator and waiting room, OpenTelemetry, and browser e2e on every PR. Built to production standards across eleven milestones.

(Keep under 350 characters. Set the website to https://openseat-ticket.vercel.app.)

## Topics (Settings → General → Topics)

`ticketing` `reserved-seating` `nextjs` `nestjs` `typescript` `postgresql` `redis` `golang` `prisma` `socket-io` `opentelemetry` `playwright` `monorepo` `turborepo` `real-time`

## Social preview (Settings → General → Social preview)

Upload `docs/media/social-preview.png` (1280×640).
```

- [ ] **Step 2: Verify the social preview exists at the right size**

Run: `ffprobe -v error -show_entries stream=width,height -of csv=p=0 docs/media/social-preview.png`
Expected: `1280,640`

- [ ] **Step 3: Commit**

```bash
git add docs/github-repo.md
git commit -m "docs: add GitHub About, topics, and social-preview copy"
```

---

## Task 6: Interview pack (outside the repo, TH + EN)

**Files:**
- Create: `~/Documents/openseat-interview-pack/resume-bullets.md`
- Create: `~/Documents/openseat-interview-pack/architecture-walk.md`
- Create: `~/Documents/openseat-interview-pack/likely-questions.md`
- Create: `~/Documents/openseat-interview-pack/numbers.md`

**Interfaces:**
- Consumes: the project's real numbers and decisions (ADRs, this repo).
- Produces: personal prep, never committed. Nothing here touches the repo tree.

- [ ] **Step 1: Create the directory outside the repo**

Run: `mkdir -p ~/Documents/openseat-interview-pack`
Expected: directory exists, and it is **not** under `~/Documents/P2` (so `git status` in the repo never sees it).

- [ ] **Step 2: Write `numbers.md` (the facts to memorize)**

These are the load-bearing figures; every other document draws on them. Write them exactly:

```markdown
# Numbers worth memorizing

- 11 milestones (M0–M10), two acts: build (M0–M6), harden (M7–M10).
- No double-sell: 50 concurrent buyers on one seat → exactly 1 winner (API race test).
- Waiting room: ~13,000 joins/second, p95 < 20ms, 0 errors (k6, docs/load-tests/gate-report.md).
- Test suites on every PR: 73 API integration (jest) + 9 browser journeys (Playwright).
- 12 ADRs; one spec + one plan per milestone.
- Holds: DB-authoritative, 7-minute TTL, unique (event_id, seat_id) backstop.
- Realtime: Socket.IO + Redis adapter, seat events batched every 250ms.
- Money: integer satang (THB), never float. Time: UTC.
- Hosting: $0 — Vercel + Render free + Neon + Render key-value + Grafana Cloud free.
- Stack: NestJS modular monolith, Next.js App Router, PostgreSQL (Prisma 7), Redis (BullMQ), two Go services (PayMock, Gate).
```

- [ ] **Step 3: Write `resume-bullets.md` (EN, three framings)**

Three sets of 3–4 bullets, each STAR-compressed and metric-led. Write all three:

```markdown
# Resume bullets (English)

## Generalist
- Built a production-standard ticketing platform with real-time reserved seating (NestJS, Next.js, PostgreSQL, Redis, two Go services) across 11 documented milestones, each deployed on a $0 hosting stack.
- Guaranteed no double-selling under concurrency with database-authoritative holds and a unique constraint backstop; proved it with a 50-buyer race test and a two-browser end-to-end journey run on every PR.
- Added observability (OpenTelemetry across TypeScript and Go, one trace crossing the browser→service boundary), organizer refunds, and per-event RBAC — turning a demo into an operable system.

## Backend-lean
- Designed a NestJS modular monolith with a transactional outbox over BullMQ (chosen over Kafka, with the switch criteria written in an ADR) for async payment and notification effects.
- Implemented asynchronous payments against a Go payment simulator with HMAC-signed, deliberately-duplicated webhooks; verified signatures over the raw body and deduped by provider event id, exercising idempotency continuously.
- Built a Go waiting room (Redis sorted-set queue, token-bucket admitter, stateless admission JWT) load-tested at ~13k joins/second, p95 < 20ms, zero errors.

## Frontend-lean
- Built a hand-written SVG seat map (pan, zoom, hit-test, live seat states) with no seat-map library, plus a drag-and-drop seat-map editor with undo/redo.
- Drove real-time seat updates over Socket.IO with 250ms batching; a seat a buyer takes turns "held" in every other browser with no reload.
- Located every browser test by accessible role and name (no test ids), so the e2e suite doubles as an accessibility assertion; shipped EN/TH i18n and a dark-canonical design system with tokens only.
```

- [ ] **Step 4: Write `architecture-walk.md` (EN script + TH speaking notes)**

A 3–4 minute "walk me through the architecture" narrative in English, each section followed by a Thai speaking note (`> TH: …`). Cover: the four+1 runtime components and why the split; the double-sell defense in depth; the async payment flow; the waiting room; and the harden act. Write it in full:

```markdown
# "Walk me through the architecture"

## The shape (30s)
Five runtime pieces: a Next.js web app, a NestJS API that is a modular monolith, two small Go services — a payment simulator and a waiting-room gate — and the data layer, Postgres plus Redis. Postgres is the single source of truth; Redis does jobs, fan-out, and the ephemeral queue. I kept the API a monolith on purpose and wrote down where I'd cut the first service if load demanded it.
> TH: มี 5 ส่วนตอนรัน — web (Next.js), API (NestJS แบบ modular monolith), Go 2 ตัว (จำลอง payment กับ waiting room), และ data layer (Postgres + Redis). Postgres เป็น source of truth ตัวเดียว, Redis ทำ job/realtime/คิว. จงใจให้ API เป็น monolith แล้วเขียน ADR ไว้ว่าจะแยก service แรกตอนไหน.

## No double-sell (60s)
Three layers. Live seat state over websockets lowers collisions. The real guarantee is a hold written with INSERT … ON CONFLICT DO NOTHING inside a transaction — the loser gets a 409 immediately — with a 7-minute TTL and takeover of expired holds. The last line is a unique index on (event_id, seat_id): even a buggy path physically cannot sell one seat twice. I test it with 50 concurrent buyers on one seat asserting a single winner, and with two real browsers.
> TH: 3 ชั้น — realtime ลดโอกาสชน, hold ด้วย INSERT ON CONFLICT ใน transaction (แพ้ได้ 409 ทันที) + TTL 7 นาที + takeover, แล้วปิดท้ายด้วย unique index (event_id, seat_id) เป็นตาข่ายสุดท้าย. เทสต์ด้วย 50 คนแย่ง 1 ที่นั่ง → ชนะ 1 และสองเบราว์เซอร์จริง.

## Async payments (45s)
Checkout creates an order in awaiting_payment tied to the holds and an intent at the Go simulator. The buyer pays there; the simulator sends an HMAC-signed webhook that retries and is deliberately double-sent. The API verifies the signature over the raw body, dedupes by provider event id, and in one transaction flips the order to paid and converts holds to tickets, writing side effects to a transactional outbox that a dispatcher relays.
> TH: checkout สร้าง order เป็น awaiting_payment ผูก holds + สร้าง intent ที่ Go simulator. จ่ายเสร็จ simulator ยิง webhook (HMAC, retry, จงใจส่งซ้ำ). API verify ลาย signature บน raw body, dedup ด้วย provider event id, แล้วใน tx เดียว: order→paid, holds→tickets, เขียน outbox ให้ dispatcher ส่งต่อ.

## The waiting room (30s)
For drops, checkout requires an admission token. Buyers join a Redis sorted set at the Go gate, watch their position over SSE, and a token-bucket admitter releases them at a controlled rate with a stateless signed JWT the API verifies itself. Queue state is Redis-only and ephemeral by design.
> TH: ตอน drop, checkout ต้องมี admission token. คนเข้าคิวใน Redis sorted set ที่ Go gate, ดูตำแหน่งผ่าน SSE, token-bucket admitter ปล่อยเป็นจังหวะด้วย JWT ที่ API verify เองได้. คิวอยู่ Redis อย่างเดียว, ตั้งใจให้ ephemeral.

## The harden act (30s)
Then I made it operable: OpenTelemetry traces, metrics, and logs across both TypeScript and Go — one trace crosses the browser→gate boundary over W3C traceparent — a browser e2e suite on every PR, reclaim-first refunds, and per-event RBAC where the role is read from the database each request so revocation is instant.
> TH: แล้ว harden ให้ operate ได้: OTel ครบทั้ง TS และ Go — เทรซเดียวข้าม browser→gate ผ่าน traceparent — browser e2e ทุก PR, refund แบบ reclaim-first, และ RBAC ต่อ event ที่อ่าน role จาก DB ทุก request ให้ revoke ได้ทันที.
```

- [ ] **Step 5: Write `likely-questions.md` (TH + EN Q&A)**

The questions this project invites, each with a crisp answer. Include the honest debugging war stories. Write each Q with an EN answer and a TH note:

```markdown
# Likely questions

## Why an outbox + BullMQ instead of Kafka?
EN: At this scale a transactional outbox in Postgres plus BullMQ on Redis gives exactly-once-ish effects with no extra infrastructure and no second source of truth. Kafka buys throughput and replay I don't need yet; the ADR records the load at which I'd switch.
TH: สเกลนี้ outbox ใน Postgres + BullMQ บน Redis พอ, ได้ผลแบบ effect-once โดยไม่ต้องมี infra เพิ่ม. Kafka เอาไว้ตอน throughput/replay จำเป็น — เขียนเกณฑ์ไว้ใน ADR แล้ว.

## How do you actually prevent double-selling?
EN: Defense in depth — realtime to lower collisions, a transactional hold with ON CONFLICT for the real race, and a unique (event_id, seat_id) index as the physical backstop. Correctness lives in the database, not only in app logic.
TH: ป้องกันหลายชั้น — realtime ลดชน, hold ใน tx ด้วย ON CONFLICT จับ race จริง, unique index เป็นตาข่ายกายภาพ. ความถูกต้องอยู่ใน DB ไม่ใช่แค่ใน app.

## Why a role ladder instead of a library like CASL?
EN: The roles strictly nest — staff ⊂ manager ⊂ owner — so a rank comparison says it in one line; CASL would add a dependency and ceremony to express the same thing. The ADR names the trigger to switch: the first non-nested role.
TH: role ซ้อนกันสนิท (staff ⊂ manager ⊂ owner) เทียบ rank บรรทัดเดียวจบ; CASL เพิ่ม dependency โดยไม่ได้อะไร. ADR ระบุจุดเปลี่ยน: role แรกที่ไม่ nested.

## Why is the role read from the database every request, not from the JWT?
EN: So revocation is instant. A staffer removed mid-event must lose the scanner now, not when their token expires. It costs one indexed query on low-traffic management routes.
TH: เพื่อให้ revoke ทันที. เอาคนออกกลางงานต้องหมดสิทธิ์เดี๋ยวนั้น ไม่ใช่รอ token หมดอายุ. แลกด้วย query indexed ครั้งเดียวบน route ที่ traffic ต่ำ.

## Tell me about a bug you debugged.
EN: My Grafana dashboards were silently empty while the metrics plainly existed in Explore. OTel pushes on an interval, and rate()'s window was derived from a scrape interval that OTLP-push ignores — one sample per window computes to nothing. Fixed with a fixed 5-minute window and a 15s export interval. Second one: a browser e2e flake where three specs churned the same seat under one reseed; I moved the race spec to an uncontended section.
TH: dashboard ว่างทั้งที่ metric มีจริงใน Explore. OTel push เป็นช่วงเวลา, แต่ window ของ rate() คิดจาก scrape interval ที่ push ไม่ใช้ → 1 จุดต่อ window = ว่าง. แก้ด้วย window 5 นาทีคงที่ + export ทุก 15s. อีกอัน: e2e flake จาก 3 spec แย่งที่นั่งเดียวกันใต้ reseed เดียว — ย้าย race spec ไป section ที่ไม่มีใครแตะ.

## What would you do differently at 100x scale?
EN: Split the realtime gateway and the BullMQ workers out of the API first (the ADR marks the seam), move the queue to a partitioned log if replay matters, and put a read replica behind the dashboard — at which point the per-request role read might earn a short-TTL cache, a trade the RBAC ADR already flags.
TH: แยก realtime gateway กับ worker ออกจาก API ก่อน (ADR มาร์ค seam ไว้), ย้ายคิวไป log แบบ partition ถ้าต้อง replay, มี read replica หลัง dashboard — ตรงนั้น role-read ต่อ request อาจใส่ cache TTL สั้น ซึ่ง ADR ก็ flag ไว้แล้ว.
```

- [ ] **Step 6: Verify the pack is complete and uncommitted**

Run: `ls ~/Documents/openseat-interview-pack`
Expected: `architecture-walk.md  likely-questions.md  numbers.md  resume-bullets.md`

Run: `git -C ~/Documents/P2 status --porcelain | grep -i interview || echo "clean: nothing from the interview pack in the repo"`
Expected: `clean: …` (the pack lives outside the repo tree, so git never sees it).

There is no commit step — this task's deliverable is intentionally never committed.

---

## Task 7: Close — version stamp, cleanup, gate, link check

**Files:**
- Modify: `render.yaml:33`
- Delete: `apps/web/public/{file,globe,next,vercel,window}.svg`

**Interfaces:**
- Consumes: everything above.
- Produces: the M11 close — clean gate, no dead links, `APP_VERSION` m11.

- [ ] **Step 1: Bump APP_VERSION**

In `render.yaml`, change the `openseat-api` `APP_VERSION` value from `m10` to `m11` (line ~33).

Run: `grep -n "APP_VERSION" -A1 render.yaml`
Expected: the value reads `m11`.

- [ ] **Step 2: Confirm the scaffold SVGs are unreferenced, then delete**

Run: `grep -rnE "file\.svg|globe\.svg|next\.svg|vercel\.svg|window\.svg" apps/web/src apps/web/*.ts* 2>/dev/null || echo "no references"`
Expected: `no references`.

If (and only if) there are no references:

Run: `git rm apps/web/public/file.svg apps/web/public/globe.svg apps/web/public/next.svg apps/web/public/vercel.svg apps/web/public/window.svg`
Expected: five deletions staged.

- [ ] **Step 3: Rebuild web to prove the deletion is safe**

Run: `pnpm --filter web build`
Expected: build succeeds (nothing imported the removed assets).

- [ ] **Step 4: Run the full quality gate**

Run: `pnpm turbo run lint typecheck build test`
Expected: all workspaces pass (M11 changed no runtime code; a failure means the cleanup touched something it should not have).

- [ ] **Step 5: Walk every README link**

Run from repo root — extracts relative link and image targets from `README.md` and reports any missing file:

```bash
grep -oE '(\]\(|src=")([^)"]+)' README.md | sed -E 's/(\]\(|src=")//' \
  | grep -vE '^https?://|^#' \
  | while read -r p; do [ -e "$p" ] || echo "MISSING: $p"; done
```

Expected: no `MISSING:` lines. Fix any (usually a media filename typo or a moved doc) before continuing.

- [ ] **Step 6: Update the spec status and commit the close**

In `docs/specs/2026-07-19-m11-presentation-design.md`, change the Status line to `Accepted (2026-07-19) — implemented in M11.`

```bash
git add render.yaml docs/specs/2026-07-19-m11-presentation-design.md apps/web/public
git commit -m "chore: stamp m11 and drop the unused next scaffold assets"
```

- [ ] **Step 7: Report the milestone close**

Summarize for the user: the commits produced (Tasks 1–5, 7 are committed; Task 6 is intentionally outside the repo), the gate result, whether the hero shipped as GIF or stills, and the two manual follow-ups only they can do — pasting the GitHub About/topics/social-preview from `docs/github-repo.md`, and `git push origin main`. Note that this closes the roadmap.

---

## Self-Review

**Spec coverage:**
- README overhaul (spec §Decisions 1) → Task 2. ✅
- Hero GIF + fallback (§2) → Task 1 Steps 2, 4, 8; README branch in Task 2 Step 1. ✅
- Screenshots from local stack, dark (§3) → Task 1 Steps 3, 7 (theme init script, seeded stack). ✅
- `docs/media/` home, observability art stays (§4) → Task 1 outputs to `docs/media/`; README/tour link `docs/observability/` in place (Task 2 Step 2, Task 3 Step 1). ✅
- `docs/tour.md` (§5) → Task 3. ✅
- Demo-script refresh (§6) → Task 4. ✅
- GitHub copy (§7) → Task 5. ✅
- Interview pack TH+EN outside repo (§8) → Task 6. ✅
- No ADR; APP_VERSION m11; gate; link check (§9) → Task 7. ✅
- Dead-asset cleanup (spec §Scope) → Task 7 Steps 2–3. ✅

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases". Every doc step carries real prose or a concrete skeleton; every verify step is a runnable command with expected output. The waiting-room Simulate-Crowd click is guarded with `.catch(() => undefined)` so its absence never fails the capture. ✅

**Type/name consistency:** Capture specs import only existing fixture exports (`guestContext`, `demoContext`, `WEB`, `firstAvailableSeat`, `seat`, `expectSeatStatus` — all verified present). Output filenames are identical across Task 1 (production), Task 2 (README references), Task 3 (tour), and Task 5 (`social-preview.png`): `hero.gif`/`hero-left.png`/`hero-right.png`, `seat-map.png`, `console.png`, `seatmap-editor.png`, `waiting-room.png`, `team-panel.png`, `check-in.png`, `social-preview.png`. The `capture` script name matches in both `package.json` files. `render.yaml` line and `APP_VERSION` value (`m10`→`m11`) match the spec. ✅

**Constraint check:** No code comments in the capture specs, config, or shell script (shebang excepted). Commit messages are conventional and carry no AI attribution. The interview pack is created under `~/Documents/openseat-interview-pack/`, outside `~/Documents/P2`, and has no commit step. ✅

# M11 — Presentation pack ("Make the work legible")

Status: Accepted (2026-07-19) — implemented in M11.

## Goal

Ten milestones are built, deployed, and documented. Nobody who lands on the repo can tell. The README still announces **"Status: M6 — Complete"** and its roadmap table stops at M6 — the half that most argues this is a production system (M7 observability, M8 browser e2e, M9 refunds, M10 team RBAC) does not exist on the front page. There is not one screenshot in the README of a product that is almost entirely visual. The demo script is an M6-era storyboard. The strongest evidence in the repo — a 50-buyer seat race that always leaves one winner, a k6 report at ~13k joins/s, a single trace that crosses from the browser into a Go service — sits in files a recruiter will never open.

M11 does not add a feature. It builds the paths that let three different readers find what is already here: the recruiter scanning for thirty seconds, the engineer who opens the repo and reads for ten minutes, and the interviewer across the table asking "walk me through it." After M11, the front door tells the truth about the house.

## Non-goals

- **New product features or code changes.** This is a documentation-and-media milestone. The only source edits are the `APP_VERSION` stamp, a one-line refresh of the landing status badge (the last stale "milestone 6" claim in the web i18n dictionary, which the captured social preview would otherwise bake in), and removing dead scaffold assets — no runtime behavior changes, and no ADR, because nothing architectural is being decided.
- **A hosted marketing site or landing microsite.** The product's own landing page is the marketing site. M11's surface is the GitHub repo and the assets inside it, not a new deployment.
- **Rewriting the design docs, ADRs, or CONTEXT.md.** They are current through M10 and correct. M11 links to them; it does not touch them.
- **A recorded demo video.** M11 refreshes the *script* so it is recordable and current, but the recording is a manual act the user performs on camera, not a repo artifact. (The hero GIF is a separate, silent, ~10-second loop — not the demo video.)
- **Screenshotting every screen.** A curated handful that carries the product's character, not an exhaustive gallery that nobody scrolls.
- **Committing the interview pack.** The resume bullets, spoken scripts, and Q&A are personal preparation, not repo content. They live outside the repo and are never committed.

## Decisions

1. **The README tells a two-act story, not a checklist.** The status line becomes "Complete — eleven milestones, each shipped deployable," and the narrative splits the work into *build* (M0–M6: the product exists and is used) and *harden* (M7–M10: observability, browser proof, refunds, RBAC — the milestones that turn a demo into a system). This framing is the honest one: the second roadmap was a deliberate second act, and it is the more senior story to tell. The roadmap table gains rows M7–M10 in the same voice as the existing rows, each linking its ADR.

2. **The hero is a moving image, and it shows the one thing screenshots cannot.** A silent ~10-second GIF at the top of the README: two browsers side by side, a seat clicked in the left, turning `held` in the right in real time. Reserved-seating-under-concurrency is the product's whole thesis, and it is invisible in a still. The GIF is captured through Playwright (the suite already drives exactly this in the seat-race journey) into video, composed with ffmpeg. **Fallback, pre-agreed:** if the GIF cannot be brought under a sane size (~5MB) at legible quality, it degrades to a side-by-side still pair with a one-line caption — the README never ships a broken or bloated hero.

3. **Screenshots come from the local stack, seeded, dark theme — never production.** The seed builds the same demo data locally that production shows, without cold starts, rate limits, or a live URL that drifts. A curated set (seat map with held/sold seats, the Backstage Console, the seat-map editor, the waiting room, the team panel) lands in `docs/media/`. Production is for the live links, not for capture.

4. **`docs/media/` is the one media home; observability art stays where it is.** New captures land in `docs/media/`. The three existing observability images stay in `docs/observability/` beside the doc that explains them — moving them would break that page's links for no gain. The README and tour link to both.

5. **A `docs/tour.md` exists for the reader who gives the repo ten minutes.** The README sells; the tour guides. It is the "read this repo well" path: the thirty-second pitch, then the three artifacts to open first (the race test, the k6 report, the cross-language trace), then where the code worth reading actually is (the hand-built SVG seat picker, the DB-authoritative holds, the Go gate, the access ladder — as links to real files), then the process trail (spec → plan → ADR → conventional commits, every milestone deployable). English, because it is the artifact most likely to be read by an international reviewer.

6. **The demo script is refreshed to the real product, not the M6 one.** Three beats are added — a **refund** (reclaim a sold seat and watch it return to sale live), the **team/staff** chair (add a member as pending, enter as staff, get walled off from the money), and a glance at **observability** (the dashboard and the cross-service trace). Runtime grows to ~3.5 minutes; the close moves from "M0–M6" to the full eleven. This keeps the script recordable and honest without pretending the recording is done.

7. **GitHub repo copy is drafted for the user to paste, not set by the agent.** The About blurb, the topic tags, and a 1280×640 social-preview image are prepared as repo artifacts and a short block of copy. The agent cannot and does not edit GitHub repo settings; it hands the user ready-to-paste text and a ready-to-upload image. The social preview is cropped from the hero material so the repo's link unfurls with the product on it.

8. **The interview pack is bilingual and lives outside the repo.** Written to `~/Documents/openseat-interview-pack/`, never committed. It carries resume bullets in English in three framings (generalist, backend-lean, frontend-lean), a "walk me through the architecture" script in English with Thai speaking notes, and the questions this project invites with honest answers (why an outbox and not Kafka, how double-selling is actually prevented, why a role ladder instead of CASL, and the real debugging war stories — the `rate()`-window bug that silently emptied every dashboard panel, the cross-spec seat-race flake). TH+EN because the job hunt spans both markets and the spoken register differs. This is the one deliverable a portfolio milestone rarely writes down and the one most likely to matter in the room.

9. **No new ADR; the ceremony is spec + plan only.** M11 decides nothing architectural. It gets a spec (this doc) and an implementation plan for sequencing, and it closes like every milestone: `APP_VERSION` → m11, a full green gate, and a link check across the rewritten README so nothing points at a file that moved.

## Scope of changes

**Repo (committed):**

- `README.md` — rewritten status, two-act narrative, M7–M10 roadmap rows, "Proof, not claims" section, hero GIF, inline screenshots, docs map.
- `docs/media/` (new) — hero GIF (or fallback stills), 4–6 curated product screenshots, the social-preview image.
- `docs/tour.md` (new) — the ten-minute guided read.
- `docs/demo-script.md` — three new beats, retimed, closing on M10.
- `docs/github-repo.md` (new) — the About/topics copy block for the user to paste, kept in-repo as the source of truth for what was set.
- `render.yaml` — `APP_VERSION` m10 → m11.
- Dead-asset cleanup — the unused Next scaffold SVGs in `apps/web/public/` (`file`/`globe`/`next`/`vercel`/`window`.svg), only after confirming nothing references them.

**Outside the repo (never committed):**

- `~/Documents/openseat-interview-pack/` — resume bullets (EN ×3 framings), architecture-walk script (EN + TH notes), likely-questions Q&A (TH+EN), the numbers worth memorizing.

## Media production

The GIF is the one piece with real production risk, so it gets a defined pipeline with a defined exit. Playwright drives two browser contexts to the demo event, records video of the held-seat propagation, and the two videos are composed with ffmpeg (`hstack`, then a generated palette for a clean GIF at a capped width and frame rate). The target is ≤ ~5MB at a width that stays legible in the README column. If two honest attempts miss that target, decision 2's fallback triggers — a still pair — and the milestone proceeds. Screenshots are the low-risk path: boot the local stack, reseed, drive each surface in the browser at a fixed viewport in dark theme, capture, done.

## Deliverables

1. Rewritten `README.md` — status, two-act roadmap through M10, proof section, hero, inline shots, docs map.
2. `docs/media/` — hero GIF (or fallback), curated screenshots, social-preview image.
3. `docs/tour.md` — the ten-minute read for engineers.
4. Refreshed `docs/demo-script.md` — refund, team/staff, observability beats; retimed; closes on M10.
5. `docs/github-repo.md` — About + topics copy for the user to paste.
6. Interview pack outside the repo (TH+EN) — bullets, walk script, Q&A, numbers.
7. Close: `APP_VERSION` → m11, dead-asset cleanup, full gate, README link check.

## Verification

- **The README renders and every link resolves.** Preview the Markdown; walk every relative link (docs, ADRs, media, live URLs) and confirm each target exists — the rewrite moves and adds enough references that a dead link is the likely defect.
- **Media loads and is sane.** The hero displays and loops; its size is under the cap (or the fallback shipped); every screenshot referenced by the README exists in `docs/media/` and opens.
- **The tour's file links point at real code.** Each "the code is here" link resolves to the file (and line, where cited) it claims.
- **The gate stays green.** `pnpm turbo run lint typecheck build test`, jest e2e, browser suite, Go suites — nothing in M11 should move them, and a red result means the cleanup touched something it should not have. Removing the scaffold SVGs is verified by build + a grep for references before deletion.
- **The interview pack is complete and uncommitted.** All four artifacts exist in `~/Documents/openseat-interview-pack/`; `git status` shows nothing from that path (it is outside the repo tree entirely).

## Risks

- **The GIF balloons or looks cheap.** The dominant risk; contained by the pre-agreed still-pair fallback and a hard size cap. The milestone never blocks on making a perfect GIF.
- **A rewritten README link rots.** Contained by the explicit link-walk in verification.
- **Screenshot drift.** Captures are a point-in-time truth; a later UI change dates them. Accepted — they carry a milestone's character, not a contract, and the live site is always current.
- **Deleting a scaffold asset that is actually referenced.** Contained by grepping for each filename before removal and re-running the build.

## Rollout

Single commit series, docs and assets only, plus the `APP_VERSION` stamp that triggers the ordinary redeploy. No migration, no env, no new service. The interview pack never enters the repo. This is the last roadmap milestone; closing it closes the roadmap.

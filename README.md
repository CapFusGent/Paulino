# PAULINO: powerlifting coaching, with attitude

Paulino is an installable, mobile-first Progressive Web App. **Paul** (the coach) builds and shares personalised powerlifting programs. **Athletes** open a personal link, train, and log what they actually did. **Paulino**, the bearded, sunglasses-wearing mascot, gives exercise cues, celebrates finished sessions, and is *very* dramatic when someone edits Paul's plan. He is never dramatic when an athlete is protecting their body.

- Vanilla HTML/CSS/JS with ES modules. No framework and no build step, so it deploys as static files (e.g. GitHub Pages).
- Backend on **Supabase** (Postgres + Auth). Everything goes through RPC functions, guarded by row-level security.
- Works offline: the app shell is cached by a versioned service worker, the program can be read offline, and workouts logged offline are queued and synced later.

---

## Contents

1. [Quick start (local, no accounts needed)](#quick-start)
2. [What's in the app](#features)
3. [Architecture](#architecture)
4. [Data model](#data-model)
5. [Security model](#security)
6. [Offline & sync](#offline--sync)
7. [Supabase setup](#supabase-setup)
8. [Deploying the frontend](#deploying-the-frontend)
9. [Installing the app on a phone](#installing-the-app)
10. [Testing](#testing)
11. [Content: exercises, cues and Paulino](#content)
12. [What was verified, and what wasn't](#verification-status)
13. [Project layout](#project-layout)

---

## Quick start

Requires Node 20+.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The dev server prints:

```
Coach login   paul@paulino.test / paulino-dev-1234
Athlete link  Demo Athlete: http://localhost:5173/#/a/<token>
```

The dev server serves the PWA. It also emulates the two Supabase endpoints the app uses (`/auth/v1/*`, `/rest/v1/rpc/*`) on top of **PGlite**, an in-process Postgres that runs the *real* migrations from `supabase/migrations/`. So the frontend runs exactly the code it runs in production. Local data lives in `.data/pglite/`; delete that folder to reset. The credentials above exist only in that local database (`server/seed-dev.mjs`).

---

## Features

### Coach (Paul): `#/coach`
- Email/password sign-in (Supabase Auth).
- **Programs:** create blank or from *Paul's beginner 5×5* template (two alternating days, Mon/Wed/Fri, +2.5 kg after clean sessions: the structure of Paul's spreadsheet). Name, assign, set Draft / Active / Archived, save, duplicate (optionally shifting all dates), delete.
- **Editor:** weeks/blocks → workouts → exercises.
  - Quick entry per exercise: `5x5@60`, `3x8-10@40`, `5x3 bw`, `3x10 bw+2`, `1x1@100, 4x5@86%` (back-off as % of set 1, rounded up to 2.5 kg, the formula from Paul's sheet), `3x5@80 rpe8`.
  - Per-set editing (reps or range, kg / bodyweight / BW+kg / % of set 1, RPE), rest, tempo, and a coach cue that overrides Paulino's generic tips.
  - Optional **progression rule** per exercise ("+X kg after a session where every set hit its reps"). Never on unless Paul ticks it, and never applied after a session where pain was reported.
  - Reorder, duplicate, "copy as next week", dates per block and workout.
  - Edits autosave as a local draft. **Save** is version-checked: if the program was saved elsewhere in the meantime, Paul chooses explicitly whose version wins. Every save is kept as a revision.
- **Athletes:** add an athlete and get their personal link (copy / native share). Rotating the link invalidates the old one immediately; archiving an athlete disables their link.
- **Athlete overview:** adherence, streak, lift chart, every session as *planned vs done* per set (differences highlighted), pain flags, notes, and every **deviation** shown as *your plan vs their change*, with the reason.

### Athlete: `#/a/<token>`
- **Home:** greeting, program, next session, weekly streak, XP and level, this week's progress, completed workouts, PR highlights, Paulino.
- **Program:** collapsible weeks; the current one starts open; per-workout status; progress bars.
- **Workout detail:** exercises in order with sets × reps @ load, rest, tempo, RPE/RIR targets, Paul's notes, and a tappable exercise-specific Paulino cue. Buttons: **Record**, **Change**, **Restore Paul's plan**, **Skip session**, **Add exercise**.
- **Active workout:** sticky header with close button, progress bar and set counter; per-set reps/kg inputs pre-filled with the target; ✓ to complete; optional RPE and note; "NEXT" marker; rest timer (start/pause/reset/±15 s, beep + vibration, optional notification) that survives reloads. Every keystroke is saved locally, so closing the app loses nothing.
- **Results:** Paulino celebrates (or checks in, if pain was reported), with sets done, volume, XP earned, streak, new PRs, and milestones.
- **Progress:** calendar, adherence, lift chart (heaviest set + **estimated** 1RM, clearly labelled), per-session table, PR history, workout history.
- **Settings:** 4 palettes, rest-timer preferences, sync status, "Meet Paulino" (all moods), forget device.

### Paulino's rules
| Situation | Paulino |
|---|---|
| Opening the app / before training | **motivational** |
| Cues during exercises | **focused** (exercise-specific cues; Paul's own note first) |
| Finished session, PR | **happy** |
| Athlete deliberately changes the structure (swap / remove / add exercise, change sets or reps) | **disappointed**: "NOOO! Paul spent hours planning this!" → *Sorry, Paulino. Keep the plan.* / *I'm doing it anyway!* |
| Reason given is pain or fatigue | **concerned & supportive**: shows the safety advice, saves the change, no shaming |
| Logging fewer reps or a lower weight, skipping because of illness, pain reports | neutral or supportive, **never** disappointed |
| Lifting heavier than prescribed | gentle concern ("No ego lifting"), and no PR bonus XP |

Tap Paulino or his bubble for another line. A shuffle bag stops lines from repeating until every line has been shown.

---

## Architecture

```
┌──────────────── Browser (PWA) ────────────────┐        ┌────────── Supabase ──────────┐
│ index.html + src/ (ES modules, no build)      │        │ Auth (coach email/password)   │
│  router.js     hash routes + pushState        │  HTTPS │ PostgREST  /rest/v1/rpc/*     │
│  screens/      athlete/*, coach/*             │ ─────► │ Postgres                      │
│  core/         pure logic (tested in Node)    │        │  • tables + CHECKs + triggers │
│  store/        offline-first stores           │        │  • RLS (coach_id = auth.uid())│
│  api/          tiny fetch client (no SDK)     │        │  • coach_* (security invoker) │
│ sw.js          versioned app-shell cache      │        │  • client_* (definer, token)  │
└───────────────────────────────────────────────┘        └───────────────────────────────┘
```

- **No SDK:** `src/api/supabase.js` is ~120 lines of `fetch` covering password auth, token refresh and RPC calls.
- **Pure core:** `src/core/` (prescriptions, progression, stats, validation, effective view) has no DOM access and is unit-tested in Node.
- **Navigation:** hash routes driven by `history.pushState` and `popstate`, so Android/browser back works and any static host works. Leaving the active workout never discards sets.

---

## Data model

Prescriptions (what Paul planned) and logs (what happened) are separate tables. Deviations never modify Paul's rows.

| Table | Key columns |
|---|---|
| `profiles` (coach users) | `id` → `auth.users`, `role = 'coach'`, `display_name` |
| `clients` (athletes) | `id`, `coach_id`, `role = 'client'`, `display_name`, `access_token` (64 hex), `archived` |
| `exercises` | `id` (slug), `name`, `category` (squat/bench/deadlift/accessory), `description`, `tips` {setup, execution, mistakes, bracing, safety}, `coach_id` (null = core library) |
| `programs` | `id`, `name`, `coach_id`, `client_id`, `status`, `notes`, `version`, `created_at`, `updated_at`. One *active* program per client. |
| `blocks` | `id`, `program_id`, `name`, `position`, `start_date`, `end_date` |
| `workouts` | `id`, `program_id`, `block_id` (composite FK keeps them in the same program), `name`, `scheduled_date`, `position` |
| `prescriptions` | `id`, `workout_id`, `exercise_id`, `position`, `sets` (per-set reps/range/load/RPE/RIR, validated by `private.valid_sets`), `rest_seconds`, `tempo`, `coach_notes`, `progression` |
| `program_revisions` | full snapshot per coach save (`version`, `saved_at`, `saved_by`) |
| `workout_logs` | `id`, `workout_id` (nullable, survives deletion), `client_id`, `workout_snapshot` (frozen prescription), `status`, `skip_reason`, `session_rpe`, `pain_reported`, `notes`, `client_updated_at` |
| `set_logs` | per set: `prescription_id`, `exercise_id`, `target`, `actual_reps`, `actual_load_kg` (≥ 0), `rpe`, `completed`, `notes` |
| `deviations` | `client_id`, `workout_id`, `prescription_id`, `modification_type`, `reason`, `original` (written by the server from Paul's row), `modified`, `status` (active/reverted/superseded) |

Schema: [`supabase/migrations/20261020120000_paulino_schema.sql`](supabase/migrations/20261020120000_paulino_schema.sql). Exercise library: [`20261020120100_exercise_library.sql`](supabase/migrations/20261020120100_exercise_library.sql), generated from `src/data/exercises.js` by `node scripts/gen-exercise-sql.mjs`.

---

## Security

- **Coach:** every `coach_*` function is `SECURITY INVOKER`, so Postgres **row-level security** decides what is visible (`coach_id = auth.uid()` and joins from it). Coaches can *read* their athletes' logs and deviations, never write them. Triggers stop a program being assigned to another coach's client or using another coach's custom exercise.
- **Athlete:** athletes don't sign in. Their link carries a 64-hex-character random token (244 bits). The `anon` role has **no table privileges at all**. It can only execute `client_get_bundle` and `client_sync`, which are `SECURITY DEFINER`, resolve the token to exactly one non-archived client, and touch only that client's rows. They verify that every workout or prescription belongs to that client's program, refuse to overwrite another client's log, and write `original` on deviations from the server's own copy. Editing a URL or local data cannot grant coach rights. Those functions aren't callable by anon, which the tests check.
- **Validation in depth:** the same rules run in the browser (`src/core/validation.js`, for readable messages) and in the database (CHECK constraints, `private.valid_sets`, composite FKs, triggers).
- The token is in the URL **fragment** (`#/a/…`), so it isn't sent to the web host. `<meta name="referrer" content="no-referrer">` is set. Treat a link like a password: rotate it from the athlete page if it leaks.
- `config.js` contains only the public anon key. Never put a service-role key in the frontend (the validator checks for this).

---

## Offline & sync

- **App shell:** `sw.js` precaches every file (validated: the build fails if a file in `src/` is missing from the list). Navigations are network-first with a cache fallback; assets are stale-while-revalidate; Supabase calls are never cached. Bump `VERSION` in `sw.js` on each release; old caches are deleted on activate, and the app tells the user a new version is ready.
- **Athlete data:** the last bundle (program, exercises, logs, deviations) is stored in `localStorage` and is readable offline.
- **Writes:** each log/deviation is written locally first with `dirty: true` and a `client_updated_at` timestamp. `client_sync` pushes all dirty records in one idempotent call when the app opens, when connectivity returns, when the tab becomes visible, every 30 s, and shortly after each change.
- **Conflicts:** per workout, the newest `client_updated_at` wins. An older copy from another device is answered with `stale` plus the server version, which the device adopts and announces ("This workout was updated on another device. That newer version was kept."). Nothing is overwritten silently. Device clocks are trusted for ordering, which is fine for one athlete's own phones.
- **Coach saves** use optimistic concurrency (`expected_version`): a stale editor gets a `version_conflict` (HTTP 409) and an explicit choice.
- Completed logs keep a **frozen snapshot** of what was prescribed. Later edits, or even deleting the workout, never change history.

---

## Supabase setup

1. **Create a project** at https://supabase.com (the free tier is fine).
2. **Apply the migrations**, either:
   - with the CLI (recommended):
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-ref>
     npx supabase db push
     ```
   - or by pasting `supabase/migrations/20261020120000_paulino_schema.sql`, then `…120100_exercise_library.sql`, into the SQL editor, in that order.

   Never run `supabase/dev/auth_stub.sql` on Supabase. It exists only for the local PGlite emulation.
3. **Auth settings** (Authentication → Providers / URL configuration):
   - Email provider enabled. With "Confirm email" on (the default), Paul confirms his address before the first sign-in.
   - Set **Site URL** to your deployed URL (e.g. `https://capfusgent.github.io/Paulino/`), so the confirmation email links back to the app.
   - **After Paul has created his account, turn off "Allow new users to sign up".** Anyone who signs up only gets an empty, isolated coach workspace, but there's no reason to allow it.
4. **API keys:** copy the Project URL and the *anon* (or *publishable*) key from Project Settings → API into `config.js`, or into repository variables for the Pages workflow.
5. Optional: if you add new functions in later migrations, end each migration with explicit `revoke … from anon, authenticated` / `grant` statements, as the first migration does. Supabase grants execute on new functions to `anon` by default.

---

## Deploying the frontend

**GitHub Pages (workflow included):**
1. Repository → Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → **Variables**: add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
3. Push to `main`. `.github/workflows/deploy.yml` writes `config.js` from those variables and publishes `index.html`, `manifest.webmanifest`, `sw.js`, `src/`, `styles/` and `assets/`.

**Any other static host** (Netlify, Cloudflare Pages, S3…): upload the same files with a filled-in `config.js`. Nothing needs server rewrites. Serve over HTTPS (required for service workers and installation).

`.github/workflows/ci.yml` runs validation, unit tests and the Playwright suite on every push/PR.

---

## Installing the app

- **Android (Chrome):** open the link → ⋮ menu → *Install app* / *Add to Home screen*.
- **iPhone/iPad (Safari, iOS 15.4+):** open the link in Safari → Share → *Add to Home Screen*.
- **Desktop Chrome/Edge:** install icon in the address bar.

Athletes should install from **their personal link**. When the installed app opens on a phone used by one athlete, it goes straight to their training. The same instructions are in the app at `#/install`.

---

## Testing

```bash
npm run validate     # content & config checks (below)
npm test             # unit + database tests (node:test, PGlite)
npm run test:e2e     # Playwright end-to-end, 360 px viewport
# use the installed Chrome instead of downloading Chromium:
PW_CHANNEL=chrome npm run test:e2e
```

**`npm run validate`** checks the exercise library (unique ids, categories, every exercise has setup/execution/mistakes/bracing/safety cues, no "guaranteed safe" claims), that the generated SQL matches the JS library, that templates validate, Paulino's lines (5 states, bubble length, no duplicates, no disappointed lines in pain/fatigue/skip contexts), **WCAG contrast ≥ 4.5:1** for every text/background token pair in all four palettes, service-worker shell completeness, manifest icons (32/180/192/512 + maskable), and that no secret key is in `config.js`.

**Unit tests** (`test/unit/core.test.js`) cover quick-entry parsing, back-off formula, progression (hit / miss / pain / no rule), PR baseline, XP (no bonus above the plan or with pain), forgiving weekly streak, adherence, validation errors, deviation classification, and the effective view keeping Paul's original.

**Database tests** (`test/unit/database.test.js`) run the real migrations and call functions as `anon`/`authenticated`, exactly like PostgREST. They cover: create/name/save/edit with versions and conflicts; duplicate; one active program per client; anon has no table access and can't call coach functions; coach-to-coach isolation (including id hijacking and cross-coach assignment); DB-level rejection of invalid sets, loads, dates, exercises and progression rules; link scoping, invalid links and rotation; athletes can't write into other athletes' data; newest-write-wins with stale replies; deviations store the server-side original and restore keeps history; logs survive program edits and workout deletion.

**End-to-end** (`test/e2e/`, Playwright, 360 × 760 touch viewport):
- `coach.spec.js`: sign up → add athlete → create & name program → add/reorder exercises with quick entry → Active → Save → share link → edit (draft restored after reload) → save v2 → validation blocks an empty name → duplicate.
- `athlete.spec.js`: open link → Paulino cycles lines → record sets (fewer reps, lower weight: no drama) → reload keeps them → finish → results. **Paul on a separate browser context (second device)** sees planned vs done. Plus: skip for illness is supportive; a pain report shows safety advice and no celebration.
- `deviation.spec.js`: change sets → **disappointed Paulino** → *Keep the plan* (nothing saved) → *I'm doing it anyway* (deviation saved, original kept) → Paul sees original vs modified → **restore** → Paul sees "restored". Pain as a reason → supportive. Removing an exercise is a deviation; logging a lower weight isn't; a heavier weight shows a gentle warning.
- `sync.spec.js`: manifest/icons/service worker; **app shell and program load with the network off**; a **workout logged offline** reaches the server only after reconnecting; two devices: the older offline copy doesn't overwrite the newer one and the user is told; history intact after Paul edits and deletes the logged workout.
- `visual.spec.js`: home, program, workout, active, progress, settings in **all 4 palettes**, results, coach dashboard/editor/athlete page, welcome and install, all checked for no horizontal scroll at 360 px; **all five moods** rendered. Screenshots are written to `test-results/screens/`.

---

## Content

- **Exercise list:** taken from Paul's own program spreadsheet: back squat, bench press, deadlift, overhead press, barbell row, pull-up. That list is the approved set. Paul can add more from the editor ("Exercise not listed? Add it to your library"); nothing else is introduced automatically.
- **Coaching cues:** `src/data/exercises.js`. Short, conservative, widely taught barbell cues per exercise (setup, execution, common mistakes, bracing, safety). General guidance is paraphrased from Paul's written guidelines in the spreadsheet: warm-up, 1–2 reps in reserve, rest 1:30–3:00, soreness up to 2–3/10 is OK, stop on sharp pain and wait 48 h. **No powerlifting books were included with the brief**, so no book content was used. If you add references, extend the cues there; Paul's per-exercise notes always come first. Nothing claims that a cue prevents injury.
- **Paulino's art:** **the reference image wasn't included either**, so Paulino is an original SVG character in the requested collage style (black-and-white "photo" cut-out with grain, halftone, white sticker edge and flat shadow, over torn paper in the palette accent): dark hair and beard, sunglasses or expressive eyes, muscular, tank top, five poses. To use the real reference, export transparent PNG/WebP cut-outs per mood and set in `config.js`:
  ```js
  mascotImages: { motivational: 'assets/paulino/motivational.png', focused: '…', happy: '…', disappointed: '…', concerned: '…' }
  ```
  Add the files to `SHELL` in `sw.js`, then run `npm run icons` after changing `src/ui/paulino-art.js` to regenerate icons and `assets/paulino/*.svg`.
- **Lines:** `src/data/messages.js`.

---

## Verification status

Verified by automated tests in this repository:
- All database logic, RLS and permission rules, against **real Postgres (PGlite)** running the exact migrations, with Supabase's `anon` / `authenticated` roles and `auth.uid()` reproduced.
- All UI flows above, end to end in Chrome at 360 px, including offline mode, the service worker and two-device sync, against the local Supabase-compatible server.

**Not** verified:
- **A live Supabase project.** The migrations use only standard Postgres and Supabase conventions, but they haven't been applied to hosted Supabase, and real sign-up/email confirmation hasn't been exercised. Do the [setup](#supabase-setup), then a quick smoke test: sign up as Paul, create an athlete, open the link on a phone.
- **Physical iOS Safari / Android devices.** The tests use desktop Chrome with touch emulation. "Add to Home Screen" and timer notifications while the phone is locked depend on the OS. Browsers pause background timers, so the rest-timer notification can be late when the app is in the background.

---

## Project layout

```
index.html, manifest.webmanifest, sw.js, config.js   PWA entry, manifest, service worker, deploy config
styles/app.css                                       collage design system, 4 palettes
src/app.js, src/router.js                            bootstrap, history-based routing
src/api/supabase.js                                  fetch client (auth + RPC)
src/core/                                            pure logic: prescription, progression, stats, validation, effective, templates
src/data/                                            exercise library + cues, Paulino's lines, safety copy
src/store/                                           storage, offline-first athlete store, coach store
src/ui/                                              DOM helpers, Paulino art + component, charts, rest timer, layout
src/screens/                                         welcome, install, athlete/*, coach/*
assets/icons, assets/paulino                         generated icons and mascot SVGs
supabase/migrations/                                 schema, RLS, RPC API, exercise library
supabase/dev/auth_stub.sql                           local-only Supabase stand-in for PGlite
server/                                              dev server (static + Supabase emulation on PGlite), demo seed
scripts/                                             validate-data, gen-exercise-sql, build-icons
test/unit, test/e2e                                  node:test + Playwright
```

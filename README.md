# PAULINO: powerlifting programs, made, shared and trained

Paulino replaces Paul's Excel training programs with something nicer to make and nicer to follow.

**Paul builds a program → saves it → shares a link or a file → the athlete follows it and logs their training.**

- **One file:** the whole app is a single `index.html` (HTML, CSS and vanilla JavaScript), plus a few icons.
- **No accounts, no backend, no database server, no cloud.** Everything runs in the browser and is stored in the browser.
- Deployable on GitHub Pages or any static host. After the page has loaded, it works without a connection.
- **Paulino is Paul**: a photomontage of Paul's real photos (hand-cut, paper-edged, collaged with flat paper, halftone and marker). He gives technique cues, celebrates finished workouts, and is very dramatic when an athlete edits Paul's plan. He is never dramatic when the athlete is protecting their body.
- **Lifting Academy:** scrolling, magazine-style lessons for five barbell lifts.
- Visual identity: a vintage strength magazine made interactive. See [`design/VISUAL_GUIDE.md`](design/VISUAL_GUIDE.md) and [`design/ASSET_NOTES.md`](design/ASSET_NOTES.md).

---

## Contents
1. [Run it](#run-it)
2. [What Paul can do](#paul)
3. [What the athlete can do](#athlete)
4. [Repeat / Progress: the rule engine](#rule-engine)
5. [Sharing: links, `.paulino` files, PDF](#sharing)
6. [Program data format](#data-format)
7. [Browser storage](#storage)
8. [Paulino's reactions](#paulino)
9. [Lifting Academy](#lifting-academy)
9. [Content sources](#content)
10. [Deploy to GitHub Pages](#deploy)
11. [Tests](#tests)
12. [Code layout](#code-layout)
13. [Adding progress sharing later](#future)

---

## Run it

Open `index.html` through any static web server:

```bash
npm install          # only needed for the tests
npm start            # → http://localhost:5173
```

Any static server works (`python -m http.server`, VS Code Live Server…). Opening the file directly from disk (`file://`) mostly works too, but browsers limit storage and clipboard on `file://` pages, so use a server.

---

## Paul

Start screen → **I'm Paul: create programs**.

- **Library:** saved programs with athlete and creation date; sort by last edited, name, athlete or created. Each one can be opened, renamed, duplicated, deleted, shared, exported as a file, or printed.
- **New program:** name, optional athlete, start date, duration in weeks, general instructions. Start **from scratch** (one empty week) or **duplicate an existing program**.
- **Editor:** a compact, spreadsheet-like grid per training day: *Exercise · Sets · Reps · kg*. Edit the cells directly.
  - Expand a row for **advanced options**: rest interval, tempo, instructions for the athlete, and **per-set** reps, kg, bodyweight, RPE and RIR (different reps or weights per set are fine; the grid then shows "mixed").
  - Training days: add, remove, rename, choose the weekday, duplicate, move up/down, copy to another week.
  - Exercises: add from the approved library, reorder, duplicate, move or copy to another day, delete.
  - Weeks: rename, duplicate (inserted after), add, delete.
  - Edits save automatically in the browser ("Saved on this device").
- **Repeat / Progress:** turn one template week into a whole block. See [the rule engine](#rule-engine).
- **Share:** a link, a `.paulino` file, or a printable version / PDF.

## Athlete

Open the link Paul sent, or **Import program file** with his `.paulino` file. No login.

- **Home:** athlete name, current program and week, next workout, completion progress, PRs, Paulino.
- **Program:** collapsible weeks (the current week is open), with dates, exercises, sets × reps, completion status and progress bars.
- **Workout:** each exercise with Paul's prescription, rest, tempo, RIR, Paul's notes and a tappable Paulino tip. Each set has *actual reps* and *actual kg* inputs (pre-filled with the target) and a ✓ button. There's an optional rest timer (start, pause, ±15 s, reset, beep) that survives reloads. The prescription ("Paul: 5 × 100 kg") is always shown next to what was done.
- **Results:** sets and exercises completed, actual loads and reps against the plan, volume, new PRs, Paulino celebrating.
- **Progress:** completed workouts, per-exercise history (heaviest set and reps per set), a chart of weight per session with a clearly labelled **estimated** 1RM, and personal records.
- **My programs:** switch between current and older programs, delete, print, back up and restore.

Everything the athlete does stays on their device. Nothing is sent to Paul.

---

## Rule engine

**Repeat / Progress** takes a template week and generates N following weeks. The result is an ordinary program: every generated week can be edited by hand afterwards.

1. Choose the template week and the number of weeks to generate. Choose whether to **overwrite** the following weeks or **insert** new ones and keep the existing weeks.
2. Add rules. Presets: *+2.5 kg / week*, *+1 rep / 2 weeks*, *+1 set / 4 weeks*, *+2 % / 2 weeks*, *deload every 4th week*, or a custom rule.
3. Look at the **preview table** (weeks × exercises). It updates live; deload weeks and kept manual edits are highlighted.
4. **Apply.** If existing weeks would be overwritten, Paul confirms first.

| Rule | Effect |
|---|---|
| Repeat unchanged | Copies the week as it is. Having no rules does the same. |
| ± Weight (kg) | Adds the amount; a negative amount decreases |
| ± Weight (%) | Multiplies the load by (1 + amount/100), compounding |
| ± Reps | Adds reps (whole numbers; negative decreases) |
| ± Sets | Adds sets (copies the last set) or removes from the end |
| Deload week | On every N-th week only: load − X % (and optionally − sets). With *restart*, progression starts again from the template after each deload. |

**Scope.** Each rule applies to all exercises, to selected exercises (e.g. every squat), to selected training days, or to single entries. Different exercises can have different rules: e.g. squat +2.5 kg/week, bench +1.25 kg/week, deadlift +5 kg/2 weeks, accessories +1 rep/week.

**Frequency.** Every 1, 2, 3, 4, 5, 6 or 8 weeks, or any N weeks. The template is week 1. A rule "every *n* weeks" has been applied ⌊k / n⌋ times by generated week *k* (k = 1, 2…). So *+1 rep every 2 weeks* changes weeks 3, 5, 7…, and *deload every 4th week* marks weeks 4, 8, 12…. Four-week blocks are counted in weeks, never calendar months.

**Constraints** (per rule): minimum and maximum weight, reps or sets, and a load rounding increment (0.5, 1, 1.25, 2.5 or 5 kg, or none). Loads are rounded only when a load rule touched them. Results are always clamped to ≥ 0 kg, ≥ 1 rep and 1–30 sets. Invalid rules (amount 0, fractional reps, ±100 %, empty scope, min > max…) are listed and block **Apply**.

**Order.** Rules apply in list order: weight / percent / reps / sets first, then deloads, then clamping and rounding. The engine is pure and deterministic. The same input always gives the same output, with no randomness, no backend and no spreadsheet engine.

**Manual overrides.** Generated exercises are marked *generated*; editing one marks it *edited*. When Repeat / Progress runs again over those weeks, Paul can keep his edits (default) or let them be regenerated.

Example: template week squat 4×5 @ 100 kg, rules *squat +2.5 kg/week* and *deload every 4th week −10 %*:

| Week | 1 | 2 | 3 | 4 (deload) | 5 | 6 | 7 | 8 (deload) |
|---|---|---|---|---|---|---|---|---|
| Squat | 100 | 102.5 | 105 | 97.5 | 110 | 112.5 | 115 | 105 |

(Week 4 would be 107.5; −10 % = 96.75 kg, rounded to 97.5.)

---

## Sharing

### Link
**Share → Copy.** The whole program is serialized into a compact, versioned format, compressed (deflate), base64url-encoded and put in the **URL fragment**:

```
https://capfusgent.github.io/Paulino/#program=z1.<data>
```

The fragment is never sent to the web server. The link contains the full program, so it opens in any browser, independently of Paul's. A 12-week, 2-day program is typically 1–2 thousand characters.

The share sheet shows the link length:
- **≤ 2,000 characters:** works everywhere.
- **≤ 8,000:** fine in browsers and most apps.
- **Longer:** some messaging apps cut the link off, so Paul gets a warning to send the file instead.

A damaged or truncated link shows a clear error instead of a broken program. Browsers without `CompressionStream` fall back to uncompressed `j1.` links.

### `.paulino` file
**Share → Download .paulino file**, e.g. `Marco_Strength_Block_1.paulino`. It's readable, versioned JSON (see the [format](#data-format)): a data file, not an executable. The athlete taps **Import program file**; the app reads it locally, checks the format, version and every field, and shows the program.

### Printable version / PDF
**Share → Printable version.** A clean layout with title, athlete, dates, notes, Paulino branding and every week as a table with tick boxes. **Print / Save as PDF** uses the browser's print dialog with a dedicated print stylesheet.

### Snapshots
Shared links and files are **snapshots**. When Paul edits a program, links and files already sent keep showing the old version; he sends a new link or file for the new version. Each snapshot has a content-based `revision`, so:
- Opening the **same** snapshot again on the athlete's device just opens it ("You already have this one!"). It is never duplicated.
- Opening a **newer** snapshot of the same program (same `id`) offers *Update to the new version*. The athlete's logs stay attached by day and exercise id, or *Keep my current version*.

---

## Data format

`.paulino` files contain this JSON (shared links carry the same data in compact positional arrays, documented in the `share` module of `index.html`):

```jsonc
{
  "format": "paulino-program", "v": 1,
  "id": "p3f9…", "revision": "1x2k9a",          // stable program id + content hash of this snapshot
  "name": "Strength block 1", "athlete": "Marco",
  "startDate": "2026-11-02", "durationWeeks": 12,
  "notes": "Warm up on every lift…",
  "createdAt": "…", "updatedAt": "…", "exportedAt": "…",
  "weeks": [{
    "id": "8c1d…", "label": "",                  // "" → "Week 1"
    "gen": { "from": 1, "deload": false },        // only on generated weeks
    "days": [{
      "id": "a71e…", "name": "Monday", "weekday": 0,   // 0 = Monday … 6 = Sunday
      "notes": "Superset bench + row",
      "exercises": [{
        "id": "f02b…", "exerciseId": "squat",           // stable id from the approved library
        "sets": [{ "reps": 5, "kg": 100, "bw": false, "rpe": 8, "rir": null }],
        "rest": 120, "tempo": "3-1-1", "notes": "Brace hard",
        "gen": true, "edited": false, "src": "…"       // editor bookkeeping (not in links)
      }]
    }]
  }]
}
```

- Workout dates come from `startDate`: Monday of the start week + 7 × week + weekday.
- `kg: null, bw: true` is bodyweight; `bw: true, kg: 5` is bodyweight + 5 kg.
- **Validation** (`model.validate`) runs before every share/export and on every import. It checks for: a name; a valid start date; 1–104 weeks; at most 7 days per week; unique ids; an approved exercise id; 1–30 sets; whole-number reps 1–100; weights 0–1000 kg (or bodyweight); RPE 1–10; RIR 0–10; rest 0–30 min. Newer format versions are refused with a message instead of being misread.

---

## Storage

| Where | What |
|---|---|
| IndexedDB `paulino` → `paul` | Paul's programs |
| → `athlete` | programs the athlete received (Paul's prescription, never modified) |
| → `logs` | one record per trained or skipped day: actual sets, reps, kg, done, notes, pain flag |
| → `mods` | the athlete's local changes to exercises, with Paul's original kept alongside |
| `localStorage` | small preferences: palette, rest timer, current program, library sort |

Prescriptions, actual results and modifications are stored separately, and exercises use stable ids, so history and PRs work across programs. If IndexedDB is unavailable, Paulino falls back to `localStorage`. If that's blocked too (some private modes), it keeps data in memory for the tab and says so. Every storage error is caught and shown, never a crash.

**Local means local.** Clearing browser data, private windows, another browser or a new phone means starting empty. **Settings → Export backup** downloads everything (both roles) as one JSON file; **Restore backup** merges it back. The app reminds users of this on the library and settings screens.

---

## Paulino

Six moods: **motivated, focused, happy, celebrating, disappointed, concerned**. Each is a photomontage built from real cut-outs of Paul (`assets/paulino/`) with paper scraps, halftone, marker notes and a speech bubble: cloud, shouting burst, or magazine callout. There are no genuine sad or worried photos, so those moods are carried by tilt, black-and-white, colour and marks, never by altering his face. Tap Paulino or his bubble for another line; lines don't repeat until all have been shown. The recipes are in the `art` module, and the full kit is in [`design/VISUAL_GUIDE.md`](design/VISUAL_GUIDE.md).

| Situation | Reaction |
|---|---|
| Home, before training | motivated |
| Exercise tips during the workout (Paul's note first) | focused |
| Plan restored, program saved | happy |
| Workout finished, new PR | celebrating |
| Athlete changes the **structure** of Paul's plan (fewer/more sets, other reps, other exercise, skipping an exercise, going heavier) | disappointed: *"WHAT?! Paul made this program for a reason!"*, *"You're changing Paul's masterpiece?! I'm disappointed!"*, with **Keep Paul's plan** / **Change anyway** |
| The same change with reason *pain* or *fatigue* | concerned & supportive, with safety advice |
| Logging fewer reps or less weight in a set; a lighter load via "Change"; skipping for illness; reporting pain | neutral or supportive, never disappointed |

A change is stored as a local modification. Paul's original stays intact and is shown next to it, and **Restore Paul's plan** undoes it.

**Palettes:** Original Collage (warm off-white, mustard, pink and teal shapes, black), Electric Pink, Teal Power, Blue Energy. Text colours meet WCAG 4.5:1 contrast.

**Fonts:** Bricolage Grotesque (headings), Atkinson Hyperlegible (body), JetBrains Mono (numbers), loaded from Google Fonts with system fallbacks. Without a connection the system fonts are used.

**The character kit:** `tools/build_cutouts.py` (a dev tool, not deployed) cuts Paul out of his original photos along hand-placed outlines and writes the WebP cut-outs. The originals stay out of the repository because they show other people. Asset ids map to files through [`assets/asset-manifest.json`](assets/asset-manifest.json), which the app loads at start-up, with a built-in copy as fallback. A missing image degrades to a paper "P" placeholder instead of a broken picture.

---

## Lifting Academy

`#/academy`: a contents page and one vertically scrolling "magazine" per lift. Each step is a full-height page with:
- the photo of that exact phase;
- a step number and phase tag;
- a short explanation;
- a *Coaching choice* note where the step is one coach's approach rather than a general principle;
- Paulino with a tappable cue.

Pages slide in as they scroll into view (turned off with reduced motion), and a progress rail runs along the top. Workout cards link to the matching lesson ("Learn the lift").

- **Lessons:** squat, press, deadlift, bench press, power clean. These are the five *candidate* chapters from *Starting Strength*; **Paul still has to confirm the list**. The power clean isn't one of his program exercises.
- **Text:** original, short wording written from the book chapters, which were read privately and are never deployed. No quotations or figures. Marked *draft* until Paul reviews it.
- **Photos:** no cleared phase-by-phase photos exist yet, so every step shows a **PHOTO NEEDED** slot describing the exact shot required. Unrelated images are never substituted. Adding a photo means one entry in `asset-manifest.json` → `lesson_photo_slots` (e.g. `lesson_squat_bottom_loaded`). Bar-path arrows and labels (`annotations`, in % of the photo) are added together with it and checked against that photo.

---

## Content

- **Approved exercises:** taken from Paul's own program spreadsheet: back squat, bench press, deadlift, overhead press, barbell row, pull-up. Only these can be selected, by Paul and by the athlete. To change the list, edit `EXERCISES` in the `data` module.
- **Cues** per exercise: setup, execution, common mistakes, bracing, safety. They're short, conservative and widely taught. General guidance paraphrases Paul's written guidelines from the spreadsheet: warm up, 1–2 reps in reserve, rest 1:30–3:00, soreness up to 2–3/10 is usually fine, stop on sharp pain and rest 48 h. Paul's own exercise notes are always shown first.
- **Supplied material** (`paulino_complete_handoff_v3.zip`): Paul's four photos are used as hand-cut cut-outs. The historical lifting photos have unverified rights and are kept out of the app. The books are private references only. Details and missing items are in [`design/ASSET_NOTES.md`](design/ASSET_NOTES.md). The cues make no claims that a technique prevents injury, and Paul remains responsible for the program.

---

## Deploy

GitHub Pages, via the included workflow `.github/workflows/deploy.yml` (no build, no secrets):

1. Repository → **Settings → Pages → Source: GitHub Actions**.
2. Push to `main`, or Actions → *Deploy to GitHub Pages* → **Run workflow**.

It publishes `index.html`, `assets/` (icons, Paul's cut-outs, the manifest), `.nojekyll` and `sw.js`. Never `tools/`, `design/` or any source photos or books. `sw.js` is a retired service worker: it removes the caching service worker of the earlier PWA version from browsers that still have it. Any other static host works the same way: upload those files.

The earlier version of Paulino used Supabase. That project and the `SUPABASE_URL` / `SUPABASE_ANON_KEY` repository variables are no longer used and can be deleted.

---

## Tests

```bash
npm install
npx playwright install chromium   # once
npm test                          # 30 browser tests at 360 px
PW_CHANNEL=chrome npm test        # …or use the installed Google Chrome
```

Every test fails on any JavaScript error or `console.error` in the page. Screenshots, the generated PDF and the `.paulino` file are written to `test-results/screens/`.

| Scenario from the brief | Test |
|---|---|
| 1 Create a four-week program manually | `paul.spec.js` › 1 |
| 2 Repeat week 1 unchanged for 12 weeks | `engine.spec.js` › repeat…; wizard preview in `paul.spec.js` › 2–6 |
| 3 Squat +2.5 kg every week | `engine.spec.js`, `paul.spec.js` › 2–6 |
| 4 Bench reps every two weeks | `engine.spec.js` (with max), `paul.spec.js` › 2–6 |
| 5 Different rules for different exercises | `engine.spec.js` (squat / bench / deadlift / sets / %), `paul.spec.js` › 2–6 |
| 6 Deload | `engine.spec.js` (with and without restart), `paul.spec.js` › 2–6 |
| 7 Manually override a generated week | `paul.spec.js` › 7, `engine.spec.js` › manual edits |
| 8 Duplicate a saved program | `paul.spec.js` › 8 |
| 9 Save and reopen locally | `paul.spec.js` › 1 (reload) |
| 10 Export and import a `.paulino` file | `paul.spec.js` › 10 (another browser context, no duplicates, broken file) |
| 11 Shared link in a fresh browser | `paul.spec.js` › 11 (fresh context, snapshot vs. update, damaged link) |
| 12 Athlete progress after reload | `athlete.spec.js` › 12 |
| 13 Modify → Paulino disappointed | `athlete.spec.js` › 13 |
| 14 Restore the original | `athlete.spec.js` › 13/14 |
| 15 360 px | `layout.spec.js` (every screen, 4 palettes, wizard & share sheets) |
| 16 Printable version | `paul.spec.js` › 16 (print media + real PDF) |

Also covered: the Lifting Academy (`academy.spec.js`: all lessons scroll, cues cycle, placeholders instead of unrelated photos, a manifest photo replaces its placeholder with annotations, missing images fall back to paper); validation of programs, rules, files and links; supportive reactions for pain, fatigue, lighter loads and illness; backups; the six moods; and the app working with storage blocked.

---

## Code layout

`index.html` holds the whole app: the CSS, then one `<script>` per module, each attached to `window.Paulino`:

| # | Module | Responsibility |
|---|---|---|
| 1 | `util` | dates, numbers, escaping HTML templates, sheets, toasts, file helpers |
| 2 | `data` | approved exercises and cues, Paulino's lines, safety copy |
| 3 | `model` | program structure, defaults, summaries, validation, normalisation |
| 4 | `rules` | the Repeat / Progress engine, preview, rule validation |
| 5 | `share` | link encoding / decoding, `.paulino` files |
| 6 | `store` | IndexedDB with fallbacks, backups, preferences |
| 7 | `stats` | history, PRs, estimated 1RM, progress |
| 8 | `art` | asset manifest, Paulino photo collages (six moods), photo slots, annotations |
| 9 | `ui` | mascot component, layout, palettes, chart, rest timer |
| 10 | `academy` | Lifting Academy lessons (data + scrolling pages) |
| 10 | `paul` | library, editor, wizard, share sheet, print view |
| 11 | `athlete` | import, home, program, workout, modifications, results, history, library |
| 12 | `app` | hash router (`pushState`/`popstate`), start screen, settings, boot |

Other files: `assets/paulino/` (Paul cut-outs), `assets/asset-manifest.json`, `assets/icons/`, `sw.js` (retired worker), `tools/build_cutouts.py` (character kit, dev only), `design/` (visual guide, asset audit), `test/` (Playwright tests and a tiny static server).

---

## Future

**Share progress** isn't built yet, but the pieces are there: logs are self-contained records keyed by program id, day id and exercise id, and the link/file encoders are generic. A "Share progress" button could serialize the athlete's logs for one program, the same way `share.toCompact` does for programs, into a `#progress=` link or a `.paulino-progress` file. Paul's app would import it and show it next to his program. No backend needed.

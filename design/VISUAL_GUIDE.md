# Paulino: visual design guide

**A vintage strength magazine that became interactive.** Every graphic should look like it could have been cut out with scissors, glued to paper and scanned. Strong, funny, a bit ridiculous, and technically clear.

## Rules of thumb
- **2D only.** Photo cut-outs, flat paper, halftone dots, marker scribbles and hard offset shadows (`4px 4px 0 ink`). No gradients-as-lighting, no blur, no 3D, no glossy buttons, no AI imagery.
- **One dominant photo per composition**, two or three paper scraps, one set of marks, one bubble. Leave negative space.
- **Mild rotation** (±1–5°) and asymmetry for the handmade feel. Text that must be read stays horizontal.
- **Data stays clean.** Numbers, inputs and set rows never sit on textures or under collage layers. The editor and the workout screen get only small accents.

## Colour
| Token | Original Collage | Use |
|---|---|---|
| `--bg` | `#F5EFE3` warm off-white | page paper |
| `--accent` | `#F4B942` mustard | primary scraps, buttons, masthead |
| `--pop-1` | `#EF6497` pink | colour blocks, "edited" |
| `--pop-2` | `#169E96` teal | colour blocks, secondary scraps |
| `--pop-3` | `#285BC7` blue | occasional accent |
| `--pop-4` | `#F2774B` orange | "concerned" scraps |
| `--ink` | `#141414` | text, outlines, shadows |

Four palettes (Original, Pink, Teal, Blue) swap `--bg` and `--accent`. Text pairs are checked for ≥ 4.5:1 contrast. Photos of Paul are shown in black and white (CSS `grayscale + contrast`) for most moods; *happy* and *celebrating* keep colour.

## Type
- **Bricolage Grotesque 800:** mastheads, lesson titles, step headings, set in capitals, tight leading. Oversized only on covers and lesson openers.
- **Atkinson Hyperlegible:** everything people read.
- **JetBrains Mono:** weights, reps, sets, kickers ("LESSON 1", "PAULINO SAYS"), issue strip.
- **Permanent Marker:** short handwritten notes on collages only ("GO!", "sigh…", "YES!"). It stands in for real handwriting scans (see the asset notes).

## Paulino, the character kit
Paulino is a photomontage of Paul's real photos. The cut-outs are in `assets/paulino/` and are produced by `tools/build_cutouts.py`: hand-placed scissor outlines with a white paper edge, cut so only Paul appears.

| Mood | Composition | Where |
|---|---|---|
| motivated | Paul's grinning head on his own beach double-biceps body (B&W), mustard + pink paper, burst, "GO!" | home (large), athlete landing (small), workout (compact), lesson covers |
| focused | direct-look head, B&W, teal paper, target circle | Paul landing, tips, lessons |
| happy | smiling head in colour, pink paper, star | set done, plan restored, recaps |
| celebrating | gym flex with the big grin, colour, confetti, "YES!" | workout completion |
| disappointed | unimpressed stare, B&W, tilted, grey/blue paper, "sigh…" | changes to Paul's plan, lesson mistakes |
| concerned | mid-sentence look, eyebrows up, orange paper, "?!" | pain, fatigue, safety notes |

Each mood uses the photo whose real expression fits it best; there is no genuinely sad or worried photo, so those two lean on framing, tilt, colour and marks. Expressions are never altered.

## Composition templates
- **A · Cover** (home): masthead, issue strip, dominant montage, two colour blocks, bubble, headline, cover lines, call to action.
- **B · Lesson page** (Academy): one real photo of exactly that phase (or a PHOTO NEEDED slot), step number, phase tag, title, 1–2 short paragraphs, coaching-choice note where relevant, and a compact Paulino with a **callout** bubble. Annotations are drawn only on real photos.
- **C · Reaction** (results, plan changes): a large Paulino with a **burst** bubble and minimal background.
- **D · Compact coach** (workout tips): a 42 px face on a paper scrap next to one line of text.

All four are built from one function, `P.art.paulino(mood, { size })`, plus `P.art.photo(id, …)` for lesson photos and `P.art.annotate([...])` for arrows, bar paths, circles and labels in % coordinates.

## Speech bubbles
- **cloud** (default): rounded, ink outline, tail toward Paulino.
- **burst** (shouting): spiky cut-paper star, for celebrations and plan changes.
- **callout** (caption): mustard label with a "PAULINO SAYS" kicker, used in lessons.

Keep them short (≤ 40 characters ideally). Tapping cycles through lines; a line doesn't repeat until all have been shown. Bubbles never cover inputs or numbers.

## Motion
Paper slides in with stepped (`steps()`) easing; bubbles pop; Paulino gives a tiny wiggle. There's no animation while logging sets, no 3D flips and no parallax. `prefers-reduced-motion` turns it all off.

## Adding material
1. Put a cleared file in `assets/…` (WebP or PNG, ≤ 1200 px long side).
2. Add it to `assets/asset-manifest.json`: under `images` for character material, or under `lesson_photo_slots` with the lesson slot id (e.g. `"lesson_squat_bottom_loaded": { "file": "assets/lessons/squat_bottom.webp", "license": "…" }`).
3. For lesson photos, add the matching `annotations` (% coordinates) to that step in the `academy` module, checked against the actual photo.

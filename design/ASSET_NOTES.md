# Asset audit: what's used, restricted and missing

Covers `paulino_complete_handoff_v3.zip`, `paulino_media_web_ready (1).zip` and `paulino_curated_exercise_references (6).zip`.

## Two kinds of material, kept apart

| | Cleared for the public site | Private reference only |
|---|---|---|
| What | Photos and video frames of Paul (publication approved by Paul, 2026-10-21) | Figures from *Starting Strength*, 3rd ed. (Rippetoe, The Aasgaard Company): copyrighted |
| Where | `assets/paulino/`, `assets/lessons/`, listed in `assets/asset-manifest.json` | `private/paulino-academy-pack.json` (git-ignored), built by `tools/build_reference_pack.py`, with `private/pack-manifest.json` (page file + crop box per figure) |
| Deployed | yes | **never**: not in the repo, not in the GitHub Pages build |
| In the app | always | only on a device where Paul loaded the pack (Academy → *Load private illustrations*), stored in that browser's IndexedDB, labelled **PRIVATE REFERENCE · Not for sharing**, excluded from backups |

## Cut-outs (character kit)
| Source file | Published as | Expression → mood |
|---|---|---|
| `paul_smiling_glasses.jpg` | `paul_head_smiling.webp` | big open smile → happy, montage head |
| `paul_playful_closeup.jpg` | `paul_head_direct.webp` | direct look → focused |
| `paul_relaxed_seaside.jpg` | `paul_head_calm.webp` | calm half-smile (spare) |
| `paul_outdoor_athletic.jpg` | `paul_figure_outdoor.webp`, `paul_body_outdoor.webp` | spare figure / body |
| `paul_01.webp` | `paul_flex_beach.webp`, `paul_flex_beach_body.webp` | double biceps → motivated montage body (home hero) |
| `paul_04.webp` | `paul_flex_gym.webp` | flexing grin → celebrating (friend cut away) |
| `paul_07.webp` | `paul_head_stare.webp` | unimpressed stare → disappointed |
| `paul_08.webp` | `paul_head_talking.webp` | mid-sentence, eyebrows up → concerned |

Only cropping, masking and a white paper edge: no generated pixels, faces never altered or stretched. The montage is Paul's own head on Paul's own body.

## Lifting Academy: image manifest per panel
`public` = deployed photo of Paul · `private` = book figure in the private pack (page image file in `PRIVATE_REFERENCE_ONLY/<exercise>/`) · `needed` = PHOTO NEEDED placeholder.

| Exercise | # | Step | Slot | Source | Status |
|---|---|---|---|---|---|
| Squat | 1 | Set up | `lesson_squat_stance` | `147_photographic_descent_and_ascent.jpg` (front row) | private |
| Squat | 2 | Brace | `lesson_squat_descent` | `147_photographic_descent_and_ascent.jpg` (side row) | private |
| Squat | 3 | Down | `lesson_squat_bottom_loaded` | `075_full_photographic_sequence.jpg` | private |
| Squat | 4 | Up | `lesson_squat_ascent` | `061_stance_and_depth.jpg` | private |
| Press | 1 | Grip | `lesson_press_grip` | `199_grip_and_rack_position.jpg` | private |
| Press | 2 | Press | `lesson_press_bar_path` | `215_complete_drawn_sequence.jpg` | private |
| Press | 3 | Lockout | `lesson_press_lockout` | `207_overhead_lockout.jpg` | private |
| Press | 4 | Down | `lesson_press_lower` | `235_complete_photographic_sequence.jpg` | private |
| Press | – | Mistakes | `lesson_press_mistakes` | `223_press_mechanics_comparison.jpg` | private |
| Deadlift | 1 | Set up | `lesson_deadlift_paul_setup` | `paul_11.mp4` @ 0.1 s | public |
| Deadlift | 2 | Back | `lesson_deadlift_paul_set` | `paul_11.mp4` @ 10.0 s | public |
| Deadlift | 3 | Pull | `lesson_deadlift_paul_pull` | `paul_11.mp4` @ 2.7 s | public |
| Deadlift | 4 | Lockout | `lesson_deadlift_paul_lockout` | `paul_11.mp4` @ 3.5 s (bar path from three frames) | public |
| Deadlift | – | Mistakes | `lesson_deadlift_mistakes` | `321_starting_position_comparison.jpg` | private |
| Bench | 1 | Safety | `lesson_bench_paul_spotter` | `paul_06.mp4` @ 5.6 s (spotter's face blurred) | public |
| Bench | 2 | Set up | `lesson_bench_setup` | `355_body_position_photographs.jpg` | private |
| Bench | 3 | Unrack | `lesson_bench_paul_lockout` | `paul_06.mp4` @ 0.0 s (spotter's face blurred) | public |
| Bench | 4 | Down & up | `lesson_bench_paul_bottom` | `paul_06.mp4` @ 4.4 s (spotter's face blurred) | public |
| Clean | 1 | Hang | `lesson_clean_hang` | `435_pull_and_position_photographs.jpg` | private |
| Clean | 2 | Jump position | `lesson_clean_jump_position` | `441_transition_photographs.jpg` | private |
| Clean | 3 | Jump & catch | `lesson_clean_catch` | `455_complete_photographic_sequence.jpg` | private |
| Clean | 4 | From the floor | `lesson_clean_floor` | `463_phase_by_phase_diagram.jpg` | private |

22 panels (four short steps per lift, plus two comparison figures): 7 public (Paul's own lifts), 15 private, none without a source. On the public site, 15 panels show PHOTO NEEDED until Paul films the squat, press and clean. The private pack now holds only the 15 figures still in use.

The deadlift and bench frames come from Paul's own videos, built by `tools/build_lesson_frames.py` (exact second, crop and blur boxes per frame; source videos are not committed). In the bench videos Paul is the lifter; the spotter is someone else, so his face is blurred in every frame. Nothing is generated or composited. People in the background are blurred, and the arrows, bar path and hip circle are placed on these exact frames.

## Licensing report
- **Book figures:** copyrighted. Private use doesn't by itself permit showing them to other people. The pack is kept off the site, and the app labels them *Not for sharing*. Whether Paul may show them to his athletes on his own phone, or send the pack to them, is **not settled**: either needs permission from the publisher (The Aasgaard Company). Until then, treat the pack as Paul's personal study material.
- **Lesson text:** original, short wording written from the chapters. It contains no quotations.
- **Paul's photos and video frames:** publication approved by Paul (2026-10-21).
- **Other people:** they appear in `paul_03`, `paul_05/06`, the uncut originals and the background of `paul_11`. The first three are not used; `paul_11` is used only blurred.
- **Historical lifting photos** (`bentover_*`, `vintage_*`, `oldschool_*`): reuse rights are unverified, so they are not used.
- **Not used yet:** `paul_09` (inflatable) and `paul_10` (pull-ups) have no matching use.

## Missing (placeholders in place)
1. **No footage of Paul exists for the squat, the overhead press or the power clean**, so those lessons can't be illustrated from Paul's own images without inventing pictures. Shot list below.
2. **Cleared replacements for the 25 book figures**, needed if the public site should show pictures in every panel. Ideal source: Paul or an athlete filmed from the side for each lift, as was done for the deadlift.
3. **Cleared lifter body photos**, if face-swap illustrations are still wanted.
4. **Genuine disappointed and worried photos of Paul.** For now, the stare and the mid-sentence look carry those moods.
5. **Scanned paper, newsprint and handwriting.** CSS/SVG stand-ins are used meanwhile.

## Technical-content questions for Paul
- **Squat:** low-bar or high-bar? The short lesson just says "upper back". Is "hip crease below the knee" his depth standard for everyone?
- **Deadlift:** do the frames from his own heavy pull show the form he wants to teach (bar contact, lockout)?
- **Bench:** the lesson includes no arch and no leg-drive details. Should it?
- **Press:** how much lean back does he allow?
- **Power clean:** it isn't in his exercise list. Keep the lesson? Barbell row and pull-up have no lesson.
- **All five lessons:** the texts are marked *draft, waiting for Paul's review*.

## Shot list for Paul (to finish the lessons with his own images)
Film on a phone, upright, at hip height, about 3 m away, **from the side** unless noted; empty bar or a light warm-up weight is fine; nobody else's face in frame. Then add the times to `FRAMES` in `tools/build_lesson_frames.py` and the slot to `asset-manifest.json`.

| Lesson | Clip | Frames it gives |
|---|---|---|
| Squat | 3 reps from the side; 1 rep from the front; 2 s close-up from behind of the bar on the back | stance (front), bar position (rear), unrack, descent, bottom below parallel, drive up |
| Overhead press | 3 reps from the side; 2 s front view of the grip | grip, start position (elbows in front), bar passing the face, lockout, lowering |
| Power clean | 3 reps from the side, plus the hang and jumping position held for 2 s each | stance, hang, jumping position, catch/rack, from the floor |
| Bench (missing panels) | feet and back setup from the side; bar touching the chest from the side | on the bench, feet, grip (forearms vertical) |
| Deadlift (missing panel) | 2 s of taking the grip and bringing the shins to the bar | grip & shins |


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

| Exercise | # | Step / phase | Slot | Source | Status |
|---|---|---|---|---|---|
| Squat | 1 | Stance | `lesson_squat_stance` | `147_photographic_descent_and_ascent.jpg` (front row) | private |
| Squat | 2 | Bottom position | `lesson_squat_bottom_unloaded` | `057_bottom_position.jpg` | private |
| Squat | 3 | Bar position | `lesson_squat_bar_position` | none | needed |
| Squat | 4 | Unrack | `lesson_squat_unrack` | none | needed |
| Squat | 5 | Descent | `lesson_squat_descent` | `147_photographic_descent_and_ascent.jpg` (side row) | private |
| Squat | 6 | Balance | `lesson_squat_balance` | `095_balance_and_bar_position.jpg` | private |
| Squat | 7 | Depth | `lesson_squat_bottom_loaded` | `075_full_photographic_sequence.jpg` | private |
| Squat | 8 | Drive up | `lesson_squat_ascent` | `061_stance_and_depth.jpg` | private |
| Press | 1 | Grip | `lesson_press_grip` | `199_grip_and_rack_position.jpg` | private |
| Press | 2 | Start position | `lesson_press_start` | none | needed |
| Press | 3 | Lockout | `lesson_press_lockout` | `207_overhead_lockout.jpg` | private |
| Press | 4 | Bar path | `lesson_press_bar_path` | `215_complete_drawn_sequence.jpg` | private |
| Press | 5 | Reps | `lesson_press_lower` | `235_complete_photographic_sequence.jpg` | private |
| Press | – | Mistakes | `lesson_press_mistakes` | `223_press_mechanics_comparison.jpg` | private |
| Deadlift | 1 | Stance | `lesson_deadlift_paul_setup` | `paul_11.mp4` @ 0.1 s → `assets/lessons/deadlift_paul_setup.webp` | public |
| Deadlift | 2 | Grip & shins | `lesson_deadlift_grip` | `259_setup_photographic_positions.jpg` | private |
| Deadlift | 3 | Chest up | `lesson_deadlift_set` | `261_back_position_photographs.jpg` | private |
| Deadlift | 4 | Pull | `lesson_deadlift_paul_pull` | `paul_11.mp4` @ 2.7 s → `deadlift_paul_pull.webp` | public |
| Deadlift | 5 | Lockout & down | `lesson_deadlift_paul_lockout` | `paul_11.mp4` @ 3.5 s → `deadlift_paul_lockout.webp` (bar path traced from the three frames) | public |
| Deadlift | – | Mistakes | `lesson_deadlift_mistakes` | `321_starting_position_comparison.jpg` | private |
| Bench | 1 | Safety | `lesson_bench_safety` | `399_feet_and_support.jpg` | private |
| Bench | 2 | On the bench | `lesson_bench_setup` | `355_body_position_photographs.jpg` | private |
| Bench | 3 | Feet | `lesson_bench_feet` | `401_arm_and_bar_position_comparison.jpg` | private |
| Bench | 4 | Grip | `lesson_bench_grip` | `373_arm_and_elbow_position.jpg` | private |
| Bench | 5 | Unrack | `lesson_bench_unrack` | `377_wrist_and_elbow_alignment.jpg` | private |
| Bench | 6 | Down & up | `lesson_bench_bottom` | `365_bench_press_photographic_sequence.jpg` | private |
| Clean | 1 | Stance & grip | `lesson_clean_stance` | `433_starting_position_photographs.jpg` | private |
| Clean | 2 | Hang | `lesson_clean_hang` | `435_pull_and_position_photographs.jpg` | private |
| Clean | 3 | Rack | `lesson_clean_rack` | none (the candidate image showed the hang) | needed |
| Clean | 4 | Jumping position | `lesson_clean_jump_position` | `441_transition_photographs.jpg` | private |
| Clean | 5 | Jump & catch | `lesson_clean_catch` | `455_complete_photographic_sequence.jpg` | private |
| Clean | 6 | From the floor | `lesson_clean_floor` | `463_phase_by_phase_diagram.jpg` | private |

32 panels: 3 public, 25 private, 4 needed. On the public site, 29 panels show PHOTO NEEDED. No face swaps were made: Paulino comments next to the figures instead, so the technique pictures stay accurate and the book figures are not turned into derivatives.

The three deadlift frames come from Paul's own video. People in the background are blurred, and the arrows, bar path and hip circle are placed on these exact frames.

## Licensing report
- **Book figures:** copyrighted. Private use doesn't by itself permit showing them to other people. The pack is kept off the site, and the app labels them *Not for sharing*. Whether Paul may show them to his athletes on his own phone, or send the pack to them, is **not settled**: either needs permission from the publisher (The Aasgaard Company). Until then, treat the pack as Paul's personal study material.
- **Lesson text:** original, short wording written from the chapters. It contains no quotations.
- **Paul's photos and video frames:** publication approved by Paul (2026-10-21).
- **Other people:** they appear in `paul_03`, `paul_05/06`, the uncut originals and the background of `paul_11`. The first three are not used; `paul_11` is used only blurred.
- **Historical lifting photos** (`bentover_*`, `vintage_*`, `oldschool_*`): reuse rights are unverified, so they are not used.
- **Not used yet:** `paul_09` (inflatable) and `paul_10` (pull-ups) have no matching use.

## Missing (placeholders in place)
1. **Four phase photos** with no usable source: squat bar position (rear close-up), squat unrack (side), press start position (side), clean rack position.
2. **Cleared replacements for the 25 book figures**, needed if the public site should show pictures in every panel. Ideal source: Paul or an athlete filmed from the side for each lift, as was done for the deadlift.
3. **Cleared lifter body photos**, if face-swap illustrations are still wanted.
4. **Genuine disappointed and worried photos of Paul.** For now, the stare and the mid-sentence look carry those moods.
5. **Scanned paper, newsprint and handwriting.** CSS/SVG stand-ins are used meanwhile.

## Technical-content questions for Paul
- **Squat:** the book teaches a low-bar position, labelled *Coaching choice*. Does Paul coach low-bar or high-bar? Is "hip crease below the knee" his depth standard for everyone?
- **Deadlift:** the five-step setup is labelled *Coaching choice*. Does he teach it this way? Do the frames from his own heavy pull show the form he wants to teach (bar contact, lockout)?
- **Bench:** the lesson includes no arch and no leg-drive details. Should it?
- **Press:** how much lean back does he allow?
- **Power clean:** it isn't in his exercise list. Keep the lesson? Barbell row and pull-up have no lesson.
- **All five lessons:** the texts are marked *draft, waiting for Paul's review*.

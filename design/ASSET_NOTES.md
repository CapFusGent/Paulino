# Asset audit: what's used, restricted and missing

Audit of `paulino_complete_handoff_v3.zip`.

## Used (published, after processing)
| Source file | Published as | Processing |
|---|---|---|
| `paul_smiling_glasses.jpg` | `assets/paulino/paul_head_smiling.webp` | hand-cut head, paper edge (crowd behind him excluded) |
| `paul_playful_closeup.jpg` | `assets/paulino/paul_head_direct.webp` | hand-cut head (neighbour's cheek excluded) |
| `paul_relaxed_seaside.jpg` | `assets/paulino/paul_head_calm.webp` | hand-cut head (people on both sides excluded) |
| `paul_outdoor_athletic.jpg` | `assets/paulino/paul_figure_outdoor.webp`, `paul_body_outdoor.webp` | hand-cut figure and neck-down body (backpack and fence excluded) |

- Only cropping, masking and a white edge were applied; colour and B&W treatment happen in CSS. There are no generated pixels, and faces are not altered.
- The uncut originals and the package's draft oval crops are **not** in the repository, because the originals show other people.
- **Paul's consent to publish his face** on a public website must be confirmed before deploying.

## Restricted (not deployed)
- **Historical lifting photos** (`bentover_*`, `vintage_barbell_torso`, `oldschool_deadlift`, `oldschool_squat`): reuse rights are unverified, so they're used as visual reference only.
- **Books** (*Starting Strength* EPUB/MOBI, *Science and Practice of Strength Training* PDF): copyrighted. They were read privately to write original lesson text. No passages, figures or files are in the app or the repo. The EPUB is page scans; the text came from the MOBI edition.

## Missing (placeholders in place)
1. **Phase-by-phase technique photos** for every lesson step: 30 slots across the five lessons. Each shows **PHOTO NEEDED** with the exact angle and position required (e.g. *"Side view: bottom position with the bar, hip crease just below the knee"*). Ideal source: Paul or an athlete photographed by Paul, each lift shot from the side, in sequence.
2. **Cleared lifter body photos** for template B ("Paul's head on a lifter"). Until then, montages use Paul's own outdoor photo.
3. **Scanned paper, newsprint and cardboard textures.** CSS/SVG grain and halftone are used meanwhile.
4. **Scanned handwriting** (notes, arrows, circles). Drawn SVG marks and the Permanent Marker font are used meanwhile.
5. **More real expressions** of Paul (fierce, disappointed, worried, laughing): these would replace the graphic treatment of the disappointed and concerned moods.

## Open decisions for Paul
- Confirm the five Academy lessons. The current candidates follow the book's chapters: squat, press, deadlift, bench press, power clean. The power clean isn't in his program exercises; barbell row and pull-up have no lesson.
- Review the lesson texts (marked *draft*), especially the steps marked **Coaching choice** (low-bar squat, five-step deadlift setup).

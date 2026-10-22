"""
Private Lifting Academy illustration pack.

The lesson figures come from *Starting Strength* (Rippetoe). They are
copyrighted book illustrations: usable by Paul as private working references,
NOT cleared for the public website. So they are never committed or deployed.
This tool crops the selected figures from the curated page scans into one file,

    private/paulino-academy-pack.json      (git-ignored)

which Paul loads on his own device (Lifting Academy → "Load private
illustrations"). The app stores it in that browser only. Sharing the file with
other people is distribution and needs the publisher's permission.

    python tools/build_reference_pack.py <PRIVATE_REFERENCE_ONLY folder>

Every entry records exercise, slot, source page file, crop box and caption,
which together form the image manifest for the book material.
"""
import base64, io, json, sys
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "private" / "paulino-academy-pack.json"
BOOK = "Starting Strength: Basic Barbell Training, 3rd ed. (Rippetoe, The Aasgaard Company, 2011/2012)"

# slot id (matches the lesson step photo id) → (folder, page file, crop box on the 2550×3300 scan, caption)
FIGURES = {
    # squat
    "lesson_squat_stance": ("squat", "147_photographic_descent_and_ascent.jpg", (632, 1380, 1872, 1856), "Front view of a loaded squat: the knees follow the toes all the way down."),
    "lesson_squat_descent": ("squat", "147_photographic_descent_and_ascent.jpg", (628, 620, 1872, 1100), "Side view, frame by frame: hips back, back angle set, bar over the mid-foot."),
    "lesson_squat_bottom_loaded": ("squat", "075_full_photographic_sequence.jpg", (628, 444, 1864, 1920), "The complete squat in the rack, from unrack to depth and back."),
    "lesson_squat_ascent": ("squat", "061_stance_and_depth.jpg", (696, 984, 1804, 2468), "Hip-drive drill: a coach blocks the hips so you feel them drive straight up."),
    # press
    "lesson_press_grip": ("overhead_press", "199_grip_and_rack_position.jpg", (944, 556, 1548, 1772), "Grip width and start position from the back and the side."),
    "lesson_press_lockout": ("overhead_press", "207_overhead_lockout.jpg", (950, 600, 1450, 2000), "Lockout: bar, shoulder joint and mid-foot in one vertical line."),
    "lesson_press_bar_path": ("overhead_press", "215_complete_drawn_sequence.jpg", (430, 430, 2080, 1640), "The torso moves forward under the bar once it passes the face."),
    "lesson_press_lower": ("overhead_press", "235_complete_photographic_sequence.jpg", (572, 444, 1920, 1956), "A complete press, frame by frame."),
    "lesson_press_mistakes": ("overhead_press", "223_press_mechanics_comparison.jpg", (560, 430, 2000, 1640), "The further the bar drifts in front of the shoulder, the longer the moment arm (M.A.) the shoulders have to fight."),
    # deadlift and bench: the steps use frames of Paul's own lifts; only the comparison figure remains
    "lesson_deadlift_mistakes": ("deadlift", "321_starting_position_comparison.jpg", (512, 480, 1984, 1524), "Correct start (A) and the position often used instead (B): hips too low pushes the bar forward."),
    # bench press
    "lesson_bench_setup": ("bench_press", "355_body_position_photographs.jpg", (656, 1212, 1836, 2008), "Getting into position on the bench, eyes just past the bar."),
    # power clean
    "lesson_clean_hang": ("power_clean", "435_pull_and_position_photographs.jpg", (632, 1892, 1868, 2384), "The hang: straight elbows, rotated in, chest up."),
    "lesson_clean_jump_position": ("power_clean", "441_transition_photographs.jpg", (948, 444, 1552, 1908), "Sliding down to the jumping position: bar on the thighs."),
    "lesson_clean_catch": ("power_clean", "455_complete_photographic_sequence.jpg", (632, 444, 1864, 1948), "A complete power clean, frame by frame."),
    "lesson_clean_floor": ("power_clean", "463_phase_by_phase_diagram.jpg", (612, 868, 1256, 1356), "From the floor to the jumping position: back angle kept until the bar is at the thighs."),
}

MAX_W = 900


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    images, manifest = {}, []
    for slot, (folder, file, box, caption) in FIGURES.items():
        im = Image.open(src / folder / file).convert("L").crop(box)
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=72, method=6)
        images[slot] = {
            "data": "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode(),
            "caption": caption, "source": f"{BOOK}, page image {file[:3]}", "rights": "copyrighted: private reference only",
        }
        manifest.append({"slot": slot, "exercise": folder, "page_file": file, "box": box, "caption": caption, "kb": len(buf.getvalue()) // 1024})
    OUT.parent.mkdir(exist_ok=True)
    pack = {"format": "paulino-image-pack", "v": 1, "title": "Lifting Academy illustrations (private)", "book": BOOK,
            "rights": "Copyrighted book illustrations. Private reference use by Paul only. Do not publish or share.",
            "images": images}
    OUT.write_text(json.dumps(pack))
    (OUT.parent / "pack-manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"{len(images)} figures -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()

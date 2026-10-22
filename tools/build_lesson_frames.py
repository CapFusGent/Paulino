"""
Lesson photos from Paul's own training videos.

Real frames only: each picture is one frame of Paul's video, cropped, with
anyone else's face and the people in the background blurred. Nothing is
generated, retouched or composited. Arrows and labels are NOT burnt in: they are
drawn by the app from `annotations` in assets/asset-manifest.json, so they can
be corrected without touching the photo.

    python tools/build_lesson_frames.py <media originals folder>

The originals folder is the `originals/` directory of the media pack
(paulino_media_web_ready). Source videos are never committed.
"""
import subprocess, sys
from pathlib import Path
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "assets" / "lessons"
CROP = (0, 40, 464, 832)   # drop the ceiling strip; output 464 x 792 like the deadlift set

# slot -> (source video, second, blur boxes [(x0, y0, x1, y1, 'face'|'area')])
#   paul_05 = archive2_01.mp4 / paul_06 = archive2_02.mp4: Paul benching, spotted
#   paul_11 = standalone_video_01.mp4: Paul deadlifting
SPOTTER_FACE = (186, 50, 300, 190, "face")   # the spotter is not Paul: always blurred
FRAMES = {
    "bench_paul_lockout": ("archive2_02.mp4", 0.00, [SPOTTER_FACE]),
    "bench_paul_bottom": ("archive2_02.mp4", 4.40, [SPOTTER_FACE]),
    "bench_paul_spotter": ("archive2_02.mp4", 5.60, [SPOTTER_FACE]),
    "deadlift_paul_set": ("standalone_video_01.mp4", 10.00, [
        (322, 280, 464, 500, "area"),    # people behind the rack
        (196, 296, 246, 340, "area"),    # small figure behind Paul's head
        (0, 290, 58, 470, "area"),
    ]),
}


def grab(video, t, dest):
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ff, "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1", str(dest)], check=True)


def blur(im, boxes):
    for x0, y0, x1, y1, kind in boxes:
        region = im.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(14 if kind == "face" else 9))
        mask = Image.new("L", region.size, 0)
        d = ImageDraw.Draw(mask)
        if kind == "face":
            d.ellipse((0, 0, region.width - 1, region.height - 1), fill=255)
        else:
            d.rectangle((10, 10, region.width - 10, region.height - 10), fill=255)   # feathered edge
        mask = mask.filter(ImageFilter.GaussianBlur(6 if kind == "face" else 12))
        im.paste(region, (x0, y0), mask)
    return im


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = OUT / "_frame.png"
    for slot, (video, t, boxes) in FRAMES.items():
        grab(src / video, t, tmp)
        im = blur(Image.open(tmp).convert("RGB"), boxes).crop(CROP)
        im.save(OUT / f"{slot}.webp", "WEBP", quality=80, method=6)
        print(f"{slot}: {video} @ {t:.2f}s -> {im.size}")
    tmp.unlink(missing_ok=True)


if __name__ == "__main__":
    main()

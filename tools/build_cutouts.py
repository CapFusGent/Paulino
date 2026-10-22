"""
Paulino character kit: photographic cut-outs of Paul.

Development tool, never deployed. It reads Paul's ORIGINAL photos from a local
folder (they are kept out of the repository because some show bystanders) and
writes transparent WebP cut-outs into assets/paulino/.

Conventional image processing only (Pillow): crop, polygon mask, white
"scissor-cut" paper edge. No AI, no generated pixels, no facial edits.
The outlines below were placed by hand, point by point, around Paul only, so
other people in the original photos never end up in the published files.

    python tools/build_cutouts.py <folder with paul_*.jpg originals>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "assets" / "paulino"

# Hand-placed scissor outlines, in pixel coordinates of the 720×1560 originals.
CUTS = {
    # Head with glasses and beard, big smile (crowd behind him excluded).
    "paul_head_smiling": ("paul_smiling_glasses.jpg", [
        (150, 330), (200, 228), (300, 176), (420, 168), (508, 214), (572, 300), (610, 410), (612, 500),
        (648, 578), (648, 682), (604, 752), (560, 762), (520, 832), (452, 892), (360, 928), (258, 918),
        (178, 862), (118, 772), (98, 690), (84, 562), (72, 458), (104, 398)]),
    # Close-up, direct look (the neighbour's cheek on the left edge is excluded).
    "paul_head_direct": ("paul_playful_closeup.jpg", [
        (62, 250), (112, 118), (222, 38), (362, 16), (482, 58), (572, 148), (612, 268), (602, 380),
        (566, 470), (562, 582), (522, 662), (472, 762), (402, 862), (300, 924), (190, 936), (104, 902),
        (64, 832), (58, 700), (56, 560), (58, 420)]),
    # Calm half-smile by the sea (people on both sides excluded).
    "paul_head_calm": ("paul_relaxed_seaside.jpg", [
        (202, 420), (252, 298), (362, 224), (482, 204), (602, 240), (690, 322), (716, 420), (716, 560),
        (700, 682), (660, 782), (600, 872), (520, 932), (430, 956), (330, 930), (270, 862), (240, 762),
        (214, 682), (172, 600), (162, 560), (190, 480)]),
    # Whole figure outdoors: head, shoulder, arm and hand (backpack and fence excluded).
    "paul_figure_outdoor": ("paul_outdoor_athletic.jpg", [
        (228, 602), (258, 550), (330, 530), (400, 560), (432, 640), (432, 712), (412, 762), (398, 822),
        (442, 862), (522, 892), (592, 952), (632, 1052), (646, 1182), (640, 1302), (600, 1382), (520, 1402),
        (420, 1384), (330, 1352), (280, 1342), (230, 1332), (130, 1322), (40, 1262), (6, 1222), (40, 1190),
        (150, 1184), (216, 1200), (236, 1100), (246, 1000), (270, 940), (300, 882), (300, 842), (250, 802),
        (224, 742), (214, 670)]),
    # Same photo, neck down: the body for the big-head photomontage.
    "paul_body_outdoor": ("paul_outdoor_athletic.jpg", [
        (300, 842), (330, 852), (398, 836), (442, 862), (522, 892), (592, 952), (632, 1052), (646, 1182),
        (640, 1302), (600, 1382), (520, 1402), (420, 1384), (330, 1352), (280, 1342), (230, 1332), (130, 1322),
        (40, 1262), (6, 1222), (40, 1190), (150, 1184), (216, 1200), (236, 1100), (246, 1000), (270, 940)]),
}

EDGE = 9        # white paper border around the cut, px (in output size)
MAX_SIDE = 560  # output size: enough for 2× on phones


def cut(src: Path, poly, name):
    im = Image.open(src).convert("RGB")
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    pad = 24
    box = (max(0, min(xs) - pad), max(0, min(ys) - pad), min(im.width, max(xs) + pad), min(im.height, max(ys) + pad))
    im = im.crop(box)
    poly = [(x - box[0], y - box[1]) for x, y in poly]
    scale = min(1.0, MAX_SIDE / max(im.size))
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        poly = [(x * scale, y * scale) for x, y in poly]
    # 4× supersampled mask for clean (but still scissor-like) edges
    s = 4
    big = Image.new("L", (im.width * s, im.height * s), 0)
    ImageDraw.Draw(big).polygon([(x * s, y * s) for x, y in poly], fill=255)
    mask = big.resize(im.size, Image.LANCZOS)
    edge = mask.filter(ImageFilter.MaxFilter(EDGE * 2 + 1))
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(Image.new("RGBA", im.size, (255, 253, 246, 255)), (0, 0), edge)   # paper edge
    out.paste(im.convert("RGBA"), (0, 0), mask)
    bbox = out.getbbox()
    out = out.crop(bbox)
    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / f"{name}.webp"
    out.save(dst, "WEBP", quality=82, method=6)
    return dst, out.size


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    folder = Path(sys.argv[1])
    for name, (file, poly) in CUTS.items():
        dst, size = cut(folder / file, poly, name)
        print(f"{dst.name:28s} {size[0]}×{size[1]}  {dst.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

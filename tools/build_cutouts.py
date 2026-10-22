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

# Second photo set (paulino_media_web_ready, WebP). Points were read off a
# preview at 0.5625× scale, so they are scaled back up here.
def _up(points, k=1 / 0.5625):
    return [(round(x * k), round(y * k)) for x, y in points]

_FLEX_BEACH = [(242, 296), (262, 291), (279, 298), (281, 318), (276, 334), (286, 360), (300, 380), (318, 378), (338, 372),
               (340, 345), (335, 322), (345, 300), (365, 286), (388, 294), (395, 320), (392, 345), (392, 372), (412, 378),
               (432, 376), (452, 355), (462, 330), (458, 304), (472, 290), (492, 293), (500, 308), (502, 335), (500, 372),
               (492, 400), (470, 415), (440, 420), (428, 432), (422, 470), (418, 520), (434, 562), (298, 562), (315, 520),
               (308, 470), (302, 432), (280, 425), (250, 420), (225, 410), (218, 385), (222, 350), (232, 325), (238, 305)]
CUTS.update({
    # Double-biceps on the beach, sunglasses: the hero body (bystander's arm on the right excluded).
    "paul_flex_beach": ("paul_01.webp", _up(_FLEX_BEACH)),
    # Same pose, neck down, so the big glasses head can sit on top (photomontage).
    "paul_flex_beach_body": ("paul_01.webp", _up([(242, 296), (262, 291), (279, 298), (281, 318), (276, 334), (286, 360),
        (300, 380), (330, 384), (365, 392), (400, 386), (432, 376), (452, 355), (462, 330), (458, 304), (472, 290), (492, 293),
        (500, 308), (502, 335), (500, 372), (492, 400), (470, 415), (440, 420), (428, 432), (422, 470), (418, 520), (434, 562),
        (298, 562), (315, 520), (308, 470), (302, 432), (280, 425), (250, 420), (225, 410), (218, 385), (222, 350), (232, 325), (238, 305)])),
    # Gym flex with a big grin (friend and their hand excluded: cut above the hand).
    "paul_flex_gym": ("paul_04.webp", _up([(165, 118), (195, 113), (215, 125), (222, 140), (212, 160), (195, 168), (205, 190),
        (225, 205), (260, 200), (305, 190), (320, 170), (315, 130), (322, 90), (345, 65), (380, 62), (402, 80), (408, 110),
        (405, 150), (395, 180), (385, 200), (420, 210), (440, 225), (445, 252), (380, 255), (300, 256), (240, 258), (200, 268),
        (150, 278), (118, 268), (108, 240), (118, 200), (140, 165), (155, 135)])),
    # Close-up, unimpressed stare (cut above the choker).
    "paul_head_stare": ("paul_07.webp", _up([(232, 240), (262, 160), (330, 120), (400, 115), (470, 140), (515, 195), (525, 260),
        (528, 318), (538, 345), (535, 380), (530, 430), (510, 470), (500, 520), (470, 580), (420, 615), (370, 622), (310, 605),
        (268, 560), (245, 500), (232, 440), (222, 395), (212, 362), (206, 338), (212, 315), (225, 290)], 1 / 0.5628)),
    # Mid-sentence, eyebrows up: "how many grams of protein?!"
    "paul_head_talking": ("paul_08.webp", _up([(272, 175), (285, 135), (320, 113), (355, 118), (379, 146), (384, 190), (378, 226),
        (362, 262), (336, 283), (310, 288), (289, 272), (275, 242), (267, 205)])),
})

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

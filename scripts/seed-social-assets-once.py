#!/usr/bin/env python3
"""One-time creation of reviewable, committed PNG assets (never run on Timeweb)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
import cairosvg
import io

ROOT = Path("public/images")
ROOT.mkdir(parents=True, exist_ok=True)
FONT_DIR = Path("/usr/share/fonts/truetype/noto")
def find_font(candidates):
    for name in candidates:
        p = FONT_DIR / name
        if p.exists():
            return str(p)
    raise RuntimeError("Cyrillic Noto fonts missing on asset-preparation runner")

serif = find_font(["NotoSerifDisplay-SemiBold.ttf", "NotoSerif-Bold.ttf", "NotoSerif-Regular.ttf"])
sans = find_font(["NotoSans-Regular.ttf", "NotoSansDisplay-Regular.ttf"])
for font, text in [
    (serif, "ХУНМЭНГ"),
    (sans, "НОВЕЛЛЫ НА РУССКОМ Миры, к которым хочется возвращаться"),
]:
    cmap = TTFont(font).getBestCmap()
    missing = [ch for ch in text if not ch.isspace() and ord(ch) not in cmap]
    if missing:
        raise RuntimeError(f"Font {font} is missing Cyrillic: {missing}")

canvas = Image.new("RGB", (1200, 630), "#1C3455")
draw = ImageDraw.Draw(canvas)
cream, gold, quiet = "#F6EEDD", "#DCC89B", "#A7B7C6"
draw.rounded_rectangle((30, 30, 1170, 600), radius=12, outline=quiet, width=2)
draw.rounded_rectangle((43, 43, 1157, 587), radius=9, outline="#6E849E", width=1)
draw.arc((103, 175, 405, 495), 190, 350, fill=gold, width=3)
draw.arc((110, 163, 396, 487), 5, 165, fill="#7690A7", width=2)
draw.polygon([(171, 259), (245, 228), (245, 402), (174, 382)], fill=gold)
draw.polygon([(251, 228), (325, 260), (325, 382), (251, 402)], fill=cream)
draw.line([(248, 228), (248, 402)], fill="#1C3455", width=6)
draw.line([(175, 383), (248, 404), (327, 384)], fill="#EBDCB7", width=4)
for line in [(205,291,236,278),(205,317,236,304),(261,287,294,298),(261,314,294,325)]:
    draw.line(line, fill="#1C3455", width=2)
draw.polygon([(248,135),(259,165),(289,176),(259,187),(248,217),(237,187),(207,176),(237,165)], fill=gold)
draw.ellipse((244,171,252,179), fill=cream)
draw.text((423, 222), "ХУНМЭНГ", font=ImageFont.truetype(serif, 84), fill=cream)
draw.line((427, 338, 1085, 338), fill=gold, width=3)
draw.text((429, 366), "НОВЕЛЛЫ НА РУССКОМ", font=ImageFont.truetype(sans, 31), fill=gold)
draw.text((429, 452), "Миры, к которым хочется возвращаться",
          font=ImageFont.truetype(sans, 23), fill=quiet)
draw.text((428, 533), "HUNMENG NOVELS",
          font=ImageFont.truetype(sans, 15), fill="#8199AE")
canvas.quantize(colors=4, method=Image.Quantize.MEDIANCUT,
                dither=Image.Dither.NONE).save(ROOT / "og-default.png", optimize=True)

COVERS = {
    "khranitel-mayaka": ("#203d31", "#e6d9ab", ["Хранитель", "тихого маяка"]),
    "sad-zimy": ("#d6bb82", "#2d493a", ["Сад на", "краю зимы"]),
}
for slug, (background, foreground, lines) in COVERS.items():
    original = ROOT / (slug + ".svg")
    base = Image.open(io.BytesIO(cairosvg.svg2png(
        url=str(original), output_width=520, output_height=760))).convert("RGB")
    # Overdraw all SVG text: output no longer depends on Georgia fallback glyphs.
    artist = ImageDraw.Draw(base)
    artist.rectangle((32, 604, 488, 730), fill=background)
    face = ImageFont.truetype(serif, 48)
    for idx, text in enumerate(lines):
        artist.text((260, 618 + idx * 52), text, font=face,
                    anchor="mt", fill=foreground)
    base.quantize(colors=4, method=Image.Quantize.MEDIANCUT,
                  dither=Image.Dither.NONE).save(ROOT / (slug + "-og.png"), optimize=True)

for filename, size in [
    ("og-default.png", (1200, 630)),
    ("khranitel-mayaka-og.png", (520, 760)),
    ("sad-zimy-og.png", (520, 760)),
]:
    img = Image.open(ROOT / filename)
    img.verify()
    assert Image.open(ROOT / filename).size == size
    print("Prepared", filename, (ROOT / filename).stat().st_size, "bytes")

#!/usr/bin/env python3
"""Generate the extension PNG icons (Pillow only)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "icons"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

S = 512  # 4x render, then downscale (antialiasing)
RADIUS = 112
START = (99, 102, 241)   # #6366F1
END = (168, 85, 247)     # #A855F7


def gradient(size: int) -> Image.Image:
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            pixels[x, y] = tuple(
                round(START[i] + (END[i] - START[i]) * t) for i in range(3)
            )
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), RADIUS, fill=255)
    canvas.paste(gradient(S), (0, 0), mask)

    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(FONT, 292)
    # "L" centered optically (more space above than below).
    draw.text((S / 2, S / 2 + 8), "L", font=font, fill=(255, 255, 255, 255), anchor="mm")

    for size in (16, 32, 48, 128):
        icon = canvas.resize((size, size), Image.LANCZOS)
        path = OUT / f"icon-{size}.png"
        icon.save(path, "PNG", optimize=True)
        print(f"✓ {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

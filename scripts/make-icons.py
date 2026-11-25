#!/usr/bin/env python3
"""Generate the extension icons and the large logo from the source artwork.

Sources (assets/, not shipped):
  icon-flower.png  daisy only, used for the toolbar/store icons
  logo-fairy.png   fairy on the daisy, used for the options header and README

Outputs:
  src/icons/icon-*.png  transparent square icons
  src/icons/logo.png    large logo shipped with the extension
  docs/logo.png         copy used by the READMEs
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUT = ROOT / "src" / "icons"
DOCS = ROOT / "docs"

ICON_SIZES = (16, 32, 48, 128)
LOGO_SIZE = 512
PADDING = 0.04  # share of the final square kept empty around the artwork


def square(image: Image.Image, size: int, padding: float = PADDING) -> Image.Image:
    """Trim transparent margins, then fit the artwork into a transparent square."""
    image = image.convert("RGBA")
    box = image.getbbox()
    if box:
        image = image.crop(box)

    inner = max(1, round(size * (1 - 2 * padding)))
    ratio = min(inner / image.width, inner / image.height)
    scaled = image.resize(
        (max(1, round(image.width * ratio)), max(1, round(image.height * ratio))),
        Image.LANCZOS,
    )

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2), scaled)
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)

    flower = Image.open(ASSETS / "icon-flower.png")
    fairy = Image.open(ASSETS / "logo-fairy.png")

    for size in ICON_SIZES:
        path = OUT / f"icon-{size}.png"
        square(flower, size).save(path, "PNG", optimize=True)
        print(f"✓ {path.relative_to(ROOT)}")

    logo = square(fairy, LOGO_SIZE)
    for path in (OUT / "logo.png", DOCS / "logo.png"):
        logo.save(path, "PNG", optimize=True)
        print(f"✓ {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

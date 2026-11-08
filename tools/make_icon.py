"""Generate the application icon from the same geometry as the in-app logo.

Run:  python tools/make_icon.py
Writes: assets/icon.ico (Windows, multi-size) and assets/icon.png (256px,
used by the macOS bundle and by the PWA manifest later).

Kept as a script rather than a binary blob so the mark stays reproducible and
stays in sync with frontend/src/components/layout/Logo.tsx.
"""
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024  # drawn at 4x and downsampled, which smooths the corners
TOP = (59, 130, 246)  # #3b82f6
BOTTOM = (29, 78, 216)  # #1d4ed8
RADIUS = 0.22  # of the size, matching the logo's rx=8 on a 32px grid
BARS = [  # (x, y, width, height, opacity) in a 32-unit grid
    (8.5, 17.0, 4.0, 7.0, 0.72),
    (14.0, 12.5, 4.0, 11.5, 0.88),
    (19.5, 8.5, 4.0, 15.5, 1.00),
]

OUT = Path(__file__).resolve().parent.parent / "assets"


def gradient(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        # Diagonal-ish blend: mostly vertical, with a slight horizontal drift.
        for x in range(size):
            t = (y / size) * 0.85 + (x / size) * 0.15
            px[x, y] = tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    unit = SIZE / 32

    base = gradient(SIZE).convert("RGBA")

    # Rounded-corner mask.
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, SIZE - 1, SIZE - 1), radius=int(RADIUS * SIZE), fill=255
    )
    icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    icon.paste(base, (0, 0), mask)

    # Bars.
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for x, y, w, h, opacity in BARS:
        draw.rounded_rectangle(
            (x * unit, y * unit, (x + w) * unit, (y + h) * unit),
            radius=1.2 * unit,
            fill=(255, 255, 255, int(255 * opacity)),
        )
    icon = Image.alpha_composite(icon, overlay)

    png_path = OUT / "icon.png"
    icon.resize((256, 256), Image.LANCZOS).save(png_path)

    ico_path = OUT / "icon.ico"
    icon.save(ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"wrote {png_path} and {ico_path}")


if __name__ == "__main__":
    main()

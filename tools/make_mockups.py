"""Generate marketing mockups from the real screenshots.

Run:  python tools/make_mockups.py
Reads:  docs/screenshot-dashboard.png, docs/screenshot-mobile.png, assets/icon.png
Writes: site/assets/hero.png, site/assets/phone.png, site/assets/og.png

Everything is drawn from the app's own palette (index.css), so the site and the
product look like one thing.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "assets"

# index.css tokens
SURFACE_0 = (13, 13, 13)
SURFACE_1 = (26, 26, 25)
BORDER = (44, 44, 42)
ACCENT = (42, 114, 204)
ACCENT_BRIGHT = (59, 130, 246)
TEXT = (255, 255, 255)
TEXT_SECONDARY = (195, 194, 183)
TEXT_MUTED = (137, 135, 129)


def vertical_gradient(size, top, bottom) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        row = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = row
    return img


def rounded_mask(size, radius) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def paste_rounded(canvas, img, box, radius) -> None:
    x, y, w, h = box
    scaled = img.resize((w, h), Image.LANCZOS).convert("RGBA")
    canvas.paste(scaled, (x, y), rounded_mask((w, h), radius))


def glow(canvas, center, radius, color, strength=90) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(
        (center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius),
        fill=color + (strength,),
    )
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius // 3)))


def drop_shadow(canvas, box, radius, blur=40, opacity=140) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(box, radius=radius, fill=(0, 0, 0, opacity))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def laptop(screen: Image.Image, out: Path) -> None:
    W, H = 1600, 900
    canvas = vertical_gradient((W, H), (18, 20, 24), (8, 8, 9)).convert("RGBA")
    glow(canvas, (W // 2, 180), 560, ACCENT_BRIGHT, 55)

    sx, sy, sw = 150, 58, 1300
    inner_h = int(sw * screen.height / screen.width)
    bezel = 16
    sh = inner_h + bezel * 2
    drop_shadow(canvas, (sx, sy + 20, sx + sw, sy + sh + 20), 22, blur=46, opacity=170)

    body = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle((0, 0, sw - 1, sh - 1), radius=22, fill=SURFACE_1 + (255,), outline=BORDER + (255,), width=2)
    canvas.alpha_composite(body, (sx, sy))
    paste_rounded(canvas, screen, (sx + bezel, sy + bezel, sw - bezel * 2, sh - bezel * 2), 12)

    # Lid edge: a thin lip under the screen and a darker hinge line, which is
    # what makes the shape read as a laptop rather than a floating window.
    base_y = sy + sh + 2
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((sx - 42, base_y, sx + sw + 42, base_y + 18), radius=9, fill=(40, 40, 39, 255))
    d.rounded_rectangle((sx + 70, base_y + 18, sx + sw - 70, base_y + 24), radius=3, fill=(22, 22, 21, 255))

    canvas.convert("RGB").save(out, quality=95)
    print(f"wrote {out}")


def phone(shot: Image.Image, out: Path) -> None:
    W, H = 760, 1180
    canvas = vertical_gradient((W, H), (18, 20, 24), (8, 8, 9)).convert("RGBA")
    glow(canvas, (W // 2, 260), 420, ACCENT_BRIGHT, 60)

    sw = 470
    inner_h = int(sw * shot.height / shot.width)
    bezel = 14
    sh = inner_h + bezel * 2
    sx, sy = (W - sw) // 2, 90
    drop_shadow(canvas, (sx, sy + 20, sx + sw, sy + sh + 20), 54, blur=40, opacity=170)

    body = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    b = ImageDraw.Draw(body)
    b.rounded_rectangle((0, 0, sw - 1, sh - 1), radius=54, fill=SURFACE_1 + (255,), outline=(58, 58, 56, 255), width=3)
    canvas.alpha_composite(body, (sx, sy))
    paste_rounded(canvas, shot, (sx + bezel, sy + bezel, sw - bezel * 2, sh - bezel * 2), 42)

    canvas.convert("RGB").save(out, quality=95)
    print(f"wrote {out}")


def og(icon: Image.Image, out: Path) -> None:
    W, H = 1200, 630
    canvas = vertical_gradient((W, H), (16, 18, 22), (8, 8, 9)).convert("RGBA")
    glow(canvas, (980, 120), 420, ACCENT_BRIGHT, 70)

    canvas.alpha_composite(icon.resize((132, 132), Image.LANCZOS).convert("RGBA"), (80, 96))

    draw = ImageDraw.Draw(canvas)
    font_big = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 92)
    font_mid = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 34)

    draw.text((80, 250), "PFN", font=font_big, fill=TEXT)
    draw.text((80, 360), "Private Finance Tracker", font=font_mid, fill=TEXT_SECONDARY)
    draw.text((80, 410), "Личные финансы на вашем компьютере", font=font_mid, fill=TEXT_MUTED)

    canvas.convert("RGB").save(out, quality=95)
    print(f"wrote {out}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    laptop(Image.open(ROOT / "docs" / "screenshot-dashboard.png"), OUT / "hero.png")
    phone(Image.open(ROOT / "docs" / "screenshot-mobile.png"), OUT / "phone.png")
    og(Image.open(ROOT / "assets" / "icon.png"), OUT / "og.png")


if __name__ == "__main__":
    main()

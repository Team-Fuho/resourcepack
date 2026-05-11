#!/usr/bin/env python3
"""snap each opaque pixel to the nearest palette color, but only allow
palette entries that have significant presence in the image (>1% of
opaque pixels).  This prevents edge-artifact pixels from mapping to
foreign palette colours (e.g. black bleeding into a red-only sign)."""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow not installed")

PALETTE = [
    (255, 255, 255),  # white
    (0, 0, 0),        # black
    (240, 10, 10),    # red    #F00A0A
    (0, 70, 170),     # blue   #0046AA
    (255, 215, 15),   # yellow #FFD70F
    (10, 150, 70),    # green  #0A9646
]


WHITE_IDX = 0
BLACK_IDX = 1

def _sqdist(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def _saturation(r, g, b):
    return max(r, g, b) - min(r, g, b)


def nearest_rgb(r, g, b):
    sat = _saturation(r, g, b)
    # achromatic edge artifacts (mid-gray between white/black) must not
    # snap to chromatic palette entries — force to black or white directly.
    # bias toward black (ramp) so sign borders stay crisp
    if sat <= 16:
        return BLACK_IDX if max(r, g, b) <= 160 else WHITE_IDX
    best_i, best_d = 0, _sqdist((r, g, b), PALETTE[0])
    for i in range(1, len(PALETTE)):
        d = _sqdist((r, g, b), PALETTE[i])
        if d < best_d:
            best_i, best_d = i, d
    return best_i


def snap(src: Path, dst: Path) -> None:
    img = Image.open(src).convert("RGBA")
    w, h = img.size

    # Pass 1 — count palette colour presence (opaque pixels only)
    counts = [0] * len(PALETTE)
    for y in range(h):
        for x in range(w):
            r, g, b, a = img.getpixel((x, y))
            if a < 128:
                continue
            counts[nearest_rgb(r, g, b)] += 1

    total = sum(counts) or 1
    threshold = max(total * 0.02, 1)
    active = {i for i, c in enumerate(counts) if c >= threshold}
    if not active:
        active = set(range(len(PALETTE)))

    # Pass 2 — remap to active palette only
    out = Image.new("RGBA", (w, h))
    for y in range(h):
        for x in range(w):
            r, g, b, a = img.getpixel((x, y))
            if a < 128:
                out.putpixel((x, y), (0, 0, 0, 0))
                continue
            best_i = nearest_rgb(r, g, b)
            if best_i in active:
                c = PALETTE[best_i]
            else:
                c = min((PALETTE[i] for i in active),
                        key=lambda p: _sqdist((r, g, b), p))
            out.putpixel((x, y), (*c, 255))

    out.save(dst)


if __name__ == "__main__":
    snap(Path(sys.argv[1]), Path(sys.argv[2]))

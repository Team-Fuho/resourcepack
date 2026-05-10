#!/usr/bin/env python3
"""Generate deduplicated stencil textures from rendered road sign PNGs.
1. Extract silhouette (alpha mask, flood-fill interior holes)
2. Downscale to 8x8 -> 64-bit key
3. Group by identical key
4. Save canonical stencil per group with 4-char hash filename
5. Output stencil_map.json
"""

import hashlib
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPT = Path(__file__).resolve().parent
PNG_DIR = SCRIPT / "png"
STENCIL_DIR = SCRIPT / "stencils"
MAP_FILE = SCRIPT / "stencil_map.json"
FILL_COLOR = (0, 70, 170, 255)  # #0046AA


def flood_fill_exterior(mask: np.ndarray) -> np.ndarray:
    """Fill interior transparent holes. mask: 2D uint8, 1=opaque, 0=transparent."""
    h, w = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    q = deque()

    for x in range(w):
        if mask[0, x] == 0:
            q.append((0, x))
        if mask[h - 1, x] == 0:
            q.append((h - 1, x))
    for y in range(1, h - 1):
        if mask[y, 0] == 0:
            q.append((y, 0))
        if mask[y, w - 1] == 0:
            q.append((y, w - 1))

    while q:
        y, x = q.popleft()
        if visited[y, x]:
            continue
        visited[y, x] = True
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w:
                if mask[ny, nx] == 0 and not visited[ny, nx]:
                    q.append((ny, nx))

    result = mask.copy()
    result[(mask == 0) & ~visited] = 1
    return result


def downscale_8x8(mask: np.ndarray) -> int:
    """Downscale binary mask to 8x8, encode as 64-bit int (row-major)."""
    h, w = mask.shape
    k = 0
    for y in range(8):
        for x in range(8):
            y0 = y * h // 8
            y1 = (y + 1) * h // 8
            x0 = x * w // 8
            x1 = (x + 1) * w // 8
            block = mask[y0:y1, x0:x1]
            if np.mean(block) > 0.5:
                k |= 1 << (y * 8 + x)
    return k


def key_hash(key: int) -> str:
    """SHA1 first 4 hex chars of the 8x8 key."""
    return hashlib.sha1(str(key).encode()).hexdigest()[:4]


def save_stencil(mask: np.ndarray, path: Path):
    h, w = mask.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[mask == 1] = FILL_COLOR
    Image.fromarray(rgba, "RGBA").save(path)


def main():
    STENCIL_DIR.mkdir(exist_ok=True)
    png_files = sorted(PNG_DIR.glob("Vietnam_road_sign_*.png"))

    # Step 1: extract silhouettes + 8x8 keys
    key_groups: dict[int, list[tuple[str, np.ndarray]]] = {}
    for p in png_files:
        arr = np.array(Image.open(p).convert("RGBA"))
        mask = (arr[:, :, 3] > 0).astype(np.uint8)
        filled = flood_fill_exterior(mask)
        k = downscale_8x8(filled)
        key_groups.setdefault(k, []).append((p.stem, filled))

    # Step 2: save canonical stencil per group + build mapping
    mapping: dict[str, str] = {}
    groups: dict[str, list[str]] = {}
    new_count = 0

    for k, members in key_groups.items():
        h4 = key_hash(k)
        fname = f"stencil-{h4}"
        out_path = STENCIL_DIR / f"{fname}.png"
        if not out_path.exists():
            canonical = members[0][1]  # first member = nominated
            save_stencil(canonical, out_path)
            new_count += 1
        basenames = [name for name, _ in members]
        mapping.update({b: fname for b in basenames})
        groups[fname] = basenames

    # Step 3: print groups
    for fname in sorted(groups):
        members = groups[fname]
        print(f"\n{fname}  ({len(members)} signs)")
        for m in members:
            print(f"  {m}")

    MAP_FILE.write_text(json.dumps(mapping, indent=2, sort_keys=True))
    print(f"\nWrote {MAP_FILE}")
    print(f"  {len(mapping)} signs -> {len(groups)} unique stencils ({new_count} new, {len(groups) - new_count} cached)")


if __name__ == "__main__":
    main()

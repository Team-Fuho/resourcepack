#!/usr/bin/env python3
"""Posterize road-sign rasters onto the fixed 6-color palette without color leak.

Pipeline (caller supplies high-res, alpha-thresholded RGBA):
  1. Detect which palette colours are truly present (high-res, near-palette only)
  2. Snap every opaque pixel to the active palette
  3. Majority-vote downscale by `scale` — never averages RGB, so midtones
     (pink, olive, muddy blue) cannot invent foreign palette colours

Usage:
  snap.py <src.png> <dst.png> [scale]
  scale defaults to 4 (512 → 128).
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

PALETTE = np.array(
    [
        [255, 255, 255],  # white
        [0, 0, 0],  # black
        [240, 10, 10],  # red    #F00A0A
        [0, 70, 170],  # blue   #0046AA
        [255, 215, 15],  # yellow #FFD70F
        [10, 150, 70],  # green  #0A9646
    ],
    dtype=np.int16,
)

WHITE_IDX = 0
BLACK_IDX = 1
N_PAL = len(PALETTE)

# Pixels farther than this from every palette entry are ignored when building
# the active set (Inkscape AA crumbs must not seed a foreign colour).
ACTIVE_DIST2 = 40 * 40

# A colour must cover this fraction of near-palette opaque pixels to be active.
ACTIVE_FRAC = 0.01
ACTIVE_MIN = 8

# Low-saturation pixels force black/white so gray AA never becomes yellow/green.
ACHROM_SAT = 16
ACHROM_LUMA_SPLIT = 160


def _nearest_indices(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """rgb: (H, W, 3) int → (idx, dist2) each (H, W)."""
    # (H, W, 1, 3) - (1, 1, N, 3) → (H, W, N, 3)
    diff = rgb.astype(np.int32)[..., None, :] - PALETTE.astype(np.int32).reshape(1, 1, N_PAL, 3)
    dist2 = np.sum(diff * diff, axis=-1)
    idx = np.argmin(dist2, axis=-1).astype(np.int16)
    nearest_d = np.min(dist2, axis=-1)
    return idx, nearest_d


def _apply_achromatic(rgb: np.ndarray, idx: np.ndarray) -> np.ndarray:
    """Force low-sat pixels to black/white in-place copy of idx."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    achrom = sat <= ACHROM_SAT
    luma_max = np.maximum(np.maximum(r, g), b)
    out = idx.copy()
    out[achrom & (luma_max <= ACHROM_LUMA_SPLIT)] = BLACK_IDX
    out[achrom & (luma_max > ACHROM_LUMA_SPLIT)] = WHITE_IDX
    return out


def _active_set(idx: np.ndarray, dist2: np.ndarray, opaque: np.ndarray) -> np.ndarray:
    """Return boolean mask length N_PAL of colours with significant presence."""
    near = opaque & (dist2 <= ACTIVE_DIST2)
    if not np.any(near):
        near = opaque
    counts = np.bincount(idx[near].astype(np.int64), minlength=N_PAL)
    total = int(counts.sum()) or 1
    thresh = max(int(total * ACTIVE_FRAC), ACTIVE_MIN)
    active = counts >= thresh
    if not np.any(active):
        active = np.ones(N_PAL, dtype=bool)
    return active


def _snap_to_active(
    rgb: np.ndarray, idx: np.ndarray, active: np.ndarray
) -> np.ndarray:
    """Map each pixel index to nearest active palette entry."""
    idx = _apply_achromatic(rgb, idx)
    if np.all(active):
        return idx

    active_ids = np.flatnonzero(active)
    # For inactive assignments, re-pick among active by RGB distance
    inactive = ~active[idx]
    if not np.any(inactive):
        return idx

    out = idx.copy()
    pix = rgb[inactive].astype(np.int32)  # (K, 3)
    # dist to each active: (K, A)
    diff = pix[:, None, :] - PALETTE[active_ids].astype(np.int32)[None, :, :]
    dist2 = np.sum(diff * diff, axis=-1)
    best = active_ids[np.argmin(dist2, axis=-1)]
    out[inactive] = best.astype(np.int16)
    return out


def _majority_downscale(
    indices: np.ndarray, opaque: np.ndarray, scale: int
) -> tuple[np.ndarray, np.ndarray]:
    """Majority-vote palette index + opacity per scale×scale block.

    Thin features: a block stays opaque if it has any opaque cell; colour is
    the mode of those opaque cells (not the transparent majority).
    """
    h, w = indices.shape
    out_h, out_w = h // scale, w // scale
    if out_h == 0 or out_w == 0:
        raise ValueError(f"image {w}x{h} too small for scale={scale}")

    # Crop to whole blocks
    idx = indices[: out_h * scale, : out_w * scale]
    opq = opaque[: out_h * scale, : out_w * scale]

    blocks_i = idx.reshape(out_h, scale, out_w, scale).transpose(0, 2, 1, 3)
    blocks_o = opq.reshape(out_h, scale, out_w, scale).transpose(0, 2, 1, 3)
    # (out_h, out_w, scale, scale)
    flat_i = blocks_i.reshape(out_h, out_w, scale * scale)
    flat_o = blocks_o.reshape(out_h, out_w, scale * scale)

    out_idx = np.zeros((out_h, out_w), dtype=np.int16)
    out_opq = np.any(flat_o, axis=-1)

    # Vectorized mode among opaque cells: for each palette id count votes
    # counts[y,x,c] = number of opaque cells with that palette index
    counts = np.zeros((out_h, out_w, N_PAL), dtype=np.int32)
    for c in range(N_PAL):
        counts[:, :, c] = np.sum(flat_o & (flat_i == c), axis=-1)

    # mode; tie → lowest index (stable, white preferred slightly via order)
    out_idx = np.argmax(counts, axis=-1).astype(np.int16)
    # blocks with no opaque cells: index unused
    return out_idx, out_opq


def _indices_to_rgba(indices: np.ndarray, opaque: np.ndarray) -> np.ndarray:
    h, w = indices.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[opaque, :3] = PALETTE[indices[opaque]].astype(np.uint8)
    out[opaque, 3] = 255
    return out


def snap(src: Path, dst: Path, scale: int = 4) -> None:
    if scale < 1:
        raise ValueError("scale must be >= 1")

    img = Image.open(src).convert("RGBA")
    arr = np.asarray(img)
    rgb = arr[:, :, :3]
    opaque = arr[:, :, 3] >= 128

    idx, dist2 = _nearest_indices(rgb)
    idx = _apply_achromatic(rgb, idx)

    active = _active_set(idx, dist2, opaque)
    snapped = _snap_to_active(rgb, idx, active)

    if scale == 1:
        out_idx, out_opq = snapped, opaque
    else:
        out_idx, out_opq = _majority_downscale(snapped, opaque, scale)

    out = _indices_to_rgba(out_idx, out_opq)
    Image.fromarray(out, "RGBA").save(dst)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(f"usage: {sys.argv[0]} <src.png> <dst.png> [scale]")
    sc = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    snap(Path(sys.argv[1]), Path(sys.argv[2]), scale=sc)

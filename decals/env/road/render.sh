#!/bin/bash
# render.sh — render SVGs to pixel-art-sharp PNGs at 128px using the fixed
# 6-color road sign palette.
#
# Posterize pipeline:
#   1. Render at 4× supersample (512px)  — sub-pixel alpha precision
#   2. Threshold alpha to binary at high res
#   3. Box-filter downscale to 128px      — area-average = natural posterize
#   4. snap.py: per-sign dynamic palette  — only colours present in the sign
#      are used as remap targets (no black bleed into red-only signs, etc.)

set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$SCRIPT_DIR/svg"
dst="$SCRIPT_DIR/png"
res=128
supersample=4
mkdir -p "$dst"

for svg in "$src"/*.svg; do
	base=$(basename "$svg" .svg)
	out="$dst/${base}.png"

	read -r w h <<< "$(identify -format '%w %h' "$svg" 2>/dev/null)" || true
	dims=()
	big=$(( res * supersample ))
	if [ "${w:-0}" -gt "${h:-0}" ]; then
		dims=(-w "$big")
	else
		dims=(-h "$big")
	fi

	tmp=$(mktemp /tmp/road_tmp_XXXXXX.png)

	inkscape --export-type=png --export-filename="$tmp" "${dims[@]}" \
		--export-background-opacity=0 "$svg" 2>/dev/null

	magick "$tmp" \
		-channel A -threshold 50% +channel \
		-filter box -resize "${res}x${res}" \
		/tmp/road_snap_in.png

	python3 "$SCRIPT_DIR/snap.py" /tmp/road_snap_in.png "$out"

	rm -f "$tmp" /tmp/road_snap_in.png
	echo "Rendered: $base"
done

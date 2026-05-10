#!/bin/bash
# render.sh — render SVGs to pixel-art-sharp PNGs at 128px using the fixed
# 6-color road sign palette.  Anti-aliased edge pixels are snapped to the
# nearest palette color via ImageMagick with dithering disabled.

set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$SCRIPT_DIR/svg"
dst="$SCRIPT_DIR/png"
res=128
mkdir -p "$dst"

PALETTE=$(mktemp /tmp/road_palette_XXXXXX.png)
trap 'rm -f "$PALETTE"' EXIT

magick \
	\( -size 1x1 xc:'#FFFFFF' \) \
	\( -size 1x1 xc:'#000000' \) \
	\( -size 1x1 xc:'#F00A0A' \) \
	\( -size 1x1 xc:'#0046AA' \) \
	\( -size 1x1 xc:'#FFD70F' \) \
	\( -size 1x1 xc:'#0A9646' \) \
	-append "$PALETTE"

for svg in "$src"/*.svg; do
	base=$(basename "$svg" .svg)
	out="$dst/${base}.png"

	read -r w h <<< "$(identify -format '%w %h' "$svg" 2>/dev/null)" || true
	if [ "${w:-0}" -gt "${h:-0}" ]; then
		inkscape --export-type=png --export-filename="$out" -w "$res" "$svg" 2>/dev/null
	else
		inkscape --export-type=png --export-filename="$out" -h "$res" "$svg" 2>/dev/null
	fi

	magick "$out" -dither None -remap "$PALETTE" "$out"
	echo "Rendered: $base"
done

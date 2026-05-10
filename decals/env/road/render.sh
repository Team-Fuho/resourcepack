#!/bin/bash
set -euo pipefail
shopt -s nullglob

src="svg"
dst="png"
mkdir -p "$dst"

for svg in "$src"/*.svg; do
	base=$(basename "$svg" .svg)
	out="$dst/${base}.png"

	read w h <<< $(identify -format "%w %h" "$svg" 2>/dev/null) || true
	if [ "${w:-0}" -gt "${h:-0}" ]; then
		inkscape --export-type=png --export-filename="$out" -w 512 "$svg" 2>/dev/null
	else
		inkscape --export-type=png --export-filename="$out" -h 512 "$svg" 2>/dev/null
	fi
	echo "Rendered: $base"
done

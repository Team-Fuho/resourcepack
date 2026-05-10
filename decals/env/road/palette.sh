#!/bin/bash
# palette.sh — remap SVG fill/stroke/color values to the fixed road sign palette.
#
# Palette:  white #FFFFFF   black #000000   red #F00A0A
#           blue #0046AA    yellow #FFD70F   green #0A9646
#
# Usage:  ./palette.sh          (remap SVGs in place + rerender PNGs)
#         ./palette.sh --dry    (show what would change, don't touch files)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SVGDIR="$SCRIPT_DIR/svg"
DRY=0
[[ "${1:-}" == "--dry" ]] && DRY=1

# ── palette ────────────────────────────────────────────────────────────
PALETTE_HEX=(FFFFFF 000000 F00A0A 0046AA FFD70F 0A9646)

declare -a PAL_R PAL_G PAL_B
for h in "${PALETTE_HEX[@]}"; do
	PAL_R+=($((16#${h:0:2})))
	PAL_G+=($((16#${h:2:2})))
	PAL_B+=($((16#${h:4:2})))
done

# squared Euclidean distance between an RGB triple and palette entry i
sqdist() { local r=$1 g=$2 b=$3 i=$4
	echo $(( (r - ${PAL_R[$i]}) ** 2 + (g - ${PAL_G[$i]}) ** 2 + (b - ${PAL_B[$i]}) ** 2 ))
}

# nearest palette hex for the given uppercase hex (no #)
nearest() { local r=$((16#${1:0:2})) g=$((16#${1:2:2})) b=$((16#${1:4:2}))
	local best_i=0 d best_d
	best_d=$(sqdist "$r" "$g" "$b" 0)
	for ((i=1; i<${#PALETTE_HEX[@]}; i++)); do
		d=$(sqdist "$r" "$g" "$b" "$i")
		if (( d < best_d )); then
			best_d=$d best_i=$i
		fi
	done
	echo "${PALETTE_HEX[$best_i]}"
}

# ── process each SVG ───────────────────────────────────────────────────
declare -A MAP  # uppercase hex -> nearest palette hex

for svg in "$SVGDIR"/*.svg; do
	[[ -f "$svg" ]] || continue
	name=$(basename "$svg")

	# collect unique hex colors (case-insensitive, strip #)
	colors=$(grep -oPi '#[0-9a-f]{6}' "$svg" | tr 'a-f' 'A-F' | sed 's/^#//' | sort -u)
	[[ -z "$colors" ]] && continue

	changed=0
	sed_script=""

	while IFS= read -r c; do
		[[ -z "$c" ]] && continue
		[[ " ${PALETTE_HEX[*]} " == *" $c "* ]] && continue

		# reuse cached mapping
		if [[ -z "${MAP[$c]:-}" ]]; then
			MAP[$c]=$(nearest "$c")
		fi
		to="${MAP[$c]}"

		if (( DRY )); then
			echo "  $name  #$c -> #$to"
			continue
		fi

		echo "  $name  #$c -> #$to"
		# Build sed expression: replace #xxx (case-insensitive) with #TO
		# Use group matching: find #[cC] pattern and replace
		# Convert c to lowercase for the sed regex
		lc=$(echo "$c" | tr 'A-F' 'a-f')
		sed_script+="s/#${lc}/#${to}/gI;"
		changed=1
	done <<< "$colors"

	if (( DRY )); then
		continue
	fi

	if (( changed )); then
		sed -i -E "$sed_script" "$svg"
	fi
done

# ── rerender PNGs ──────────────────────────────────────────────────────
if (( ! DRY )); then
	echo ""
	"$SCRIPT_DIR/render.sh"
fi

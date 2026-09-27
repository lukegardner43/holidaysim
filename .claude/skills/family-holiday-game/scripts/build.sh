#!/usr/bin/env bash
# Build one game folder into its single-file index.html (Three.js and all data inlined).
#   usage: build.sh [GAME_DIR]      GAME_DIR holds src/{head.html,game.js,tail.html}; defaults to the repo root.
# The shared Three.js r128 bundle lives in <repo>/vendor/three.html. game.js is syntax-checked first.
set -euo pipefail
G="${1:-.}"; G="$(cd "$G" && pwd)"
ROOT="$(git -C "$G" rev-parse --show-toplevel 2>/dev/null || echo "$G")"
S="$G/src"
for f in head.html game.js tail.html; do [ -f "$S/$f" ] || { echo "missing $S/$f" >&2; exit 1; }; done
[ -f "$ROOT/vendor/three.html" ] || { echo "missing $ROOT/vendor/three.html" >&2; exit 1; }
tmp="$(mktemp --suffix=.js)"; trap 'rm -f "$tmp"' EXIT
sed '1s/^<script>//' "$S/game.js" | sed '$d' > "$tmp"
node --check "$tmp"
cat "$S/head.html" "$ROOT/vendor/three.html" "$S/game.js" "$S/tail.html" > "$G/index.html"
echo "built $G/index.html ($(wc -c < "$G/index.html") bytes)"

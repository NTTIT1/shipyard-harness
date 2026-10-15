#!/usr/bin/env bash
# Render a static HTML mockup to PNG with headless Chrome/Chromium (designer step, spec §6.1).
#   mockup-shot.sh <html> <out.png> [WIDTHxHEIGHT]    default 1280x800; mobile: 390x844
# Exit: 0 ok (prints the PNG path) · 2 no browser / no image · 64 usage
set -euo pipefail
HTML="${1:-}"; OUT="${2:-}"; SIZE="${3:-1280x800}"
[ -n "$HTML" ] && [ -n "$OUT" ] && [ -f "$HTML" ] || { echo "usage: mockup-shot.sh <html> <out.png> [WxH] (html must exist)" >&2; exit 64; }
[[ "$SIZE" =~ ^[0-9]+x[0-9]+$ ]] || { echo "mockup-shot: size must be WIDTHxHEIGHT" >&2; exit 64; }
BROWSER="${CHROME_BIN:-}"
if [ -z "$BROWSER" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser; do
    command -v "$c" >/dev/null 2>&1 && { BROWSER="$c"; break; }
  done
fi
[ -n "$BROWSER" ] || { echo "mockup-shot: no Chrome/Chromium found (set CHROME_BIN)" >&2; exit 2; }
mkdir -p "$(dirname "$OUT")"
ABS_HTML="$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")"
ABS_OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
rm -f "$ABS_OUT"
"$BROWSER" --headless=new --disable-gpu --no-sandbox --hide-scrollbars --force-device-scale-factor=1 \
  --window-size="${SIZE/x/,}" --screenshot="$ABS_OUT" "file://$ABS_HTML" >/dev/null 2>&1 || true
[ -s "$ABS_OUT" ] || { echo "mockup-shot: the browser produced no image" >&2; exit 2; }
echo "$ABS_OUT"

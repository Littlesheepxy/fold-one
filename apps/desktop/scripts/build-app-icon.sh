#!/usr/bin/env bash
# Build fold-app-icon.png (1024) + fold-app-icon.icns from fold-app-icon.svg
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC="$ROOT/public"
SVG="$PUBLIC/fold-app-icon.svg"
MASTER="$PUBLIC/fold-app-icon.png"
ICONSET="$PUBLIC/fold-app-icon.iconset"
ICNS="$PUBLIC/fold-app-icon.icns"

if [[ ! -f "$SVG" ]]; then
  echo "Missing $SVG" >&2
  exit 1
fi

# Rasterize SVG → PNG with sips (keeps alpha; qlmanage adds a white canvas)
sips -s format png "$SVG" --out "$MASTER" >/dev/null
sips -z 1024 1024 "$MASTER" --out "$MASTER" >/dev/null

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

sips -z 16 16 "$MASTER" --out "$ICONSET/icon_16x16.png" >/dev/null
sips -z 32 32 "$MASTER" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$MASTER" --out "$ICONSET/icon_32x32.png" >/dev/null
sips -z 64 64 "$MASTER" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$MASTER" --out "$ICONSET/icon_128x128.png" >/dev/null
sips -z 256 256 "$MASTER" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$MASTER" --out "$ICONSET/icon_256x256.png" >/dev/null
sips -z 512 512 "$MASTER" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$MASTER" --out "$ICONSET/icon_512x512.png" >/dev/null
cp "$MASTER" "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$ICNS"
rm -rf "$ICONSET"

echo "Wrote $MASTER and $ICNS"

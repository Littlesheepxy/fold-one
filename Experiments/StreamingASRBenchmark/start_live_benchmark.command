#!/bin/zsh
set -e

ROOT="${0:A:h}"
cd "$ROOT"

RUNTIME_LIB="$ROOT/Runtime/sherpa-onnx-v1.13.4-osx-arm64-shared-no-tts/lib"
for library in "$RUNTIME_LIB"/*.dylib; do
  codesign --force --sign - "$library" >/dev/null 2>&1
done

if ! lsof -nP -iTCP:8791 -sTCP:LISTEN >/dev/null 2>&1; then
  "$ROOT/Backends/.venv314/bin/python" \
    "$ROOT/Backends/moonshine_ws_backend.py" \
    --host 127.0.0.1 \
    --port 8791 \
    --language zh \
    --asset-root "$ROOT/Backends/moonshine-assets" \
    --update-interval 0.12 &
fi

if [[ ! -x "$ROOT/.build/debug/StreamingASRBenchmark" ]]; then
  swift build
fi

exec "$ROOT/.build/debug/StreamingASRBenchmark" --live-ui --port 8787

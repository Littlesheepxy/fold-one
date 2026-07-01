#!/usr/bin/env bash
# E2E smoke test for Fold Runtime skills (no Electron)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Fold E2E smoke test =="

# Create sample PDF path (use any pdf in Downloads or skip)
DOWNLOADS="$HOME/Downloads"
SAMPLE=$(find "$DOWNLOADS" -maxdepth 1 -name "*.pdf" -type f 2>/dev/null | head -1 || true)

if [ -z "$SAMPLE" ]; then
  echo "No PDF in Downloads — creating minimal test via python"
  python3 - <<'PY'
from pathlib import Path
p = Path.home() / "Downloads" / "fold-test-quote.pdf"
try:
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Vendor: Acme Corp\nAmount: $12,000\nDate: 2026-07-01")
    doc.save(str(p))
    print(f"Created {p}")
except ImportError:
    p.write_text("%PDF-1.4 placeholder")
    print(f"Created placeholder {p} (install pymupdf for real PDF)")
PY
  SAMPLE="$DOWNLOADS/fold-test-quote.pdf"
fi

echo "Sample PDF: $SAMPLE"

pnpm exec tsx scripts/e2e-smoke.ts "$SAMPLE"
echo "== Done =="

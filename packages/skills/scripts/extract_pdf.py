#!/usr/bin/env python3
"""Extract text and heuristics from PDF for Fold Demo."""
import json
import re
import sys

def main():
    path = sys.argv[1]
    try:
        import pdfplumber
    except ImportError:
        # fallback: try PyMuPDF
        try:
            import fitz
            doc = fitz.open(path)
            text = "\n".join(page.get_text() for page in doc)
        except Exception:
            text = f"(install pdfplumber: pip install pdfplumber) — could not read {path}"
    else:
        with pdfplumber.open(path) as pdf:
            text = "\n".join((p.extract_text() or "") for p in pdf.pages)

    vendor = None
    amount = None
    date = None

    amount_m = re.search(r'[\$¥€]\s*[\d,]+(?:\.\d{2})?', text)
    if amount_m:
        amount = amount_m.group(0).strip()

    date_m = re.search(r'\d{4}[-/]\d{1,2}[-/]\d{1,2}', text)
    if date_m:
        date = date_m.group(0)

    for line in text.splitlines()[:20]:
        if re.search(r'vendor|supplier|company|报价|供应商', line, re.I):
            vendor = line.strip()[:80]
            break

    print(json.dumps({
        "vendor": vendor,
        "amount": amount,
        "date": date,
        "rawText": text[:2000],
    }))

if __name__ == "__main__":
    main()

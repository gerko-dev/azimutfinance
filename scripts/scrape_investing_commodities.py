"""Scrape historical price data for 8 commodities from Investing.com.

Writes one CSV per commodity to data/<slug>.csv in the exact Investing.com
"Download Data" format (FR locale) consumed by lib/commodities.ts:

  "Date","Dernier","Ouv."," Plus Haut","Plus Bas","Vol.","Variation %"

Source : the public JSON API at api.investing.com/api/financialdata/historical/<id>.
This is the same endpoint the page's React app calls when you change the date
range. No auth required, just the right Referer + User-Agent headers.

Each instrument is keyed by its numeric Investing ID (stable per instrument).

Usage:
  python scripts/scrape_investing_commodities.py
  python scripts/scrape_investing_commodities.py --years 5      # default 2
  python scripts/scrape_investing_commodities.py --slug cacao   # one only
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
import urllib.parse
from datetime import date, timedelta
from pathlib import Path

from curl_cffi import requests as cc_requests

# ---------------------------------------------------------------------------
# Catalog — must stay in sync with COMMODITIES in lib/commodities.ts
# ---------------------------------------------------------------------------

COMMODITIES = [
    # slug, instrumentId, source page slug (for Referer), CSV file name
    ("cacao",   8860,    "london-cocoa-historical-data",          "Cacao.csv"),
    ("cafe",    8911,    "london-coffee-historical-data",         "Cafe.csv"),
    ("brent",   8833,    "brent-oil-historical-data",             "brent.csv"),
    ("wti",     8849,    "crude-oil-historical-data",             "wti.csv"),
    ("or",      8830,    "gold-historical-data",                  "or.csv"),
    ("palmoil", 992744,  "palm-oil-usd-historical-data",          "palmoil.csv"),
    ("sugar",   8834,    "london-sugar-historical-data",          "sugar.csv"),
    ("tsr",     1013412, "rubber-tsr20-futures-historical-data",  "tsr.csv"),
]

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)


def _fetch_window(instrument_id: int, referer_slug: str, start: date, end: date) -> list[dict]:
    """Single API call. Returns rows in newest-first order.

    Uses curl_cffi (Chrome TLS fingerprint) because Cloudflare on
    api.investing.com filters by JA3 — system curl on GitHub runners gets a 403,
    curl_cffi impersonating Chrome passes through.
    """
    qs = urllib.parse.urlencode({
        "start-date": start.isoformat(),
        "end-date": end.isoformat(),
        "time-frame": "Daily",
        "add-missing-rows": "false",
    })
    url = f"https://api.investing.com/api/financialdata/historical/{instrument_id}?{qs}"
    headers = {
        "User-Agent": UA,
        "Referer": f"https://fr.investing.com/commodities/{referer_slug}",
        "domain-id": "fr",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    }
    try:
        r = cc_requests.get(url, headers=headers, impersonate="chrome", timeout=60, verify=False)
    except Exception as e:
        raise RuntimeError(f"curl_cffi {type(e).__name__}: {str(e)[:200]}")
    if r.status_code >= 400:
        snippet = (r.text or "").strip()[:300].replace("\n", " ")
        raise RuntimeError(f"http {r.status_code}: {snippet}")
    return (r.json().get("data") or [])


# The API hard-caps a single response at 5000 rows and returns them oldest-first
# from `start-date`. For a 20-year window (~5040 trading days) we'd silently lose
# the most recent months. So we fetch in ~4-year chunks and concatenate.
CHUNK_YEARS = 4


def fetch_history(instrument_id: int, referer_slug: str, start: date, end: date) -> list[dict]:
    """Fetch history across multiple chunked API calls, dedup, sort newest-first."""
    seen: dict[str, dict] = {}  # rowDate (DD/MM/YYYY) -> row
    chunk_end = end
    while chunk_end >= start:
        chunk_start = max(start, chunk_end - timedelta(days=CHUNK_YEARS * 366))
        rows = _fetch_window(instrument_id, referer_slug, chunk_start, chunk_end)
        for r in rows:
            d = r.get("rowDate")
            if d and d not in seen:
                seen[d] = r
        if chunk_start <= start:
            break
        # Step back, leave a 1-day overlap as safety net
        chunk_end = chunk_start - timedelta(days=1)
        time.sleep(0.3)
    # Sort newest-first by rowDateRaw (epoch seconds) — matches Investing's export.
    return sorted(seen.values(), key=lambda r: r.get("rowDateRaw", 0), reverse=True)


# ---------------------------------------------------------------------------
# CSV writing — match Investing.com's "Download Data" export exactly
# ---------------------------------------------------------------------------

HEADER = ["Date", "Dernier", "Ouv.", " Plus Haut", "Plus Bas", "Vol.", "Variation %"]


def write_csv(path: Path, rows: list[dict]) -> int:
    """Write rows in the Investing FR CSV format. Returns row count written."""
    # API returns most-recent first — keep that order to match existing CSVs.
    written = 0
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL, lineterminator="\n")
        w.writerow(HEADER)
        for r in rows:
            chg = r.get("change_precent", "")
            chg_str = f"{chg}%" if chg != "" else ""
            w.writerow([
                r.get("rowDate", ""),
                r.get("last_close", ""),
                r.get("last_open", ""),
                r.get("last_max", ""),
                r.get("last_min", ""),
                r.get("volume", ""),
                chg_str,
            ])
            written += 1
    return written


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=20, help="history depth in years (default 20)")
    ap.add_argument("--slug", help="restrict to one commodity slug")
    ap.add_argument("--delay", type=float, default=0.5, help="seconds between requests")
    args = ap.parse_args()

    today = date.today()
    start = today - timedelta(days=args.years * 366)
    print(f"Range: {start} -> {today}")

    targets = COMMODITIES
    if args.slug:
        targets = [t for t in COMMODITIES if t[0] == args.slug]
        if not targets:
            print(f"Unknown slug: {args.slug}")
            return 2

    failures = 0
    for slug, iid, referer, fname in targets:
        out = DATA_DIR / fname
        try:
            rows = fetch_history(iid, referer, start, today)
        except Exception as e:
            print(f"  {slug:8} ERROR {type(e).__name__}: {e}")
            failures += 1
            continue
        if not rows:
            print(f"  {slug:8} empty response (id={iid})")
            failures += 1
            continue
        n = write_csv(out, rows)
        first, last = rows[0].get("rowDate"), rows[-1].get("rowDate")
        print(f"  {slug:8} {n:>5} rows  {last} -> {first}  ({out.name})")
        time.sleep(args.delay)

    print(f"\nDone. {len(targets) - failures}/{len(targets)} OK.")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

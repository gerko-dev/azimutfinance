"""Scrape historical price data for the 13 FX pairs tracked by /macro/devises.

Writes one CSV per pair to data/<File>.csv in the exact Investing.com
"Download Data" format (FR locale) consumed by lib/fx.ts :

  "Date","Dernier","Ouv."," Plus Haut","Plus Bas","Vol.","Variation %"

Source : the public JSON API at api.investing.com/api/financialdata/historical/<id>.
Same endpoint the page's React app calls when you change the date range.
No auth required, just the right Referer + User-Agent headers.

Each instrument is keyed by its numeric Investing ID (discovered via fx_probe.py
and embedded below — IDs are stable per instrument).

Note : Investing caps a single response at 5000 rows. A 20-year FX window
( ~5200 weekday quotes ) busts the cap for the most volatile pairs (TRY/BRL).
We therefore fetch in ~4-year chunks and concatenate, same approach as the
commodities scraper.

Usage:
  python scripts/scrape_investing_fx.py
  python scripts/scrape_investing_fx.py --years 5      # default 20
  python scripts/scrape_investing_fx.py --slug USD_XOF # one only
"""
from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
import time
import urllib.parse
from datetime import date, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------
# Catalog — IDs from scripts/fx_probe.py
# slug must stay in sync with FxSlug in lib/fx.ts
# file must stay in sync with FxMeta.file
# referer_slug is the path under fr.investing.com/currencies/... used for the
# Referer header (Cloudflare drops requests without a matching referer).
# ---------------------------------------------------------------------------

FX_PAIRS = [
    # slug, instrumentId, referer slug, CSV file name
    ("DXY",     8827,    "us-dollar-index", "US_Dollar_Index.csv"),
    ("EUR_USD", 1,       "eur-usd",         "EUR_USD.csv"),
    ("GBP_USD", 2,       "gbp-usd",         "GBP_USD.csv"),
    ("USD_CNY", 2111,    "usd-cny",         "USD_CNY.csv"),
    ("USD_XOF", 2220,    "usd-xof",         "USD_XOF.csv"),
    ("GBP_XOF", 9612,    "gbp-xof",         "GBP_XOF.csv"),
    ("JPY_XOF", 9787,    "jpy-xof",         "JPY_XOF.csv"),
    ("CAD_XOF", 9487,    "cad-xof",         "CAD_XOF.csv"),
    ("AED_XOF", 9329,    "aed-xof",         "AED_XOF.csv"),
    ("TRY_XOF", 10294,   "try-xof",         "TRY_XOF.csv"),
    ("BRL_XOF", 9455,    "brl-xof",         "BRL_XOF.csv"),
    ("ZAR_XOF", 10445,   "zar-xof",         "ZAR_XOF.csv"),
    ("NGN_XOF", 1175902, "ngn-xof",         "NGN_XOF.csv"),
]

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)


def _fetch_window(instrument_id: int, referer_slug: str, start: date, end: date) -> list[dict]:
    """Single API call. Returns rows in newest-first order.

    Shells out to curl rather than using urllib because Cloudflare on
    api.investing.com fingerprints the TLS handshake — urllib gets a 403,
    curl sails through with the same headers.
    """
    qs = urllib.parse.urlencode({
        "start-date": start.isoformat(),
        "end-date": end.isoformat(),
        "time-frame": "Daily",
        "add-missing-rows": "false",
    })
    url = f"https://api.investing.com/api/financialdata/historical/{instrument_id}?{qs}"
    cmd = [
        "curl", "-sk", "--fail", "--max-time", "60",
        "-A", UA,
        "-H", f"Referer: https://fr.investing.com/currencies/{referer_slug}",
        "-H", "domain-id: fr",
        "-H", "Accept: application/json, text/plain, */*",
        "-H", "Accept-Language: fr-FR,fr;q=0.9,en;q=0.8",
        url,
    ]
    out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        raise RuntimeError(f"curl exit {out.returncode}: {out.stderr.strip()[:200]}")
    data = json.loads(out.stdout)
    return data.get("data") or []


# 4-year chunks — empirically safe under the 5000-row cap even for FX
# pairs that have weekend ticks (e.g. some EM crosses on Investing).
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
    ap.add_argument("--slug", help="restrict to one FX slug (e.g. USD_XOF)")
    ap.add_argument("--delay", type=float, default=0.5, help="seconds between pairs")
    args = ap.parse_args()

    today = date.today()
    start = today - timedelta(days=args.years * 366)
    print(f"Range: {start} -> {today}")

    targets = FX_PAIRS
    if args.slug:
        targets = [t for t in FX_PAIRS if t[0] == args.slug]
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

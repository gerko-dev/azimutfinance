"""Probe Investing.com currency pages to extract instrumentId."""
import json
import re
import subprocess

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

# slug -> investing URL path (without /historical-data suffix)
URLS = {
    "DXY":      "/currencies/us-dollar-index-historical-data",
    "EUR_USD":  "/currencies/eur-usd-historical-data",
    "GBP_USD":  "/currencies/gbp-usd-historical-data",
    "USD_CNY":  "/currencies/usd-cny-historical-data",
    "USD_XOF":  "/currencies/usd-xof-historical-data",
    "GBP_XOF":  "/currencies/gbp-xof-historical-data",
    "JPY_XOF":  "/currencies/jpy-xof-historical-data",
    "CAD_XOF":  "/currencies/cad-xof-historical-data",
    "AED_XOF":  "/currencies/aed-xof-historical-data",
    "TRY_XOF":  "/currencies/try-xof-historical-data",
    "BRL_XOF":  "/currencies/brl-xof-historical-data",
    "ZAR_XOF":  "/currencies/zar-xof-historical-data",
    "NGN_XOF":  "/currencies/ngn-xof-historical-data",
}

for slug, path in URLS.items():
    url = f"https://fr.investing.com{path}"
    try:
        out = subprocess.run([
            "curl", "-sk", "-L", "--fail", "--max-time", "30",
            "-A", UA, url,
        ], capture_output=True, text=True, encoding="utf-8")
        if out.returncode != 0:
            print(f"  {slug:8} FAIL curl exit {out.returncode}")
            continue
        html = out.stdout
        m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', html, re.S)
        if not m:
            print(f"  {slug:8} no __NEXT_DATA__")
            continue
        data = json.loads(m.group(1))
        state = data["props"]["pageProps"]["state"]
        # currencies use currencyStore or instrumentStore depending on the site version
        cs = state.get("currencyStore") or state.get("instrumentStore") or {}
        iid = cs.get("instrumentId")
        inst = cs.get("instrument", {})
        name = inst.get("shortName") or inst.get("englishName") or inst.get("name") or "?"
        print(f"  {slug:8} id={iid:<8} {name}")
    except Exception as e:
        print(f"  {slug:8} ERROR {type(e).__name__}: {e}")

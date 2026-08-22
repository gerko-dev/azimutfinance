#!/usr/bin/env python3
"""
Alimente data/historique_sika_indices/<CODE>.csv depuis la cote live BRVM,
apres la cloture de la seance.

Pourquoi : Sikafinance ne publie pas l'indice BRVM - SERVICES PUBLICS (teste
sous 10 variantes de ticker, toutes en `nodata`). Sa serie s'arretait au
29/01/2025, et le YTD affiche sur /marches/actions etait calcule contre cette
reference perimee — +185,89 % au lieu du +168,89 % publie par la BRVM.

L'historique 02/01/2025 -> 21/08/2026 a ete reconstitue depuis les Bulletins
Officiels de la Cote (cf. scripts/scrape_boc_indices.py, conserve pour le
backfill et l'audit). Au quotidien, ce script suffit : la page
https://www.brvm.org/fr/indices porte deja la valeur de cloture.

Le parsing reproduit celui de lib/brvm/liveIndices.ts (memes tables, meme
normalisation de libelle vers les codes de fichiers CSV).

Dependances :
    pip install requests

Usage :
    python scripts/update_index_history_live.py             # BRVM-SP, seance du jour
    python scripts/update_index_history_live.py --codes all # tous les indices
    python scripts/update_index_history_live.py --dry-run   # n'ecrit rien
    python scripts/update_index_history_live.py --require-closed
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
INDICES_DIR = ROOT / "data" / "historique_sika_indices"

BRVM_URL = "https://www.brvm.org/fr/indices"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Cache-Control": "no-cache",
}

# Indices ecrits par defaut. Les autres sont deja couverts par
# scrape_sika_history.py ; --codes all permet de tous les rafraichir.
DEFAULT_CODES = ("BRVM-SP",)

CSV_HEADER = ["date_iso", "date_fr", "open", "high", "low", "close", "volume"]

# Libelle BRVM normalise -> code de fichier CSV. Doit rester aligne sur
# normalizeIndexCode() dans lib/brvm/liveIndices.ts.
LABEL_TO_CODE = {
    "BRVM-30": "BRVM30",
    "BRVM 30": "BRVM30",
    "BRVM - COMPOSITE": "BRVMC",
    "BRVM-COMPOSITE": "BRVMC",
    "BRVM - PRESTIGE": "BRVMPR",
    "BRVM-PRESTIGE": "BRVMPR",
    "BRVM - PRINCIPAL": "BRVMPA",
    "BRVM-PRINCIPAL": "BRVMPA",
    "BRVM - CONSOMMATION DE BASE": "BRVM-CB",
    "BRVM - CONSOMMATION DISCRETIONNAIRE": "BRVM-CD",
    "BRVM - ENERGIE": "BRVM-EN",
    "BRVM - INDUSTRIELS": "BRVM-IN",
    "BRVM - SERVICES FINANCIERS": "BRVM-SF",
    "BRVM - SERVICES PUBLICS": "BRVM-SP",
    "BRVM - TELECOMMUNICATIONS": "BRVM-TEL",
    "BRVM - COMPOSITE TOTAL RETURN": "BRVMC-TR",
}


def strip_tags(html: str) -> str:
    s = re.sub(r"<[^>]+>", " ", html)
    s = s.replace("&amp;", "&").replace("&nbsp;", " ").replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def normalize_label(raw: str) -> str:
    s = unicodedata.normalize("NFD", raw.upper())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip()


def parse_fr_number(s: str) -> float | None:
    s = re.sub(r"[\s  ]", "", s or "").replace("%", "").replace("+", "")
    s = s.replace(",", ".")
    if not s or s in {"-", "."}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_indices(html: str) -> dict[str, dict]:
    """{code: {name, value, ytdPct}} depuis toutes les tables de la page."""
    out: dict[str, dict] = {}
    for table in re.findall(r"<table[^>]*>[\s\S]*?</table>", html, re.I):
        tb = re.search(r"<tbody[^>]*>([\s\S]*?)</tbody>", table, re.I)
        body = tb.group(1) if tb else table
        for row in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", body, re.I):
            cells = re.findall(r"<td[^>]*>([\s\S]*?)</td>", row, re.I)
            if len(cells) < 5:
                continue
            name = strip_tags(cells[0])
            code = LABEL_TO_CODE.get(normalize_label(name))
            if not code or code in out:
                continue
            value = parse_fr_number(strip_tags(cells[2]))
            if value is None or value <= 0:
                continue
            # ATTENTION : la 5e colonne s'intitule "Variation 31 decembre (%)"
            # mais ne contient PAS un YTD. Ses valeurs sont les variations du
            # JOUR relevees le 31/12/2025 (verifie contre le BOC : CB 1,51 ;
            # CD -0,87 ; TEL 3,44). Colonne figee, mal intitulee cote BRVM.
            # On ne la lit pas : le YTD se calcule depuis notre historique
            # (computeYtdPct dans lib/dataLoader.ts).
            out[code] = {
                "name": name,
                "value": value,
                "previousValue": parse_fr_number(strip_tags(cells[1])),
                "dayPct": parse_fr_number(strip_tags(cells[3])),
            }
    return out


def ytd_from_history(code: str, current: float, rows: dict[str, list[str]],
                     year: int) -> float | None:
    """YTD tel que le calculera le site : contre la derniere cloture <= 31/12."""
    cutoff = f"{year - 1}-12-31"
    ref = None
    for iso in sorted(rows):
        if iso <= cutoff:
            try:
                ref = float(rows[iso][5])
            except (ValueError, IndexError):
                pass
        else:
            break
    if not ref:
        return None
    return (current / ref - 1) * 100


def parse_session(html: str) -> tuple[str | None, bool | None]:
    m = re.search(
        r'<p[^>]*class="header-seance"[^>]*>([^<]+)</p>', html, re.I
    )
    label = m.group(1).strip() if m else None
    closed = bool(re.search(r'class="[^"]*seance-fermee[^"]*"', html, re.I))
    opened = bool(re.search(r'class="[^"]*seance-ouverte[^"]*"', html, re.I))
    if closed:
        return label, True
    if opened:
        return label, False
    return label, None


# ── CSV ─────────────────────────────────────────────────────────────────────


def read_index_csv(code: str) -> dict[str, list[str]]:
    path = INDICES_DIR / f"{code}.csv"
    rows: dict[str, list[str]] = {}
    if not path.exists():
        return rows
    with path.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.reader(f, delimiter=";"):
            if not r or r[0] == "date_iso":
                continue
            rows[r[0]] = r
    return rows


def write_index_csv(code: str, rows: dict[str, list[str]]) -> None:
    path = INDICES_DIR / f"{code}.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(CSV_HEADER)
        for d in sorted(rows):
            w.writerow(rows[d])


def fmt_value(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".") or "0"


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Met a jour l'historique des indices depuis la cote live BRVM."
    )
    ap.add_argument(
        "--codes",
        nargs="*",
        default=list(DEFAULT_CODES),
        help=f"Codes a ecrire (defaut : {' '.join(DEFAULT_CODES)}). "
             f"'all' pour tous ceux presents sur la page.",
    )
    ap.add_argument("--dry-run", action="store_true", help="N'ecrit rien.")
    ap.add_argument(
        "--require-closed",
        action="store_true",
        help="Abandonne si la BRVM ne signale pas la seance comme fermee.",
    )
    ap.add_argument(
        "--date",
        help="Force la date de la ligne ecrite (AAAA-MM-JJ). Defaut : aujourd'hui UTC.",
    )
    args = ap.parse_args()

    try:
        r = requests.get(BRVM_URL, headers=HEADERS, timeout=45)
        r.raise_for_status()
    except requests.RequestException as e:
        print(f"Echec du fetch BRVM : {e}", file=sys.stderr)
        return 1

    html = r.text
    label, is_closed = parse_session(html)
    print(f"Seance BRVM : {label!r} | fermee={is_closed}")

    if args.require_closed and is_closed is not True:
        print(
            "Seance non signalee fermee — abandon (--require-closed).",
            file=sys.stderr,
        )
        return 2

    indices = parse_indices(html)
    if not indices:
        print("Aucun indice parse — page BRVM inattendue.", file=sys.stderr)
        return 1
    print(f"{len(indices)} indices lus sur la page.")

    if args.date:
        y, m, d = map(int, args.date.split("-"))
        target = date(y, m, d)
    else:
        target = datetime.now(timezone.utc).date()

    if target.weekday() >= 5:
        jour = "samedi" if target.weekday() == 5 else "dimanche"
        print(f"{target} est un {jour} — pas de seance, abandon.", file=sys.stderr)
        return 0

    codes = sorted(indices) if args.codes == ["all"] else args.codes
    changed = 0
    for code in codes:
        info = indices.get(code)
        if not info:
            print(f"  {code:9} absent de la page BRVM — CSV inchange.", file=sys.stderr)
            continue
        rows = read_index_csv(code)
        iso = target.isoformat()
        v = fmt_value(info["value"])
        previous = rows.get(iso)
        row = [iso, target.strftime("%d/%m/%Y"), v, v, v, v, "0"]
        action = "inchange"
        if previous is None:
            action = "ajoutee"
        elif previous[5] != v:
            action = f"corrigee ({previous[5]} -> {v})"
        rows[iso] = row

        ytd = ytd_from_history(code, info["value"], rows, target.year)
        ytd_txt = f"{ytd:+.2f} %" if ytd is not None else "n.d."
        day = info.get("dayPct")
        day_txt = f"{day:+.2f} %" if day is not None else "n.d."
        print(
            f"  {code:9} {iso} close={v} (jour {day_txt}, YTD {ytd_txt}) — {action}"
        )

        if action != "inchange":
            changed += 1
            if not args.dry_run:
                write_index_csv(code, rows)

    if args.dry_run:
        print("--dry-run : aucun fichier ecrit.")
    print(f"{changed} serie(s) modifiee(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

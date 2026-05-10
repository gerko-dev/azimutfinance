#!/usr/bin/env python3
"""
Scrape le Bulletin Officiel de la Cote (BOC) de la BRVM pour capter
les valeurs nominales courantes des obligations cotees.

URLs (par ordre de priorite) :
    1. https://bfin.brvm.org/boc/BOC_JOUR/BOC_YYYYMMDD.pdf
    2. https://bfin.brvm.org/boc/BOC_JOUR/BOC_YYYYMMDD_2.pdf

Le PDF contient une table "OBLIGATIONS CLASSIQUES" avec les colonnes :
    Symbole | Titre | Valeur nominale | Cours Precedent | Cours du jour | ...

On extrait le mapping `code mnemonique` -> `valeur nominale courante` et on
ecrit le resultat dans `data/obligations-cotees-vn-boc.csv` (audit).

Dependances :
    pip install requests pypdf

Usage :
    python scripts/scrape_brvm_boc.py            # date du jour (avec fallback j-1, j-2...)
    python scripts/scrape_brvm_boc.py 20260508   # date precise
    python scripts/scrape_brvm_boc.py --merge    # injecte les VN dans obligations-cotees.csv
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import sys
from datetime import date, timedelta
from pathlib import Path

import requests

try:
    import pypdf
except ImportError:
    print("Erreur : `pypdf` requis. `pip install pypdf`", file=sys.stderr)
    sys.exit(1)


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept": "application/pdf,*/*",
}

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
BONDS_CSV = DATA_DIR / "obligations-cotees.csv"
OUTPUT_CSV = DATA_DIR / "obligations-cotees-vn-boc.csv"

# Mnemonique BRVM (ex EOM.O10, BIDC.O7, SUKSN.S2, FCTC.O1, ...)
SYMBOL_RE = re.compile(r"\b([A-Z]{2,7}\.(?:O|S)\d{1,3})\b")
# Sequence de chiffres avec separateurs (espace simple, NBSP U+00A0, narrow NBSP U+202F).
NUM_RE = re.compile(r"\d{1,3}(?:[   ]\d{3})*(?:[.,]\d+)?")


def boc_url(d: date, fallback: bool) -> str:
    suffix = "_2" if fallback else ""
    return (
        f"https://bfin.brvm.org/boc/BOC_JOUR/BOC_{d.strftime('%Y%m%d')}{suffix}.pdf"
    )


def fetch_boc(d: date) -> bytes | None:
    """Tente l'URL primaire, puis fallback `_2`. Retourne None si rien dispo."""
    for fb in (False, True):
        url = boc_url(d, fb)
        try:
            r = requests.get(url, headers=HEADERS, timeout=30, verify=False)
        except requests.RequestException as e:
            print(f"  [{url}] erreur reseau : {e}", file=sys.stderr)
            continue
        if r.status_code == 200 and r.content[:4] == b"%PDF":
            print(f"  [{url}] OK ({len(r.content):,} octets)", file=sys.stderr)
            return r.content
        print(
            f"  [{url}] HTTP {r.status_code}, "
            f"{'pas un PDF' if r.status_code == 200 else 'absent'}",
            file=sys.stderr,
        )
    return None


def find_latest_boc(start: date, max_lookback: int = 10) -> tuple[date, bytes] | None:
    """Cherche le BOC le plus recent disponible (utile le matin / le week-end)."""
    for i in range(max_lookback):
        d = start - timedelta(days=i)
        # Skip weekends (samedi=5, dimanche=6) — pas de BOC publié.
        if d.weekday() >= 5:
            continue
        print(f"Tentative BOC du {d.isoformat()}...", file=sys.stderr)
        pdf = fetch_boc(d)
        if pdf is not None:
            return d, pdf
    return None


def parse_french_number(s: str) -> float | None:
    """'10 000' -> 10000.0, '9 795,50' -> 9795.5"""
    if not s:
        return None
    cleaned = re.sub(r"[   ]", "", s).replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_text(pdf_bytes: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(p.extract_text() or "" for p in reader.pages)


def extract_nominal_values(text: str) -> dict[str, float]:
    """
    Pour chaque mnemonique trouve dans le texte, extrait le premier nombre
    "rond" (>= 1000, sans decimales) qui suit, c'est la Valeur nominale.

    Le nombre suivant la VN est le "cours precedent" (peut etre identique).
    On evite les colonnes "Coupon couru" (decimales typiques) et "Volume"
    (souvent "NC" = Non Cote).
    """
    out: dict[str, float] = {}

    # Le PDF coupe parfois "ETAT DU SENEGAL 6,15 % 2023-\n2030\n    10 000 ..."
    # On nettoie en remplacant les retours a la ligne par des espaces, sauf
    # quand un nouveau mnemonique commence (= debut de nouvelle ligne).
    # Strategie : parcourir les positions des mnemoniques et capturer le
    # bloc entre deux mnemoniques.
    matches = list(SYMBOL_RE.finditer(text))
    if not matches:
        return out

    for i, m in enumerate(matches):
        sym = m.group(1)
        # Le PDF reaffiche les memes mnemoniques sur d'autres pages (sections
        # par echeance, coupons courus, etc.) avec une seule colonne tronquee
        # qui ferait piquer la mauvaise VN. On ne garde que la premiere
        # occurrence (table principale "OBLIGATIONS CLASSIQUES", page ~5).
        if sym in out:
            continue
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start:end]
        # Premier nombre dans le chunk qui ressemble a une VN (entier >= 1000).
        # Les VN sont des entiers entre 1000 et 100 000 typiquement. On evite
        # les coupons courus (decimales) et les petits nombres (volumes, durees).
        for nm in NUM_RE.finditer(chunk):
            val = parse_french_number(nm.group(0))
            if val is None:
                continue
            if 1000 <= val <= 100000 and val == int(val):
                out[sym] = val
                break

    return out


def write_output_csv(values: dict[str, float], boc_date: date) -> None:
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["code", "valeurNominale", "bocDate"])
        for sym in sorted(values):
            w.writerow([sym, int(values[sym]), boc_date.isoformat()])
    print(
        f"\n{len(values)} VN ecrites dans {OUTPUT_CSV.relative_to(ROOT)}",
        file=sys.stderr,
    )


def merge_into_bonds_csv(values: dict[str, float]) -> None:
    """Met a jour la colonne `nominalValue` du CSV obligations-cotees.csv pour
    chaque code present dans le BOC. Conserve les autres colonnes intactes."""
    if not BONDS_CSV.exists():
        print(f"Erreur : {BONDS_CSV} introuvable.", file=sys.stderr)
        return
    raw = BONDS_CSV.read_text(encoding="utf-8")
    if raw.startswith("﻿"):
        raw = raw[1:]
    lines = raw.splitlines()
    if not lines:
        return
    header = lines[0].split(";")
    try:
        code_idx = header.index("code")
        vn_idx = header.index("nominalValue")
    except ValueError as e:
        print(f"Erreur : colonne manquante dans le CSV : {e}", file=sys.stderr)
        return

    updated = 0
    out_lines = [lines[0]]
    for line in lines[1:]:
        if not line.strip():
            out_lines.append(line)
            continue
        cols = line.split(";")
        if len(cols) <= max(code_idx, vn_idx):
            out_lines.append(line)
            continue
        code = cols[code_idx].strip()
        if code in values:
            new_vn = str(int(values[code]))
            if cols[vn_idx] != new_vn:
                cols[vn_idx] = new_vn
                updated += 1
        out_lines.append(";".join(cols))

    BONDS_CSV.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    print(
        f"{updated} lignes mises a jour dans {BONDS_CSV.relative_to(ROOT)}",
        file=sys.stderr,
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument(
        "date",
        nargs="?",
        help="YYYYMMDD (ex: 20260508). Defaut : auto-detect dernier BOC dispo.",
    )
    ap.add_argument(
        "--merge",
        action="store_true",
        help="Injecte les VN dans data/obligations-cotees.csv (sinon ecrit juste le CSV d'audit).",
    )
    args = ap.parse_args()

    # Suppress urllib3 warning sur verify=False (BRVM SSL parfois problematique).
    requests.packages.urllib3.disable_warnings()  # type: ignore[attr-defined]

    if args.date:
        try:
            d = date(
                int(args.date[:4]), int(args.date[4:6]), int(args.date[6:8])
            )
        except (ValueError, IndexError):
            print(f"Date invalide : {args.date}", file=sys.stderr)
            return 1
        pdf = fetch_boc(d)
        if pdf is None:
            print("Aucun PDF trouve a cette date.", file=sys.stderr)
            return 1
        boc_date = d
    else:
        result = find_latest_boc(date.today())
        if result is None:
            print("Aucun BOC dispo dans les 10 derniers jours.", file=sys.stderr)
            return 1
        boc_date, pdf = result

    text = extract_text(pdf)
    values = extract_nominal_values(text)

    if not values:
        print("Aucune valeur nominale extraite (parsing echoue).", file=sys.stderr)
        return 1

    print(f"\n{len(values)} obligations parsees du BOC {boc_date.isoformat()} :")
    for sym in sorted(values):
        print(f"  {sym:<14} VN = {int(values[sym]):>7,}".replace(",", " "))

    write_output_csv(values, boc_date)
    if args.merge:
        merge_into_bonds_csv(values)

    return 0


if __name__ == "__main__":
    sys.exit(main())

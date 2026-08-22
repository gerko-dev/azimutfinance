#!/usr/bin/env python3
"""
Extrait les indices BRVM de la page 1 du Bulletin Officiel de la Cote (BOC)
et alimente data/historique_sika_indices/<CODE>.csv.

Raison d'etre : Sikafinance ne publie pas l'indice BRVM - SERVICES PUBLICS
(teste sous 10 variantes de ticker, toutes en `nodata`). Sa serie s'arretait
donc au 29/01/2025, et le YTD affiche sur /marches/actions etait calcule
contre une reference de janvier 2025 — soit +185,89 % au lieu du +168,89 %
publie par la BRVM. Le BOC, lui, donne la valeur de tous les indices chaque
seance.

Format de la ligne cible (page 1, blocs INDICES SECTORIELS / PAR COMPARTIMENT) :

    BRVM - SERVICES PUBLICS 2 284,75 -3,08 % 168,89 %  9 140  68 874 270 27,05
    <libelle> <nb societes> <valeur> <var jour %> <YTD %> <volume> <montant> <PER>

Deux pieges, tous deux traites ici :

  1. En 2025 le BOC contient DEUX lignes "BRVM - SERVICES PUBLICS" : l'ancien
     indice sectoriel (5 societes, base historique ~760) et le nouveau
     (2 societes, base 100 au 02/01/2025). On ne garde que la PREMIERE
     occurrence, qui est le nouvel indice, et on journalise `nb` pour audit.

  2. Au-dela du YTD, separateur de milliers et separateur de colonnes sont
     tous deux des espaces simples dans le texte extrait : volume, montant et
     PER ne sont pas decoupables de facon fiable sans extraction par
     coordonnees. On s'arrete donc au YTD. Le volume ecrit dans le CSV vaut 0,
     ce qui est deja la convention Sika pour les indices.

URLs (memes que scrape_brvm_boc.py) :
    1. https://bfin.brvm.org/boc/BOC_JOUR/BOC_YYYYMMDD.pdf
    2. https://bfin.brvm.org/boc/BOC_JOUR/BOC_YYYYMMDD_2.pdf

Dependances :
    pip install requests pypdf

Usage :
    # backfill d'une periode (seul BRVM-SP est ecrit par defaut)
    python scripts/scrape_boc_indices.py --from 2025-01-02 --to 2026-08-21

    # seance du jour, avec repli sur les jours precedents
    python scripts/scrape_boc_indices.py

    # controle : compare l'extraction aux CSV Sika existants, n'ecrit rien
    python scripts/scrape_boc_indices.py --from 2025-12-01 --to 2025-12-31 --check
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

import requests

try:
    import pypdf
except ImportError:
    print("Erreur : `pypdf` requis. `pip install pypdf`", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
INDICES_DIR = ROOT / "data" / "historique_sika_indices"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept": "application/pdf,*/*",
}
URL_TEMPLATES = (
    "https://bfin.brvm.org/boc/BOC_JOUR/BOC_{}.pdf",
    "https://bfin.brvm.org/boc/BOC_JOUR/BOC_{}_2.pdf",
)

# Libelle tel qu'il apparait dans le BOC -> code de fichier CSV
INDEX_CODES = {
    "BRVM - TELECOMMUNICATIONS": "BRVM-TEL",
    "BRVM - CONSOMMATION DISCRETIONNAIRE": "BRVM-CD",
    "BRVM - SERVICES FINANCIERS": "BRVM-SF",
    "BRVM - CONSOMMATION DE BASE": "BRVM-CB",
    "BRVM - INDUSTRIELS": "BRVM-IN",
    "BRVM - ENERGIE": "BRVM-EN",
    "BRVM - SERVICES PUBLICS": "BRVM-SP",
    "BRVM-PRESTIGE": "BRVMPR",
    "BRVM-PRINCIPAL": "BRVMPA",
}

# Indices reellement ecrits sur disque. Les autres sont deja couverts par
# scrape_sika_history.py ; on les extrait quand meme pour pouvoir controler
# l'extraction (--check).
DEFAULT_WRITE = ("BRVM-SP",)

SPACE = "[   ]"  # espace simple, insecable, insecable etroit
NUM = rf"\d{{1,3}}(?:{SPACE}\d{{3}})*"
HEAD_RE = re.compile(
    rf"^{SPACE}*(?P<nb>\d{{1,3}}){SPACE}+"
    rf"(?P<val>{NUM},\d+){SPACE}+"
    rf"(?P<var>-?{NUM},\d+){SPACE}*%{SPACE}+"
    rf"(?P<ytd>-?{NUM},\d+){SPACE}*%"
)


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def parse_fr_number(s: str) -> float:
    return float(re.sub(SPACE, "", s).replace(",", "."))


def fetch_boc(d: date, session: requests.Session) -> bytes | None:
    """Telecharge le BOC du jour d, en essayant l'URL principale puis _2."""
    stamp = d.strftime("%Y%m%d")
    for tpl in URL_TEMPLATES:
        try:
            r = session.get(tpl.format(stamp), headers=HEADERS, timeout=60)
        except requests.RequestException:
            continue
        if r.status_code == 200 and r.content[:4] == b"%PDF":
            return r.content
    return None


def parse_indices(pdf_bytes: bytes) -> dict[str, dict]:
    """{code: {nb, value, varPct, ytdPct}} depuis la page 1 du BOC."""
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    if not reader.pages:
        return {}
    text = reader.pages[0].extract_text() or ""

    out: dict[str, dict] = {}
    for raw in text.split("\n"):
        line = re.sub(r"\(\*+\)", " ", raw.replace("²", " ")).strip()
        norm = strip_accents(line).upper()
        for label, code in INDEX_CODES.items():
            if code in out:
                continue  # premiere occurrence uniquement (cf. docstring)
            if not norm.startswith(strip_accents(label).upper()):
                continue
            m = HEAD_RE.match(line[len(label):])
            if m:
                out[code] = {
                    "nb": int(m.group("nb")),
                    "value": parse_fr_number(m.group("val")),
                    "varPct": parse_fr_number(m.group("var")),
                    "ytdPct": parse_fr_number(m.group("ytd")),
                }
            break
    return out


# ── CSV ─────────────────────────────────────────────────────────────────────

CSV_HEADER = ["date_iso", "date_fr", "open", "high", "low", "close", "volume"]


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
    """Meme rendu que les CSV Sika : pas de zero decimal superflu."""
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return s or "0"


def upsert_index_rows(code: str, by_date: dict[date, dict]) -> tuple[int, int]:
    """Fusionne {date: {value, ...}} dans le CSV de `code`.

    Renvoie (lignes ajoutees, lignes corrigees). N'ecrit sur disque que si
    quelque chose change, pour ne pas produire de diff git inutile.
    """
    rows = read_index_csv(code)
    added = updated = 0
    for d, info in sorted(by_date.items()):
        iso = d.isoformat()
        v = fmt_value(info["value"])
        row = [iso, d.strftime("%d/%m/%Y"), v, v, v, v, "0"]
        if iso in rows:
            if rows[iso][5] != v:
                updated += 1
                rows[iso] = row
        else:
            added += 1
            rows[iso] = row
    if added or updated:
        write_index_csv(code, rows)
    return added, updated


def business_days(start: date, end: date):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Extrait les indices BRVM du BOC vers historique_sika_indices."
    )
    ap.add_argument("--from", dest="date_from", help="AAAA-MM-JJ")
    ap.add_argument("--to", dest="date_to", help="AAAA-MM-JJ")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument(
        "--write",
        nargs="*",
        default=list(DEFAULT_WRITE),
        help=f"Codes a ecrire (defaut : {' '.join(DEFAULT_WRITE)}). "
             f"'all' pour tous.",
    )
    ap.add_argument(
        "--check",
        action="store_true",
        help="N'ecrit rien ; compare l'extraction aux CSV existants.",
    )
    args = ap.parse_args()

    if args.date_from:
        y, m, d = map(int, args.date_from.split("-"))
        start = date(y, m, d)
        if args.date_to:
            y2, m2, d2 = map(int, args.date_to.split("-"))
            end = date(y2, m2, d2)
        else:
            end = start
    else:
        end = date.today()
        start = end - timedelta(days=7)

    targets = list(business_days(start, end))
    print(f"BOC indices : {len(targets)} jours ouvres du {start} au {end}")

    session = requests.Session()
    results: dict[date, dict] = {}

    def work(d: date):
        blob = fetch_boc(d, session)
        if blob is None:
            return d, None
        try:
            return d, parse_indices(blob)
        except Exception as e:  # PDF corrompu / illisible
            print(f"  {d} : parse KO ({type(e).__name__})", file=sys.stderr)
            return d, None

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(work, d): d for d in targets}
        done = 0
        for fut in as_completed(futs):
            d, idx = fut.result()
            done += 1
            if idx:
                results[d] = idx
            if done % 25 == 0:
                print(f"  ... {done}/{len(targets)} ({len(results)} BOC trouves)")

    print(f"BOC exploitables : {len(results)}/{len(targets)}")
    if not results:
        return

    # ── controle : compare aux CSV existants ────────────────────────────────
    if args.check:
        print("\nControle contre les CSV existants (aucune ecriture) :")
        for code in sorted(INDEX_CODES.values()):
            existing = read_index_csv(code)
            if not existing:
                print(f"  {code:9} pas de CSV local")
                continue
            same = diff = missing = 0
            worst = None
            for d, idx in results.items():
                if code not in idx:
                    continue
                iso = d.isoformat()
                if iso not in existing:
                    missing += 1
                    continue
                try:
                    ref = float(existing[iso][5])
                except (ValueError, IndexError):
                    continue
                got = idx[code]["value"]
                if abs(ref - got) < 0.011:
                    same += 1
                else:
                    diff += 1
                    gap = abs(ref - got)
                    if worst is None or gap > worst[1]:
                        worst = (iso, gap, ref, got)
            note = ""
            if worst:
                note = (f"  pire ecart {worst[0]} : CSV {worst[2]} vs BOC {worst[3]}")
            print(f"  {code:9} identiques {same:>4} | ecarts {diff:>3} | "
                  f"absents du CSV {missing:>4}{note}")
        return

    # ── ecriture ────────────────────────────────────────────────────────────
    codes = sorted(INDEX_CODES.values()) if args.write == ["all"] else args.write
    for code in codes:
        before = len(read_index_csv(code))
        by_date = {d: idx[code] for d, idx in results.items() if code in idx}
        nbs = sorted({info["nb"] for info in by_date.values()})
        added, updated = upsert_index_rows(code, by_date)
        print(
            f"  {code:9} {before:>4} -> {before + added:>4} lignes "
            f"(+{added} ajoutees, {updated} corrigees) "
            f"| nb societes vu : {nbs}"
        )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Enrichit les CSV scrapes avec la surface_m2 depuis les pages detail.

Le scraper de liste (scrape_immo.py) ne capture que ce qui est expose dans
les cards de recherche : titre, prix, chambres, quartier. La surface en m²
n'est presque jamais dans les cards Jiji et rarement dans CoinAfrique.

Ce script parcourt chaque annonce listee dans data/<source>-<type>.csv,
fetch sa page detail, et extrait la surface si elle est presente
(label "Superficie" + valeur numerique). Il recalcule aussi prix_m2_fcfa.

Usage :
  python scripts/enrich_immo.py                     # tout, polite
  python scripts/enrich_immo.py --limit 50          # 50 URL par fichier (test)
  python scripts/enrich_immo.py --source coinafrique --type location
  python scripts/enrich_immo.py --delay 2           # plus poli (2s entre URL)

Comportement :
  - Dedoublonne par URL au demarrage et reecrit le CSV dedoublonne.
  - Saute les lignes ou surface_m2 est deja remplie (=> resumable).
  - Sauvegarde tous les 50 traites (ecriture atomique via .tmp).
  - Continue meme si une URL echoue (juste un warning).
  - Bornes de plausibilite : 15 <= surface <= 100000 m².

Notes :
  - La regex est ancree sur le label "Superficie" qui est present sur Jiji
    et CoinAfrique. Aucun fallback regex large (trop risque, fausse les m2).
  - 9000+ URLs * 1.5s = ~3h45. Lance en background ou par lot avec --limit.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from pathlib import Path
from typing import Optional

# Permet d'importer utils en relatif
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from utils import fetch_page, log  # noqa: E402

ROOT = SCRIPT_DIR.parent
DATA_DIR = ROOT / "data"

# Regex ancree sur le label : tolerant aux separateurs (Superficie: 600 sqm,
# Superficie | 80 m², Superficie / 600 / sqm, etc.)
SURFACE_RE = re.compile(
    r"superficie[\s:|/·•—-]*?(\d{2,5})(?:[.,]\d+)?\s*(?:m[²2]|sqm|m\.?²?)?",
    re.IGNORECASE,
)

MIN_SURFACE = 15
MAX_SURFACE = 100_000

SAVE_EVERY = 50


def extract_surface(soup) -> Optional[int]:
    """Extrait surface_m2 depuis un BeautifulSoup de page detail."""
    if soup is None:
        return None
    text = soup.get_text(" ", strip=True)
    if not text:
        return None
    m = SURFACE_RE.search(text)
    if not m:
        return None
    try:
        v = int(m.group(1))
    except ValueError:
        return None
    if v < MIN_SURFACE or v > MAX_SURFACE:
        return None
    return v


def write_csv_atomic(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    tmp = path.with_suffix(".csv.tmp")
    with tmp.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
        w.writeheader()
        for r in rows:
            w.writerow(r)
    tmp.replace(path)


def enrich_csv(file: str, limit: Optional[int], delay: float) -> None:
    path = DATA_DIR / file
    if not path.exists():
        log.warning(f"{file} introuvable, skip.")
        return

    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        fieldnames = list(reader.fieldnames or [])
        if not fieldnames:
            log.warning(f"{file} : entete vide, skip.")
            return
        all_rows = list(reader)

    if not all_rows:
        log.info(f"  {file} : vide.")
        return

    # 1) Dedup par URL (garde la 1re occurrence)
    seen_urls: set[str] = set()
    deduped: list[dict] = []
    for r in all_rows:
        u = (r.get("url") or "").strip()
        if not u:
            # Pas d'URL : on ne peut pas dedupliquer ni enrichir, on garde tel quel
            deduped.append(r)
            continue
        if u in seen_urls:
            continue
        seen_urls.add(u)
        deduped.append(r)

    if len(deduped) < len(all_rows):
        log.info(f"  {len(all_rows) - len(deduped)} doublons retires ({len(all_rows)} -> {len(deduped)})")

    # 2) Identifier les lignes a enrichir
    to_enrich_idx: list[int] = []
    for i, r in enumerate(deduped):
        if not r.get("url"):
            continue
        if (r.get("surface_m2") or "").strip():
            continue  # deja enrichi
        to_enrich_idx.append(i)

    if not to_enrich_idx:
        log.info(f"  {file} : rien a enrichir (toutes les lignes ont deja une surface)")
        write_csv_atomic(path, fieldnames, deduped)
        return

    if limit is not None and limit > 0:
        to_enrich_idx = to_enrich_idx[:limit]

    log.info(f"  {len(to_enrich_idx)} URL a enrichir sur {len(deduped)} annonces (delay {delay}s)")

    n_success = 0
    n_done = 0
    for idx, row_i in enumerate(to_enrich_idx, 1):
        row = deduped[row_i]
        url = row.get("url", "")
        soup = fetch_page(url)
        surface = extract_surface(soup)
        if surface is not None:
            row["surface_m2"] = str(surface)
            # Recalcule prix_m2_fcfa si possible
            try:
                prix = int(row.get("prix_fcfa") or 0)
                if prix > 0 and surface > 0:
                    row["prix_m2_fcfa"] = str(int(round(prix / surface)))
            except (ValueError, TypeError):
                pass
            n_success += 1
        n_done += 1

        if idx % 10 == 0 or idx == len(to_enrich_idx):
            pct_succ = (n_success / max(1, n_done)) * 100
            log.info(
                f"    {idx}/{len(to_enrich_idx)} traitees · {n_success} surfaces trouvees ({pct_succ:.0f}%)"
            )
        if idx % SAVE_EVERY == 0:
            write_csv_atomic(path, fieldnames, deduped)
            log.info(f"    [save] CSV mis a jour ({idx} traitees)")

        if idx < len(to_enrich_idx):
            time.sleep(delay)

    write_csv_atomic(path, fieldnames, deduped)
    log.info(f"  {file} : {n_success}/{n_done} surfaces ajoutees · CSV ecrit.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrichit les CSV en allant chercher la surface_m2 sur la page detail de chaque annonce."
    )
    parser.add_argument(
        "--source", choices=["jiji", "coinafrique", "all"], default="all",
    )
    parser.add_argument(
        "--type", choices=["achat", "location", "both"], default="both",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Nb max d'URL a enrichir par fichier (utile pour test).",
    )
    parser.add_argument(
        "--delay", type=float, default=1.5,
        help="Pause (s) entre 2 requetes (defaut 1.5).",
    )
    args = parser.parse_args()

    sources = ["jiji", "coinafrique"] if args.source == "all" else [args.source]
    types = ["achat", "location"] if args.type == "both" else [args.type]

    for src in sources:
        for t in types:
            file = f"{src}-{t}.csv"
            log.info(f"=== {file} ===")
            enrich_csv(file, limit=args.limit, delay=args.delay)
    return 0


if __name__ == "__main__":
    sys.exit(main())

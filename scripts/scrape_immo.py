#!/usr/bin/env python3
"""Orchestrateur : lance Jiji + CoinAfrique en achat + location -> 4 CSV.

Usage :
  python scripts/scrape_immo.py                     # tout, 5 pages par source
  python scripts/scrape_immo.py --max-pages 10
  python scripts/scrape_immo.py --source jiji --type achat
  python scripts/scrape_immo.py --delay 3           # pause entre pages

Sortie (separateur ; encoding utf-8) :
  data/jiji-achat.csv
  data/jiji-location.csv
  data/coinafrique-achat.csv
  data/coinafrique-location.csv

Colonnes :
  source ; transaction ; type_bien ; titre ; prix_fcfa ; surface_m2 ;
  prix_m2_fcfa ; chambres ; quartier ; sous_quartier ; standing ; url ;
  scraped_at
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Permet d'importer utils / jiji / coinafrique en relatif quand on lance via
# `python scripts/scrape_immo.py` depuis la racine du projet.
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from coinafrique import scraper_coinafrique_categorie  # noqa: E402
from jiji import scraper_jiji_categorie  # noqa: E402
from utils import log  # noqa: E402

ROOT = SCRIPT_DIR.parent
DATA_DIR = ROOT / "data"

JIJI_SALE_URL = "https://jiji.co.ci/houses-apartments-for-sale"
JIJI_RENT_URL = "https://jiji.co.ci/houses-apartments-for-rent"
COINAFRIQUE_IMMO_URL = "https://ci.coinafrique.com/categorie/immobilier"

CSV_FIELDS = [
    "source",
    "transaction",
    "type_bien",
    "titre",
    "prix_fcfa",
    "surface_m2",
    "prix_m2_fcfa",
    "chambres",
    "quartier",
    "sous_quartier",
    "standing",
    "url",
    "scraped_at",
]


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        log.warning(f"Aucune annonce a ecrire dans {path.name}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS, delimiter=";")
        w.writeheader()
        for r in rows:
            full = {**r, "scraped_at": now}
            w.writerow({k: full.get(k, "") for k in CSV_FIELDS})
    log.info(f"  -> {len(rows)} annonces ecrites dans {path.relative_to(ROOT)}")


def collect_with_delay(iterator, delay: float) -> list[dict]:
    """Materialise un iterator de scraping en list, avec une pause entre les pages."""
    # La pause est appliquee par le scraper lui-meme (entre fetch_page),
    # mais on en ajoute une pour la transition entre 2 sources si besoin.
    rows = list(iterator)
    if delay > 0:
        time.sleep(delay)
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scrape Jiji.co.ci + CoinAfrique CI -> CSV pour la page Immobilier."
    )
    parser.add_argument(
        "--source", choices=["jiji", "coinafrique", "all"], default="all",
        help="Source a scraper (defaut : all)",
    )
    parser.add_argument(
        "--type", choices=["achat", "location", "both"], default="both",
        help="Type d'annonces (defaut : both)",
    )
    parser.add_argument(
        "--max-pages", type=int, default=5,
        help="Nb max de pages par source/type (defaut 5)",
    )
    parser.add_argument(
        "--delay", type=float, default=1.5,
        help="Pause (s) entre 2 jobs source/type (defaut 1.5)",
    )
    parser.add_argument(
        "--out-dir", type=Path, default=DATA_DIR,
        help=f"Repertoire de sortie (defaut {DATA_DIR})",
    )
    args = parser.parse_args()

    sources = ["jiji", "coinafrique"] if args.source == "all" else [args.source]
    types = ["achat", "location"] if args.type == "both" else [args.type]

    log.info(f"Sortie : {args.out_dir.resolve()}")
    log.info(f"Sources : {sources} | Types : {types} | max-pages : {args.max_pages}")

    total = 0
    for source in sources:
        for t in types:
            log.info(f"=== {source.upper()} / {t.upper()} ===")
            if source == "jiji":
                url = JIJI_SALE_URL if t == "achat" else JIJI_RENT_URL
                rows = collect_with_delay(
                    scraper_jiji_categorie(url, args.max_pages, t),
                    args.delay,
                )
            else:
                rows = collect_with_delay(
                    scraper_coinafrique_categorie(
                        COINAFRIQUE_IMMO_URL, args.max_pages, t
                    ),
                    args.delay,
                )
            out = args.out_dir / f"{source}-{t}.csv"
            write_csv(out, rows)
            total += len(rows)

    log.info(f"Termine : {total} annonces total sur {len(sources) * len(types)} fichier(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Scraper Expat-Dakar — annonces immobilières Sénégal.

Source : https://www.expat-dakar.com/immobilier (455 pages, ~4 545 annonces).

Structure : chaque carte est un `<div class="listing-card">` contenant un
`<a class="listing-card__inner">` qui porte TOUTES les métadonnées en
`data-t-listing_*` attributes (price, category_slug, location_title, title,
slug, id, currency). C'est de la donnée structurée propre — pas besoin de
regex sur du texte.

Sortie : data/expat-dakar.csv (format harmonisé avec coinafrique/seloger).

Usage :
  python scripts/scrape_expatdakar.py                 # tout (jusqu'à --max-pages)
  python scripts/scrape_expatdakar.py --max-pages 5   # probe
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from utils import (  # noqa: E402
    calculer_prix_m2,
    fetch_page,
    log,
    parse_chambres,
    parse_surface,
)

ROOT = SCRIPT_DIR.parent
DATA_DIR = ROOT / "data"
OUT_CSV = DATA_DIR / "expat-dakar.csv"

BASE = "https://www.expat-dakar.com"
LIST_URL = f"{BASE}/immobilier"

# category_slug → (type_bien normalisé, transaction)
# Couvre les slugs effectivement servis par Expat-Dakar. Inconnu → fallback heuristique.
CATEGORY_MAP: dict[str, tuple[str, str]] = {
    "appartements-a-louer":          ("appartement", "location"),
    "appartements-a-vendre":         ("appartement", "achat"),
    "appartements-meubles":          ("appartement", "location"),  # meublés → toujours location
    "chambres-a-louer":              ("studio",      "location"),
    "maisons-a-louer":               ("maison",      "location"),
    "maisons-a-vendre":              ("maison",      "achat"),
    "villas-a-louer":                ("villa",       "location"),
    "villas-a-vendre":               ("villa",       "achat"),
    "terrains-a-vendre":             ("terrain",     "achat"),
    "terrains-a-louer":              ("terrain",     "location"),
    "bureaux-commerces-a-louer":     ("commercial",  "location"),
    "bureaux-commerces-a-vendre":    ("commercial",  "achat"),
    "bureaux-a-louer":               ("commercial",  "location"),
    "bureaux-a-vendre":              ("commercial",  "achat"),
    "commerces-a-louer":             ("commercial",  "location"),
    "commerces-a-vendre":            ("commercial",  "achat"),
    "magasins-a-louer":              ("commercial",  "location"),
    "magasins-a-vendre":             ("commercial",  "achat"),
    "immeubles-a-vendre":            ("immeuble",    "achat"),
    "immeubles-a-louer":             ("immeuble",    "location"),
}


def classify_from_slug(slug: str) -> tuple[str, str]:
    """Renvoie (type_bien, transaction). Fallback : heuristiques."""
    if not slug:
        return "", ""
    if slug in CATEGORY_MAP:
        return CATEGORY_MAP[slug]
    # Heuristique fallback
    s = slug.lower()
    transaction = ""
    if "a-louer" in s or "louer" in s:
        transaction = "location"
    elif "a-vendre" in s or "vendre" in s:
        transaction = "achat"
    type_bien = ""
    if "appartement" in s:
        type_bien = "appartement"
    elif "chambre" in s:
        type_bien = "studio"
    elif "villa" in s or "duplex" in s:
        type_bien = "villa"
    elif "maison" in s:
        type_bien = "maison"
    elif "terrain" in s:
        type_bien = "terrain"
    elif "bureau" in s or "commerc" in s or "magasin" in s or "boutique" in s:
        type_bien = "commercial"
    elif "immeuble" in s:
        type_bien = "immeuble"
    return type_bien, transaction


CSV_FIELDS = [
    "country",
    "country_label",
    "source",
    "transaction",
    "type_bien",
    "subcategory",
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


_WS_RE = re.compile(r"\s+", re.UNICODE)


def _norm_ws(s: str) -> str:
    return _WS_RE.sub(" ", s or "").strip()


def _parse_price(raw: str) -> Optional[int]:
    """Le data-attr renvoie '800000.00' ou '20000' (string décimal)."""
    if not raw:
        return None
    try:
        v = int(round(float(raw)))
    except (ValueError, TypeError):
        return None
    if v < 30_000 or v > 5_000_000_000:
        return None
    return v


def extraire_card(card) -> Optional[dict]:
    try:
        a = card.select_one(".listing-card__inner")
        if a is None:
            return None
        href = str(a.get("href") or "").split("?")[0]
        if not href:
            return None
        url = urljoin(BASE, href)

        titre = _norm_ws(a.get("data-t-listing_title", ""))
        slug = (a.get("data-t-listing_category_slug") or "").lower()
        cat_title = a.get("data-t-listing_category_title", "") or ""
        location = _norm_ws(a.get("data-t-listing_location_title", ""))
        prix = _parse_price(a.get("data-t-listing_price", ""))

        type_bien, transaction = classify_from_slug(slug)

        if not prix or not transaction:
            return None
        if not titre and not location:
            return None

        # Surface / chambres extraites depuis le titre (les data-attrs ne les
        # exposent pas). Ces deux champs auront un taux de remplissage modeste.
        surface = parse_surface(titre)
        chambres = parse_chambres(titre)
        prix_m2 = calculer_prix_m2(prix, surface)

        return {
            "country": "SN",
            "country_label": "Sénégal",
            "source": "expat-dakar",
            "transaction": transaction,
            "type_bien": type_bien,
            "subcategory": slug or cat_title.lower(),
            "titre": titre[:200],
            "prix_fcfa": prix,
            "surface_m2": surface,
            "prix_m2_fcfa": prix_m2,
            "chambres": chambres,
            "quartier": location,
            "sous_quartier": "",
            "standing": "",
            "url": url,
        }
    except Exception as e:
        log.error(f"[EXPAT-DAKAR] Erreur extraction carte : {e}")
        return None


def scrape_page(page_num: int) -> list[dict]:
    url = LIST_URL if page_num == 1 else f"{LIST_URL}?page={page_num}"
    soup = fetch_page(url)
    if soup is None:
        return []
    cards = soup.select(".listing-card")
    if not cards:
        return []
    rows: list[dict] = []
    for c in cards:
        data = extraire_card(c)
        if data is not None:
            rows.append(data)
    return rows


def scrape(max_pages: int, delay: float) -> list[dict]:
    all_rows: list[dict] = []
    empty_streak = 0
    for p in range(1, max_pages + 1):
        rows = scrape_page(p)
        if not rows:
            empty_streak += 1
            log.info(f"[EXPAT-DAKAR] page {p} : 0 annonce ({empty_streak} consec.)")
            if empty_streak >= 2:
                log.info(f"[EXPAT-DAKAR] 2 pages vides consécutives, fin")
                break
        else:
            empty_streak = 0
            all_rows.extend(rows)
            log.info(f"[EXPAT-DAKAR] page {p} : {len(rows)} retenues (cumul {len(all_rows)})")
        time.sleep(delay)
    return all_rows


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        log.warning(f"Aucune ligne a ecrire dans {path.name}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS, delimiter=";")
        w.writeheader()
        for r in rows:
            full = {**r, "scraped_at": now}
            w.writerow({k: full.get(k, "") for k in CSV_FIELDS})
    log.info(f"-> {len(rows)} annonces ecrites dans {path.relative_to(ROOT)}")


def main() -> int:
    p = argparse.ArgumentParser(description="Scrape Expat-Dakar (annonces immo Sénégal).")
    p.add_argument(
        "--max-pages", type=int, default=500,
        help="Nb max de pages (defaut 500, plafonne large).",
    )
    p.add_argument(
        "--delay", type=float, default=0.8,
        help="Pause (s) entre deux pages (defaut 0.8).",
    )
    args = p.parse_args()

    log.info(f"Expat-Dakar — max-pages={args.max_pages} delay={args.delay}")
    rows = scrape(args.max_pages, args.delay)

    # Dedup par URL (annonces sponsorisées peuvent réapparaître)
    seen: set[str] = set()
    dedup: list[dict] = []
    for r in rows:
        key = r.get("url") or f"{r.get('titre')}|{r.get('prix_fcfa')}"
        if key in seen:
            continue
        seen.add(key)
        dedup.append(r)

    log.info(f"Total apres dedup : {len(dedup)} ({len(rows) - len(dedup)} doublons)")
    write_csv(OUT_CSV, dedup)
    return 0


if __name__ == "__main__":
    sys.exit(main())

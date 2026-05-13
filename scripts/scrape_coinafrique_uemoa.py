"""Scraper CoinAfrique multi-pays UEMOA — annonces immobilières par sous-catégorie.

Source : https://[cc].coinafrique.com/categorie/[subcat]
Pays UEMOA couverts (7/8 — Guinée-Bissau absente de CoinAfrique) :
  bj (Bénin), bf (Burkina Faso), ci (Côte d'Ivoire), ml (Mali),
  ne (Niger), sn (Sénégal), tg (Togo)

CoinAfrique fournit des sous-catégories propres :
  - logements : appartements, appartements-meubles, villas, chambres,
    maisons-de-vacances
  - terrains : terrains, terrains-agricoles
  - bureaux + magasins : bureaux-et-commerces (départagé via le titre cote TS)

Pour chaque (pays, sous-catégorie), on scrape les pages paginées et on
classe achat/location depuis le titre.

Sortie : data/coinafrique-uemoa.csv (toutes lignes mergées, avec colonne pays).

Usage :
  python scripts/scrape_coinafrique_uemoa.py                       # tout
  python scripts/scrape_coinafrique_uemoa.py --countries ci sn     # subset pays
  python scripts/scrape_coinafrique_uemoa.py --max-pages 10
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

# Permet d'importer utils / coinafrique en relatif
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from coinafrique import (  # noqa: E402
    PRIX_RE,
    classer_transaction,
)
from utils import (  # noqa: E402
    calculer_prix_m2,
    detecter_quartier,
    detecter_sous_quartier,
    detecter_standing,
    detecter_type_bien,
    fetch_page,
    get_href,
    log,
    parse_chambres,
    parse_prix,
    parse_surface,
)

ROOT = SCRIPT_DIR.parent
DATA_DIR = ROOT / "data"
OUT_CSV = DATA_DIR / "coinafrique-uemoa.csv"

# 7 pays UEMOA disponibles sur CoinAfrique (GW = Guinée-Bissau absente).
UEMOA_COUNTRIES: dict[str, str] = {
    "bj": "Bénin",
    "bf": "Burkina Faso",
    "ci": "Côte d'Ivoire",
    "ml": "Mali",
    "ne": "Niger",
    "sn": "Sénégal",
    "tg": "Togo",
}

# Sous-catégories CoinAfrique + type_bien normalisé (compatible classifyBien TS).
SUBCATEGORIES: list[tuple[str, str]] = [
    # (slug-coinafrique, type_bien-normalisé)
    ("appartements", "appartement"),
    ("appartements-meubles", "appartement"),
    ("villas", "villa"),
    ("maisons-de-vacances", "maison"),
    ("chambres", "studio"),
    ("bureaux-et-commerces", "commercial"),
    ("terrains", "terrain"),
    ("terrains-agricoles", "terrain"),
]

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
    """Collapse newlines/tabs/multiple spaces to a single space."""
    return _WS_RE.sub(" ", s).strip()


def base_url(country_code: str) -> str:
    return f"https://{country_code}.coinafrique.com"


def extraire_annonce(annonce, country_code: str, type_bien_default: str) -> Optional[dict]:
    """Extrait une annonce ; détecte la transaction (achat/location) depuis le titre."""
    try:
        href = get_href(annonce)
        if not href:
            return None
        url_annonce = urljoin(base_url(country_code), href.split("?")[0])

        # Remonter de 2 niveaux pour englober prix/location éventuellement hors anchor
        card = annonce
        for _ in range(2):
            p = getattr(card, "parent", None)
            if p is None:
                break
            card = p
        card_text = card.get_text(" ", strip=True) if hasattr(card, "get_text") else ""

        # Titre
        titre_tag = (
            annonce.select_one("[class*='card-description']")
            or annonce.select_one(".ad__card-description")
            or annonce.select_one("p")
            or annonce.select_one("h3")
        )
        titre = titre_tag.get_text(" ", strip=True) if titre_tag else ""
        if not titre:
            img = annonce.find("img")
            if img and img.get("alt"):
                titre = str(img["alt"]).strip()
        if not titre:
            titre = (annonce.get_text(" ", strip=True) or card_text)[:200]
        titre = _norm_ws(titre)[:200]

        # Prix
        prix_tag = (
            annonce.select_one("[class*='card-price']")
            or annonce.select_one(".ad__card-price")
        )
        prix_texte = prix_tag.get_text(" ", strip=True) if prix_tag else ""
        if not prix_texte:
            m = PRIX_RE.search(card_text)
            prix_texte = m.group(0).strip() if m else ""
        prix = parse_prix(prix_texte)

        # Localisation
        loc_tag = (
            annonce.select_one("[class*='card-location']")
            or annonce.select_one(".ad__card-location")
        )
        location_brute = loc_tag.get_text(" ", strip=True) if loc_tag else ""

        # Classification transaction : 'achat' / 'location' / None
        texte_classification = f"{titre} | {prix_texte} | {card_text}"
        transaction = classer_transaction(texte_classification)
        if transaction is None:
            # Heuristique de secours : si terrain → généralement achat
            if type_bien_default == "terrain":
                transaction = "achat"
            else:
                return None

        # Détections
        texte_complet = f"{titre} {location_brute} {card_text}"
        surface = parse_surface(card_text) or parse_surface(titre)
        chambres = parse_chambres(card_text) or parse_chambres(titre)
        # Note : detecter_quartier est calibré Abidjan ; pour les autres pays
        # la valeur restera souvent vide. Fallback sur location_brute.
        quartier = detecter_quartier(texte_complet) or _extract_city(location_brute)
        sous_quartier = detecter_sous_quartier(texte_complet, quartier)
        standing = detecter_standing(texte_complet)
        # Préférer le type_bien de la sous-catégorie (plus fiable) ; fallback détecteur
        type_bien = type_bien_default or detecter_type_bien(texte_complet)
        prix_m2 = calculer_prix_m2(prix, surface)

        # Garde-fous : on retient si on a au moins (prix) + (surface ou quartier)
        if not prix or (not surface and not quartier):
            return None

        return {
            "transaction": transaction,
            "type_bien": type_bien,
            "titre": titre,
            "prix_fcfa": prix,
            "surface_m2": surface,
            "prix_m2_fcfa": prix_m2,
            "chambres": chambres,
            "quartier": quartier or "",
            "sous_quartier": sous_quartier or "",
            "standing": standing or "",
            "url": url_annonce,
        }
    except Exception as e:
        log.error(f"[CN-{country_code}] Erreur extraction : {e}")
        return None


def _extract_city(location_brute: str) -> str:
    """Extrait une ville/quartier depuis 'Quartier, Ville' format CoinAfrique."""
    if not location_brute:
        return ""
    parts = [p.strip() for p in location_brute.split(",") if p.strip()]
    if not parts:
        return ""
    # Premier élément = quartier (ou ville si pas de virgule)
    return parts[0]


def scraper_pays_subcategory(
    country_code: str, subcategory: str, type_bien_default: str, max_pages: int,
) -> list[dict]:
    """Scrape /categorie/<subcategory> sur le sous-domaine pays."""
    base = base_url(country_code)
    url_cat = f"{base}/categorie/{subcategory}"
    log.info(f"[CN-{country_code}] /{subcategory}")

    rows: list[dict] = []
    for page in range(1, max_pages + 1):
        url = url_cat if page == 1 else f"{url_cat}?page={page}"
        soup = fetch_page(url)
        if soup is None:
            log.warning(f"[CN-{country_code}]   page {page} non recuperee, stop")
            break

        annonces = (
            soup.select('a[class*="card-general"]')
            or soup.select('a[href*="/annonce/"]')
        )
        if not annonces:
            log.info(f"[CN-{country_code}]   page {page} : 0 annonce, stop")
            break

        n_before = len(rows)
        for a in annonces:
            data = extraire_annonce(a, country_code, type_bien_default)
            if data is None:
                continue
            data["country"] = country_code.upper()
            data["country_label"] = UEMOA_COUNTRIES[country_code]
            data["source"] = "coinafrique"
            data["subcategory"] = subcategory
            rows.append(data)

        new_rows = len(rows) - n_before
        log.info(f"[CN-{country_code}]   page {page} : {new_rows} retenues")
        if new_rows == 0 and page > 1:
            log.info(f"[CN-{country_code}]   plus rien, stop")
            break

    return rows


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
    p = argparse.ArgumentParser(
        description="Scrape CoinAfrique multi-pays UEMOA / sous-catégories.",
    )
    p.add_argument(
        "--countries", nargs="*",
        default=list(UEMOA_COUNTRIES.keys()),
        help="Codes pays UEMOA à scraper (defaut : tous les pays dispo).",
    )
    p.add_argument(
        "--max-pages", type=int, default=5,
        help="Nb max de pages par (pays, sous-catégorie). Defaut 5.",
    )
    p.add_argument(
        "--delay", type=float, default=1.0,
        help="Pause (s) entre deux sous-catégories. Defaut 1.0.",
    )
    args = p.parse_args()

    countries = [c.lower() for c in args.countries if c.lower() in UEMOA_COUNTRIES]
    if not countries:
        log.error("Aucun pays valide. Choix : " + " ".join(UEMOA_COUNTRIES))
        return 2

    log.info(f"Pays : {' '.join(countries)} | max-pages : {args.max_pages}")

    all_rows: list[dict] = []
    for cc in countries:
        log.info(f"=== {cc.upper()} ({UEMOA_COUNTRIES[cc]}) ===")
        for subcat, tb in SUBCATEGORIES:
            rows = scraper_pays_subcategory(cc, subcat, tb, args.max_pages)
            all_rows.extend(rows)
            time.sleep(args.delay)

    # Dedup global (url) — une URL peut apparaître dans plusieurs sous-catégories
    seen: set[str] = set()
    dedup: list[dict] = []
    for r in all_rows:
        key = r.get("url") or f"{r.get('country')}|{r.get('titre')}|{r.get('subcategory')}"
        if key in seen:
            continue
        seen.add(key)
        dedup.append(r)

    log.info(f"\nTotal apres dedup : {len(dedup)} annonces ({len(all_rows) - len(dedup)} doublons)")
    write_csv(OUT_CSV, dedup)
    return 0


if __name__ == "__main__":
    sys.exit(main())

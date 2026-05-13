"""Scraper SeLogerAuMali — annonces immobilières Mali, archive complète.

Source : https://selogeraumali.com/annonces-immobilieres/page/N/
~1 877 annonces sur ~188 pages au 2026-05.

Structure HTML (WordPress + plugin ERE Realestate, statique server-side) :
  .ere-item-wrap                  : carte
    .property-title a             : titre + href
    .property-price               : prix (ex. "1.300.000 Fcfa", "250 Mille Fcfa / mois")
    .property-price-postfix       : "/ Par mois" / "/ mois" → indice location
    .property-location a span     : ville ou quartier (ex. "ACI 2000", "Kati Fouga")
    .property-type-list a         : "Appartements" / "Maisons" / "Villas" /
                                    "Bureaux" / "Immeubles" / "Duplexes" / "Terrains"
    .ere__lpb-status .ere__term-status  : "Location" ou "Vente" (badge structuré)
    .property-excerpt p           : description complète

Surface : non visible sur les cards. Tentative regex dans titre + extrait.
Pages détail : non scrapées (volume × fragile × surface non structurée non plus).

Sortie : data/selogeraumali.csv, format identique à coinafrique-uemoa.csv pour
pouvoir être lu par le même parseur côté lib/immobilier.ts.

Usage :
  python scripts/scrape_selogeraumali.py                # tout (188 pages)
  python scripts/scrape_selogeraumali.py --max-pages 5  # probe
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
OUT_CSV = DATA_DIR / "selogeraumali.csv"

BASE = "https://selogeraumali.com"
LIST_URL = f"{BASE}/annonces-immobilieres"

# Mapping libellé plugin ERE → type_bien normalisé (aligné avec classifyBien TS)
TYPE_BIEN_MAP = {
    "appartement": "appartement",
    "appartements": "appartement",
    "maison": "maison",
    "maisons": "maison",
    "villa": "villa",
    "villas": "villa",
    "duplex": "villa",
    "duplexes": "villa",
    "studio": "studio",
    "chambre": "studio",
    "chambres": "studio",
    "immeuble": "immeuble",
    "immeubles": "immeuble",
    "bureau": "commercial",
    "bureaux": "commercial",
    "magasin": "commercial",
    "boutique": "commercial",
    "terrain": "terrain",
    "terrains": "terrain",
}

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


# =============================================================================
# Parser prix spécifique : gère "Mille" / "Million(s)" verbal + format standard
# =============================================================================

_NUM_RE = re.compile(r"(\d[\d\s.,]*)", re.UNICODE)

def parse_prix_seloger(text: str) -> Optional[int]:
    """Parse '1.300.000 Fcfa', '250 Mille Fcfa', '1.5 Millions Fcfa' → int FCFA.

    Gère :
      - séparateurs '.', ' ', '\\xa0' comme milliers (style FR : '1.300.000')
      - virgule décimale ('1,5 Million')
      - mots-clés 'Mille', 'Million(s)', 'Md', 'Milliard(s)'
    """
    if not text:
        return None
    s = text.replace("\xa0", " ").replace(" ", " ")
    low = s.lower()

    m = _NUM_RE.search(s)
    if not m:
        return None
    raw = m.group(1).strip()

    # Mots-clés multiplicateurs
    mult = 1
    if re.search(r"\bmilliards?\b|\bmd\b", low):
        mult = 1_000_000_000
    elif re.search(r"\bmillions?\b", low):
        mult = 1_000_000
    elif re.search(r"\bmille\b", low):
        mult = 1_000

    if mult > 1:
        # Cas "1,5 Millions" : 1.5 × 1_000_000
        num_s = raw.replace(" ", "").replace(".", "").replace(",", ".")
        try:
            v = float(num_s) * mult
        except ValueError:
            return None
    else:
        # Cas standard : "1.300.000" → 1_300_000 (séparateur milliers)
        digits = re.sub(r"[^\d]", "", raw)
        if not digits:
            return None
        try:
            v = int(digits)
        except ValueError:
            return None

    iv = int(round(v))
    # Bornes de plausibilité (du loader TS) : 30k à 5 Md
    if iv < 30_000 or iv > 5_000_000_000:
        return None
    return iv


# =============================================================================
# Extraction d'une carte
# =============================================================================

def classify_transaction(status_text: str, price_text: str) -> Optional[str]:
    """'Location' badge → location ; 'Vente' badge → achat. Fallback sur prix."""
    s = (status_text or "").strip().lower()
    if "location" in s or "louer" in s:
        return "location"
    if "vente" in s or "vendre" in s or "à vendre" in s:
        return "achat"
    # Fallback : si le prix contient "/ mois" c'est forcément location
    p = (price_text or "").lower()
    if "/ mois" in p or "par mois" in p or "/mois" in p:
        return "location"
    return None


def normalize_type_bien(label: str) -> str:
    """'Appartements' → 'appartement'. Retourne '' si inconnu.

    Gère aussi les labels composés ('villas duplex', 'local commercial')
    via match sur tokens : priorité au token le plus spécifique.
    """
    if not label:
        return ""
    key = label.strip().lower()
    if key in TYPE_BIEN_MAP:
        return TYPE_BIEN_MAP[key]
    # Composés : on teste token par token, et on gère quelques variantes
    tokens = re.split(r"\s+", key)
    for t in tokens:
        if t in TYPE_BIEN_MAP:
            return TYPE_BIEN_MAP[t]
    # Heuristiques labels libres non dans le map
    if "entrepot" in key or "hangar" in key:
        return "commercial"
    if "champ" in key or "agricole" in key:
        return "terrain"
    if "commerc" in key or "boutique" in key or "magasin" in key or "local" in key:
        return "commercial"
    if "résidence" in key or "residence" in key:
        return "appartement"
    return ""


def extraire_card(card) -> Optional[dict]:
    """Extrait une annonce depuis un .ere-item-wrap (ou wrapper équivalent)."""
    try:
        # Titre + URL
        title_a = card.select_one(".property-title a")
        if not title_a:
            return None
        titre = title_a.get_text(" ", strip=True)
        href = str(title_a.get("href") or "").split("?")[0]
        if not titre or not href:
            return None
        url = urljoin(BASE, href)

        # Prix (texte global de la balise prix, qui inclut le postfix)
        prix_tag = card.select_one(".property-price")
        prix_texte = prix_tag.get_text(" ", strip=True) if prix_tag else ""
        prix = parse_prix_seloger(prix_texte)

        # Statut (Location / Vente)
        status_tag = card.select_one(
            ".ere__lpb-status .ere__term-status, .property-status"
        )
        status_text = status_tag.get_text(" ", strip=True) if status_tag else ""

        transaction = classify_transaction(status_text, prix_texte)
        if transaction is None:
            return None

        # Localisation (texte du span, ex. "ACI 2000")
        loc_tag = card.select_one(".property-location a span, .property-location a")
        quartier = loc_tag.get_text(" ", strip=True) if loc_tag else ""

        # Type de bien (1er badge .property-type-list)
        type_tag = card.select_one(".property-type-list a")
        type_label = type_tag.get_text(" ", strip=True) if type_tag else ""
        type_bien = normalize_type_bien(type_label)

        # Cas "Bureaux"/"Magasins" : le label est "Bureaux" pour les deux,
        # le plugin ne distingue pas magasin/bureau finement. On garde "commercial"
        # et le classifyBien TS dispatche via le titre (regex "bureau" / "magasin").

        # Extrait pour surface / chambres
        excerpt_tag = card.select_one(".property-excerpt")
        excerpt = excerpt_tag.get_text(" ", strip=True) if excerpt_tag else ""
        full_text = f"{titre} {excerpt}"

        surface = parse_surface(full_text)
        chambres = parse_chambres(full_text)
        prix_m2 = calculer_prix_m2(prix, surface)

        # Garde-fou : on retient si prix valide ET (quartier ou type ou surface)
        if not prix:
            return None
        if not quartier and not type_bien and not surface:
            return None

        return {
            "country": "ML",
            "country_label": "Mali",
            "source": "selogeraumali",
            "transaction": transaction,
            "type_bien": type_bien,
            "subcategory": type_label.lower(),
            "titre": titre[:200],
            "prix_fcfa": prix,
            "surface_m2": surface,
            "prix_m2_fcfa": prix_m2,
            "chambres": chambres,
            "quartier": quartier,
            "sous_quartier": "",
            "standing": "",
            "url": url,
        }
    except Exception as e:
        log.error(f"[SELOGER] Erreur extraction carte : {e}")
        return None


# =============================================================================
# Boucle pagination
# =============================================================================

def scrape_page(page_num: int) -> list[dict]:
    url = LIST_URL if page_num == 1 else f"{LIST_URL}/page/{page_num}/"
    soup = fetch_page(url)
    if soup is None:
        return []
    cards = soup.select(".ere-item-wrap")
    if not cards:
        # Fallback : certains thèmes utilisent .property-inner directement
        cards = soup.select(".property-inner")
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
    for p in range(1, max_pages + 1):
        rows = scrape_page(p)
        if not rows:
            log.info(f"[SELOGER] page {p} : 0 annonce, fin")
            break
        all_rows.extend(rows)
        log.info(f"[SELOGER] page {p} : {len(rows)} retenues (cumul {len(all_rows)})")
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
    p = argparse.ArgumentParser(description="Scrape SeLogerAuMali (annonces Mali).")
    p.add_argument(
        "--max-pages", type=int, default=200,
        help="Nb max de pages (defaut 200, plafonne large pour tout récupérer).",
    )
    p.add_argument(
        "--delay", type=float, default=1.0,
        help="Pause (s) entre deux pages (defaut 1.0).",
    )
    args = p.parse_args()

    log.info(f"SeLogerAuMali — max-pages={args.max_pages} delay={args.delay}")
    rows = scrape(args.max_pages, args.delay)

    # Dedup par URL (les featured peuvent réapparaître entre pages)
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

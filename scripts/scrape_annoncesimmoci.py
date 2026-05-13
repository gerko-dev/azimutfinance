"""Scraper AnnoncesImmo-CI — annonces immobilières Côte d'Ivoire.

Source : https://www.annoncesimmo-ci.com/

3 listings paginés :
  - a-louer-location-annonce-recherche-immobiliere-immobilier-offre-cote-d-ivoire.html
  - a-vendre-vente-achat-acheter-annonce-recherche-immobiliere-immobilier-offre-cote-d-ivoire.html
  - a-louer-location-annonce-recherche-immobiliere-residence-meublee-immobilier-offre-cote-d-ivoire.html

Pagination : suffix `-N.html` (-2, -3, …). 30 annonces par page.

Structure carte : `.kf_property_listing_wrap` contenant figure img[alt], h5 a[href],
1er <p> = localisation, .kf_listing_total_price h4 = prix, ul li = pièces/chambres/m².

Transaction et type_bien sont déduits du slug d'URL (a-louer/a-vendre + type).

Sortie : data/annoncesimmo-ci.csv (format harmonisé).
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
)

ROOT = SCRIPT_DIR.parent
DATA_DIR = ROOT / "data"
OUT_CSV = DATA_DIR / "annoncesimmo-ci.csv"

BASE = "https://www.annoncesimmo-ci.com"

LISTINGS = [
    ("a-louer-location-annonce-recherche-immobiliere-immobilier-offre-cote-d-ivoire", "location"),
    ("a-vendre-vente-achat-acheter-annonce-recherche-immobiliere-immobilier-offre-cote-d-ivoire", "achat"),
    ("a-louer-location-annonce-recherche-immobiliere-residence-meublee-immobilier-offre-cote-d-ivoire", "location"),
]

CSV_FIELDS = [
    "country", "country_label", "source", "transaction", "type_bien",
    "subcategory", "titre", "prix_fcfa", "surface_m2", "prix_m2_fcfa",
    "chambres", "quartier", "sous_quartier", "standing", "url", "scraped_at",
]

_WS_RE = re.compile(r"\s+", re.UNICODE)
def _norm_ws(s: str) -> str:
    return _WS_RE.sub(" ", s or "").strip()

# Type bien depuis le slug d'URL : -offre-location-{TYPE}-... ou -offre-vente-{TYPE}-...
_TYPE_RE = re.compile(r"-offre-(?:location|vente|location-meublee)-([a-z-]+?)-[a-z]+(?:-[a-z]+)*-\d+\.html?$", re.IGNORECASE)
_ID_RE = re.compile(r"-(\d+)\.html?$")

TYPE_BIEN_FROM_SLUG = {
    "studio": "studio",
    "chambre": "studio",
    "appartement": "appartement",
    "maison-villa": "villa",
    "villa": "villa",
    "maison": "maison",
    "duplex": "villa",
    "terrain": "terrain",
    "cour-commune": "terrain",
    "magasin": "commercial",
    "atelier-magasin": "commercial",
    "atelier": "commercial",
    "bureau": "commercial",
    "boutique": "commercial",
    "immeuble": "immeuble",
}

# Compounds reconnus en tête de segment "milieu" du slug.
_TYPE_COMPOUNDS = (
    "maison-villa",
    "atelier-magasin",
    "cour-commune",
    "studio-meuble",
)


def classify_type_from_url(url: str) -> tuple[str, str]:
    """Renvoie (type_bien, subcategory_slug).

    Parse depuis l'URL : `-offre-{tx}-{type}[...]-{ville}-{quartier}-{ID}.html`.
    On extrait tout entre `offre-{tx}-` et l'ID final, puis on identifie le type
    en tête (compound prioritaire, sinon 1er token).
    """
    m = re.search(
        r"-offre-(?:location-meublee|location|vente)-(.+?)-\d+\.html?$",
        url.lower(),
    )
    if not m:
        return "", ""
    middle = m.group(1)
    for compound in _TYPE_COMPOUNDS:
        if middle.startswith(compound + "-") or middle == compound:
            return TYPE_BIEN_FROM_SLUG.get(compound, ""), compound
    first = middle.split("-")[0]
    return TYPE_BIEN_FROM_SLUG.get(first, ""), first


_NUM_RE = re.compile(r"(\d[\d\s.,  ]*)", re.UNICODE)

def parse_prix_fcfa(text: str) -> Optional[int]:
    """'150 000 FCFA' → 150000."""
    if not text:
        return None
    s = text.replace("\xa0", " ").replace(" ", " ")
    m = _NUM_RE.search(s)
    if not m:
        return None
    digits = re.sub(r"[^\d]", "", m.group(1))
    if not digits:
        return None
    try:
        v = int(digits)
    except ValueError:
        return None
    if v < 30_000 or v > 5_000_000_000:
        return None
    return v


def parse_li_int(text: str) -> Optional[int]:
    """Pour <li>1<br>chambres</li> ou similaire → 1."""
    if not text:
        return None
    m = re.search(r"\b(\d+)\b", text)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return None
    return None


def parse_li_surface(text: str) -> Optional[float]:
    """<li>0 m²</li> ou <li>120 m2</li> → 0.0 / 120.0. Filtre les 0 → None."""
    if not text:
        return None
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*m", text)
    if not m:
        return None
    try:
        v = float(m.group(1).replace(",", "."))
    except ValueError:
        return None
    if v <= 0 or v > 100_000:
        return None
    return v


def parse_quartier(loc_text: str) -> tuple[str, str]:
    """'Abidjan-Cocody-Riviera (PALMERAIE ST VIATEUR1)' → ('Abidjan-Cocody-Riviera', 'PALMERAIE ST VIATEUR1')."""
    s = _norm_ws(loc_text)
    sub = ""
    m = re.search(r"\(([^)]+)\)", s)
    if m:
        sub = m.group(1).strip()
        s = s[:m.start()].strip()
    return s, sub


def extraire_card(card, transaction_default: str) -> Optional[dict]:
    try:
        # Titre depuis img alt (plus complet que h5 a, qui a un <br>)
        img = card.select_one("figure img")
        alt = img.get("alt", "") if img else ""
        titre = _norm_ws(alt)

        # URL depuis 1er h5 a ou figcaption a
        link = card.select_one("h5 a[href]") or card.select_one("figcaption a[href]") or card.select_one("a[href]")
        if link is None:
            return None
        href = (link.get("href") or "").split("?")[0]
        if not href or not href.endswith(".html"):
            return None
        url = urljoin(BASE + "/", href)

        # Fallback titre depuis h5 si alt vide
        if not titre:
            h5 = card.select_one("h5 a")
            titre = _norm_ws(h5.get_text(" ", strip=True)) if h5 else ""
        if not titre:
            return None

        # Localisation : 1er <p> dans .kf_property_listing_des
        des = card.select_one(".kf_property_listing_des")
        loc_text = ""
        if des is not None:
            p_tags = des.select("p")
            if p_tags:
                loc_text = p_tags[0].get_text(" ", strip=True)
        quartier, sous_quartier = parse_quartier(loc_text)

        # Prix
        prix_tag = card.select_one(".kf_listing_total_price h4, .kf_listing_total_price")
        prix_text = prix_tag.get_text(" ", strip=True) if prix_tag else ""
        prix = parse_prix_fcfa(prix_text)

        # Specs : ul li × 4 : pieces, chambres, douches, surface
        chambres = None
        surface = None
        lis = card.select("ul li")
        if lis:
            # heuristique sur les libellés
            for li in lis:
                txt = li.get_text(" ", strip=True).lower()
                if "chambre" in txt:
                    chambres = parse_li_int(txt)
                elif "m" in txt and re.search(r"\d", txt):
                    s = parse_li_surface(txt)
                    if s is not None:
                        surface = s

        # Transaction : si la liste source est 'achat', on fixe ; sinon depuis l'URL
        url_low = url.lower()
        if "/a-vendre-" in url_low or "a-vendre-acheter" in url_low:
            transaction = "achat"
        elif "/a-louer-" in url_low or "a-louer-" in url_low:
            transaction = "location"
        else:
            transaction = transaction_default

        type_bien, sub = classify_type_from_url(url)
        prix_m2 = calculer_prix_m2(prix, surface)

        if not prix:
            return None
        if not quartier and not type_bien:
            return None

        return {
            "country": "CI",
            "country_label": "Côte d'Ivoire",
            "source": "annoncesimmo-ci",
            "transaction": transaction,
            "type_bien": type_bien,
            "subcategory": sub,
            "titre": titre[:200],
            "prix_fcfa": prix,
            "surface_m2": surface,
            "prix_m2_fcfa": prix_m2,
            "chambres": chambres,
            "quartier": quartier,
            "sous_quartier": sous_quartier,
            "standing": "",
            "url": url,
        }
    except Exception as e:
        log.error(f"[ANNONCESIMMOCI] Erreur extraction : {e}")
        return None


def scrape_listing(slug: str, transaction: str, max_pages: int, delay: float) -> list[dict]:
    """Itère pages 1..N en suivant le pattern -N.html."""
    rows: list[dict] = []
    empty_streak = 0
    for p in range(1, max_pages + 1):
        url = f"{BASE}/{slug}.html" if p == 1 else f"{BASE}/{slug}-{p}.html"
        soup = fetch_page(url)
        if soup is None:
            log.warning(f"[ANNONCESIMMOCI] page {p} de {slug[:40]} : FETCH FAIL")
            break
        cards = soup.select(".kf_property_listing_wrap")
        if not cards:
            empty_streak += 1
            log.info(f"[ANNONCESIMMOCI] {slug[:40]} p{p} : 0 carte ({empty_streak} consec.)")
            if empty_streak >= 1:
                break
        else:
            empty_streak = 0
            n_before = len(rows)
            for c in cards:
                data = extraire_card(c, transaction)
                if data is not None:
                    rows.append(data)
            log.info(f"[ANNONCESIMMOCI] {slug[:40]} p{p} : {len(rows) - n_before} retenues")
        time.sleep(delay)
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
    p = argparse.ArgumentParser(description="Scrape AnnoncesImmo-CI (Côte d'Ivoire).")
    p.add_argument("--max-pages", type=int, default=30, help="Max pages par listing (defaut 30).")
    p.add_argument("--delay", type=float, default=0.6, help="Pause entre pages (defaut 0.6s).")
    args = p.parse_args()

    log.info(f"AnnoncesImmo-CI — max-pages={args.max_pages} delay={args.delay}")
    all_rows: list[dict] = []
    for slug, tx in LISTINGS:
        log.info(f"=== Listing {tx} : {slug[:50]}… ===")
        rows = scrape_listing(slug, tx, args.max_pages, args.delay)
        all_rows.extend(rows)

    seen: set[str] = set()
    dedup: list[dict] = []
    for r in all_rows:
        key = r.get("url") or f"{r.get('titre')}|{r.get('prix_fcfa')}"
        if key in seen:
            continue
        seen.add(key)
        dedup.append(r)

    log.info(f"Total apres dedup : {len(dedup)} ({len(all_rows) - len(dedup)} doublons)")
    write_csv(OUT_CSV, dedup)
    return 0


if __name__ == "__main__":
    sys.exit(main())

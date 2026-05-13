"""Scraper Clefs du Faso — annonces immobilières Ouagadougou (Burkina Faso).

Source : https://clefsdufaso.com/

Listings :
  - /action/location/page/N/  (à louer)
  - /action/ventes/page/N/    (à vendre)

Structure carte : `.listing_wrapper.property_unit_type2` avec data-attrs sur le wrapper
+ infos texte dans `.property-unit-information-wrapper`.

  - data-modal-title           → titre
  - data-modal-link            → URL annonce
  - .listing_unit_price_wrapper → prix (ex "350.000Fcfa /mois")
  - .action_tag_wrapper        → "Location" / "Vente"
  - .listing_details (texte)   → description (pour surface heuristique)

Le quartier n'est pas dans le HTML de listing — on l'extrait du slug URL et du
titre/description. Type bien : heuristique sur titre + slug.

Sortie : data/clefsdufaso.csv
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
from urllib.parse import urljoin, urlparse

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
OUT_CSV = DATA_DIR / "clefsdufaso.csv"

BASE = "https://clefsdufaso.com"

LISTINGS = [
    ("/action/location/", "location"),
    ("/action/ventes/", "achat"),
]

CSV_FIELDS = [
    "country", "country_label", "source", "transaction", "type_bien",
    "subcategory", "titre", "prix_fcfa", "surface_m2", "prix_m2_fcfa",
    "chambres", "quartier", "sous_quartier", "standing", "url", "scraped_at",
]

_WS_RE = re.compile(r"\s+", re.UNICODE)
def _norm_ws(s: str) -> str:
    return _WS_RE.sub(" ", s or "").strip()


# Quartiers connus de Ouagadougou (le slug URL contient souvent un mot-clé du quartier)
QUARTIERS_OUAGA = [
    "ouaga-2000", "ouaga 2000", "ouaga2000",
    "zone-du-bois", "zone du bois", "zad",
    "extension-sud", "extension sud",
    "nioko", "nioko-1", "nioko-2",
    "tanghin", "tanghin-dassouri",
    "pissy", "patte-d-oie", "patte d'oie",
    "tampouy", "tampuy",
    "dapoya", "dapoya 1", "dapoya 2",
    "kossodo", "wemtenga", "somgande", "tampouy",
    "saaba", "kamboinse", "kombissiri",
    "1200 logements", "1200-logements",
    "cite an", "cite-an", "cite-an-2", "cite-an-3", "cite-an-4",
    "gounghin", "kouritenga", "wayalghin",
    "azimmo", "rotonde", "kalgondin",
    "secteur 4", "secteur 9", "secteur 14", "secteur 15", "secteur 17", "secteur 30",
    "1er mai", "premier-mai", "premier mai",
    "donsin", "loumbila", "sabtenga",
    "n'krumah", "nkrumah", "centre", "centre-ville", "ville",
    "marina", "koulouba",
]


def parse_prix_clefs(text: str) -> Optional[int]:
    """'350.000Fcfa /mois' → 350000."""
    if not text:
        return None
    s = text.lower().replace("\xa0", " ")
    m = re.search(r"(\d[\d\s.,]*)", s)
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


def detect_type_bien(text: str) -> str:
    """Détecte type_bien depuis le texte (titre+description+slug)."""
    t = text.lower()
    if "appart" in t or "f1" in t or "f2" in t or "f3" in t or "f4" in t or "f5" in t:
        return "appartement"
    if "duplex" in t or "villa" in t:
        return "villa"
    if "maison" in t:
        return "maison"
    if "studio" in t or "chambre" in t and "salon" not in t:
        return "studio"
    if "terrain" in t or "parcelle" in t:
        return "terrain"
    if "bureau" in t or "magasin" in t or "boutique" in t or "local" in t or "entrepot" in t:
        return "commercial"
    if "immeuble" in t:
        return "immeuble"
    # heuristique salon → souvent villa/maison/appart (ambigu) — laisser vide
    return ""


def detect_quartier(slug: str, titre: str, desc: str) -> tuple[str, str]:
    """Cherche un quartier connu de Ouaga dans le slug d'URL puis le titre/desc.
    Renvoie (quartier_label, sous_quartier_label)."""
    haystack = " ".join([slug.replace("-", " "), titre.lower(), desc.lower()])
    haystack = re.sub(r"\s+", " ", haystack)
    found = []
    for q in QUARTIERS_OUAGA:
        key = q.replace("-", " ")
        if re.search(rf"\b{re.escape(key)}\b", haystack):
            label = key.title()
            if label not in found:
                found.append(label)
    if not found:
        return "Ouagadougou", ""
    if len(found) == 1:
        return found[0], ""
    return found[0], ", ".join(found[1:3])


def slug_from_url(url: str) -> str:
    try:
        path = urlparse(url).path
        # /annonce/{slug}/ -> {slug}
        parts = [p for p in path.split("/") if p]
        if parts and parts[0] == "annonce":
            return parts[1] if len(parts) >= 2 else ""
        return parts[-1] if parts else ""
    except Exception:
        return ""


def extraire_card(card) -> Optional[dict]:
    try:
        titre = _norm_ws(card.get("data-modal-title", ""))
        url = (card.get("data-modal-link") or "").split("?")[0]
        if not url:
            link = card.select_one("h4 a, a")
            if link is not None:
                url = (link.get("href") or "").split("?")[0]
        if not url:
            return None
        url = urljoin(BASE + "/", url)

        if not titre:
            h4a = card.select_one("h4 a")
            titre = _norm_ws(h4a.get_text(" ", strip=True)) if h4a else ""

        # Prix
        prix_tag = card.select_one(".listing_unit_price_wrapper")
        prix_text = prix_tag.get_text(" ", strip=True) if prix_tag else ""
        prix = parse_prix_clefs(prix_text)

        # Transaction depuis .action_tag_wrapper
        action_tag = card.select_one(".action_tag_wrapper")
        action_text = action_tag.get_text(" ", strip=True).lower() if action_tag else ""
        if "location" in action_text or "louer" in action_text:
            transaction = "location"
        elif "vente" in action_text or "vendre" in action_text or "achat" in action_text:
            transaction = "achat"
        else:
            # Fallback : depuis le titre/URL
            t = (titre + " " + url).lower()
            if "louer" in t or "location" in t or "a-louer" in t:
                transaction = "location"
            elif "vendre" in t or "vente" in t or "a-vendre" in t or "en-vente" in t:
                transaction = "achat"
            else:
                transaction = ""

        # Description (pour parser surface/chambres)
        desc_tag = card.select_one(".listing_details.the_list_view") or card.select_one(".listing_details")
        desc = desc_tag.get_text(" ", strip=True) if desc_tag else ""

        slug = slug_from_url(url)
        full_text = f"{titre} {desc} {slug.replace('-', ' ')}"
        surface = parse_surface(full_text)
        chambres = parse_chambres(full_text)
        prix_m2 = calculer_prix_m2(prix, surface)

        type_bien = detect_type_bien(full_text)
        quartier, sous_q = detect_quartier(slug, titre, desc)

        if not prix or not transaction:
            return None

        return {
            "country": "BF",
            "country_label": "Burkina Faso",
            "source": "clefsdufaso",
            "transaction": transaction,
            "type_bien": type_bien,
            "subcategory": "",
            "titre": titre[:200],
            "prix_fcfa": prix,
            "surface_m2": surface,
            "prix_m2_fcfa": prix_m2,
            "chambres": chambres,
            "quartier": quartier,
            "sous_quartier": sous_q,
            "standing": "",
            "url": url,
        }
    except Exception as e:
        log.error(f"[CLEFSDUFASO] Erreur extraction : {e}")
        return None


def scrape_listing(path: str, transaction: str, max_pages: int, delay: float) -> list[dict]:
    rows: list[dict] = []
    empty_streak = 0
    for p in range(1, max_pages + 1):
        url = f"{BASE}{path}" if p == 1 else f"{BASE}{path}page/{p}/"
        soup = fetch_page(url)
        if soup is None:
            log.warning(f"[CLEFSDUFASO] {path} p{p} FETCH FAIL")
            empty_streak += 1
            if empty_streak >= 2:
                break
            continue
        cards = soup.select(".listing_wrapper.property_unit_type2")
        if not cards:
            empty_streak += 1
            log.info(f"[CLEFSDUFASO] {path} p{p} : 0 carte ({empty_streak} consec.)")
            if empty_streak >= 2:
                break
        else:
            empty_streak = 0
            n_before = len(rows)
            for c in cards:
                data = extraire_card(c)
                if data is not None:
                    rows.append(data)
            log.info(f"[CLEFSDUFASO] {path} p{p} : {len(rows) - n_before} retenues")
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
    p = argparse.ArgumentParser(description="Scrape Clefs du Faso (Burkina Faso).")
    p.add_argument("--max-pages", type=int, default=50)
    p.add_argument("--delay", type=float, default=0.6)
    args = p.parse_args()

    log.info(f"Clefs du Faso — max-pages={args.max_pages} delay={args.delay}")
    all_rows: list[dict] = []
    for path, tx in LISTINGS:
        log.info(f"=== {path} ({tx}) ===")
        rows = scrape_listing(path, tx, args.max_pages, args.delay)
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

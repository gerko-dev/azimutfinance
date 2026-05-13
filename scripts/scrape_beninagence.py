"""Scraper Benin Agence — annonces immobilières Bénin (Cotonou & environs).

Source : https://beninagence.com/

Listings paginés :
  - /a-louer/page/N/  (toutes locations, principalement saisonnières)
  - /a-vendre/page/N/

Structure carte : `<article class="rh_list_card ...">` (theme Realhomes WP).
  - h3 a                       → titre + URL annonce
  - .price ou [class*=price]   → prix (souvent "X FCFA / Nuitée" pour saisonnier)
  - .rh_prop_card__meta        → chambres / sdb (en figures séparées)
  - texte global               → "A Louer" / "A Vendre" tag

Quartier : extrait du titre (souvent ", Cotonou" ou "à Akogbato"). Pas de
surface visible sur les cards.

NB : la majorité des annonces sont des **locations saisonnières** (€/nuit),
pas des loyers mensuels. On stocke subcategory="saisonnier" quand le label
prix contient "nuit" pour permettre le filtrage côté lib/immobilier.ts.

Sortie : data/beninagence.csv
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
OUT_CSV = DATA_DIR / "beninagence.csv"

BASE = "https://beninagence.com"

LISTINGS = [
    ("/a-louer/", "location"),
    ("/a-vendre/", "achat"),
]

CSV_FIELDS = [
    "country", "country_label", "source", "transaction", "type_bien",
    "subcategory", "titre", "prix_fcfa", "surface_m2", "prix_m2_fcfa",
    "chambres", "quartier", "sous_quartier", "standing", "url", "scraped_at",
]

_WS_RE = re.compile(r"\s+", re.UNICODE)
def _norm_ws(s: str) -> str:
    return _WS_RE.sub(" ", s or "").strip()


# Quartiers de Cotonou & villes proches (extraction depuis titre)
LIEUX_BENIN = [
    "akogbato", "akpakpa", "agla", "agontikon", "aibatin", "akassato",
    "arconville", "cadjehoun", "calavi", "cocokodji", "cocotomey",
    "cotonou", "fidjrosse", "fidjrosse", "godomey", "ouidah", "paouignan",
    "porto-novo", "porto novo", "sainte rita", "saint michel",
    "togbin", "womey", "zogbo", "jonkey", "seme-krake", "seme krake",
    "tokpa-hoho", "tokpa hoho", "ekpe", "abomey", "parakou",
    "bohicon", "natitingou", "kandi",
]


def parse_prix_benin(text: str) -> Optional[int]:
    """'A partir de 10.000 FCFA / nuit' → 10000."""
    if not text:
        return None
    s = text.lower().replace("\xa0", " ")
    m = re.search(r"(\d[\d\s.,]*)\s*(?:fcfa|cfa|f)", s)
    if not m:
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
    # Pour le saisonnier (par nuit), accepter jusqu'à 5k (par nuit chambre simple)
    if v < 3_000 or v > 5_000_000_000:
        return None
    return v


def detect_type_bien(text: str) -> str:
    t = text.lower()
    if "appart" in t or "studio" in t:
        return "appartement" if "appart" in t else "studio"
    if "duplex" in t or "villa" in t:
        return "villa"
    if "maison" in t:
        return "maison"
    if "chambre" in t and "hotel" in t:
        return "studio"
    if "chambre" in t and "salon" not in t:
        return "studio"
    if "parcelle" in t or "terrain" in t:
        return "terrain"
    if "bureau" in t or "magasin" in t or "boutique" in t or "local" in t:
        return "commercial"
    if "immeuble" in t:
        return "immeuble"
    return ""


def detect_lieu(titre: str, slug: str) -> tuple[str, str]:
    """Quartier + sous-quartier depuis le titre puis le slug URL."""
    haystack = " ".join([titre.lower(), slug.replace("-", " ").lower()])
    haystack = re.sub(r"\s+", " ", haystack)
    found = []
    for q in LIEUX_BENIN:
        if re.search(rf"\b{re.escape(q)}\b", haystack):
            label = q.title()
            if label not in found:
                found.append(label)
    if not found:
        return "Bénin", ""
    if len(found) == 1:
        return found[0], ""
    return found[0], ", ".join(found[1:3])


def is_saisonnier(price_text: str) -> bool:
    p = (price_text or "").lower()
    return ("nuit" in p) or ("/nuit" in p)


def extraire_card(card) -> Optional[dict]:
    try:
        h3a = card.select_one("h3 a")
        if h3a is None:
            return None
        titre = _norm_ws(h3a.get_text(" ", strip=True))
        href = (h3a.get("href") or "").split("?")[0]
        if not href:
            return None
        url = urljoin(BASE + "/", href)

        # Prix : on prend la classe la plus précise
        prix_tag = card.select_one(".price") or card.select_one("[class*='price']")
        prix_text = prix_tag.get_text(" ", strip=True) if prix_tag else ""
        prix = parse_prix_benin(prix_text)

        # Transaction : si pas évidente dans le texte, on garde le default du listing
        tx_text = prix_text.lower() + " " + titre.lower()
        if "louer" in tx_text or "location" in tx_text:
            transaction = "location"
        elif "vendre" in tx_text or "vente" in tx_text or "achat" in tx_text:
            transaction = "achat"
        else:
            transaction = ""

        # Chambres : 1er .rh_meta_icon_wrapper figure
        chambres = None
        metas = card.select(".rh_prop_card__meta")
        for m in metas:
            label = m.select_one(".rh_meta_titles")
            label_t = label.get_text(" ", strip=True).lower() if label else ""
            figure = m.select_one(".figure")
            fig_t = figure.get_text(" ", strip=True) if figure else ""
            if "chambre" in label_t and fig_t.isdigit():
                v = int(fig_t)
                # Si valeur ridiculement haute (ex: 120 pour un hôtel), garder None
                if 0 < v <= 20:
                    chambres = v
                break

        slug = href.rstrip("/").split("/")[-1] if href else ""
        full_text = f"{titre} {slug.replace('-', ' ')}"
        surface = parse_surface(full_text)
        if chambres is None:
            chambres = parse_chambres(full_text)
        prix_m2 = calculer_prix_m2(prix, surface)

        type_bien = detect_type_bien(full_text)
        quartier, sous_q = detect_lieu(titre, slug)
        subcat = "saisonnier" if is_saisonnier(prix_text) else ""

        if not prix or not transaction:
            return None

        return {
            "country": "BJ",
            "country_label": "Bénin",
            "source": "beninagence",
            "transaction": transaction,
            "type_bien": type_bien,
            "subcategory": subcat,
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
        log.error(f"[BENINAGENCE] Erreur extraction : {e}")
        return None


def scrape_listing(path: str, transaction_default: str, max_pages: int, delay: float) -> list[dict]:
    rows: list[dict] = []
    empty_streak = 0
    for p in range(1, max_pages + 1):
        url = f"{BASE}{path}" if p == 1 else f"{BASE}{path}page/{p}/"
        soup = fetch_page(url)
        if soup is None:
            empty_streak += 1
            log.warning(f"[BENINAGENCE] {path} p{p} FETCH FAIL")
            if empty_streak >= 2:
                break
            continue
        # Sélecteur strict : article.rh_list_card uniquement.
        # Les featured/à la une du sidebar utilisent un autre <article> et
        # apparaissent sur TOUTES les pages — on les exclut sous peine de
        # boucle infinie avec doublons.
        cards = [a for a in soup.select("article.rh_list_card") if a.select('a[href*="/property/"]')]
        if not cards:
            empty_streak += 1
            log.info(f"[BENINAGENCE] {path} p{p} : 0 carte ({empty_streak} consec.)")
            if empty_streak >= 2:
                break
        else:
            empty_streak = 0
            n_before = len(rows)
            for c in cards:
                data = extraire_card(c)
                if data is not None:
                    rows.append(data)
            log.info(f"[BENINAGENCE] {path} p{p} : {len(rows) - n_before} retenues")
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
    p = argparse.ArgumentParser(description="Scrape Benin Agence (Bénin).")
    p.add_argument("--max-pages", type=int, default=50)
    p.add_argument("--delay", type=float, default=0.6)
    args = p.parse_args()

    log.info(f"Benin Agence — max-pages={args.max_pages} delay={args.delay}")
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

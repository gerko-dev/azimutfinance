"""Scraper CoinAfrique CI - annonces immobilieres.

CoinAfrique melange vente et location dans la meme categorie /immobilier ;
la distinction se fait sur le titre + texte de la carte (mots-cles 'vendre',
'location', '/mois', etc.). Les annonces ambigues sont sautees.

Structure typique d'une annonce :
  <a class="card-general" href="/annonce/...">
    <img alt="Vente villa Cocody Riviera 4 chambres" />
    <p class="ad__card-price">35 000 000 CFA</p>
    <p class="ad__card-location">Cocody, Abidjan</p>
  </a>
"""

from __future__ import annotations

import re
from typing import Iterator, Optional
from urllib.parse import urljoin

from utils import (
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

COINAFRIQUE_BASE = "https://ci.coinafrique.com"

# Pattern prix robuste : "12 500 000 CFA" ou "CFA 12,500,000" ou "F CFA 12.500.000"
PRIX_RE = re.compile(
    r"(?:CFA|FCFA|F\s*CFA)\s*([\d][\d\s.,]+)|([\d][\d\s.,]+)\s*(?:CFA|FCFA|F\s*CFA)",
    re.IGNORECASE,
)

RENT_HINTS = (
    "louer", "à louer", "a louer", "location", "loyer",
    "/mois", "par mois", "mensuel", "/m",
)
SALE_HINTS = (
    "vendre", "à vendre", "a vendre", "vente", "achat", "à acheter",
)


def classer_transaction(texte: str) -> Optional[str]:
    """Classe le texte en 'achat' ou 'location' (ou None si ambigu)."""
    t = texte.lower()
    has_rent = any(h in t for h in RENT_HINTS)
    has_sale = any(h in t for h in SALE_HINTS)
    if has_rent and not has_sale:
        return "location"
    if has_sale and not has_rent:
        return "achat"
    return None


def scraper_coinafrique_categorie(
    url_categorie: str, max_pages: int, transaction: str
) -> Iterator[dict]:
    """Scrape /categorie/immobilier en filtrant cote client par transaction."""
    log.info(f"[COINAFRIQUE] Demarrage ({transaction}) : {url_categorie}")

    for page in range(1, max_pages + 1):
        url = url_categorie if page == 1 else f"{url_categorie}?page={page}"
        log.info(f"[COINAFRIQUE] Page {page}/{max_pages}")

        soup = fetch_page(url)
        if soup is None:
            log.warning(f"[COINAFRIQUE] Page {page} non recuperee, on continue.")
            continue

        # Cards = anchors vers /annonce/<...>
        annonces = (
            soup.select('a[class*="card-general"]')
            or soup.select('a[href*="/annonce/"]')
        )

        if not annonces:
            log.warning(
                f"[COINAFRIQUE] Aucune annonce trouvee page {page} - fin probable."
            )
            break

        log.info(f"[COINAFRIQUE]   {len(annonces)} annonces brutes sur cette page")

        nb_extraites = 0
        nb_filtrees_transaction = 0
        for annonce in annonces:
            data, raison = extraire_annonce_coinafrique(annonce, transaction)
            if data:
                yield data
                nb_extraites += 1
            elif raison == "transaction":
                nb_filtrees_transaction += 1

        log.info(
            f"[COINAFRIQUE]   -> {nb_extraites} annonces {transaction} retenues "
            f"({nb_filtrees_transaction} ecartees pour autre type/ambigu)"
        )

        if nb_extraites < 5 and page > 1:
            log.info("[COINAFRIQUE] Peu d'annonces, arret anticipe.")
            break

    log.info(f"[COINAFRIQUE] Termine ({transaction})")


def extraire_annonce_coinafrique(
    annonce, transaction: str
) -> tuple[Optional[dict], str]:
    """Extrait une annonce. Renvoie (data|None, raison_si_None)."""
    try:
        # URL
        href = get_href(annonce)
        if not href:
            return None, "no_href"
        url_annonce = urljoin(COINAFRIQUE_BASE, href.split("?")[0])

        # On remonte de quelques niveaux pour englober prix + location qui sont
        # parfois en dehors de l'anchor (cas card-general avec wrapper)
        card = annonce
        for _ in range(2):
            p = getattr(card, "parent", None)
            if p is None:
                break
            card = p
        card_text = card.get_text(" ", strip=True) if hasattr(card, "get_text") else ""

        # Titre : selecteurs cibles, fallback alt d'image, fallback texte ancrage
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
            anchor_text = annonce.get_text(" ", strip=True)
            titre = (anchor_text or card_text)[:200]
        titre = titre[:200]

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

        # Localisation : selecteur cible, fallback regex sur le texte
        loc_tag = (
            annonce.select_one("[class*='card-location']")
            or annonce.select_one(".ad__card-location")
        )
        location_brute = loc_tag.get_text(" ", strip=True) if loc_tag else ""

        # Classifier vente/location AVANT de poursuivre l'extraction couteuse
        texte_classification = f"{titre} | {prix_texte} | {card_text}"
        inferred = classer_transaction(texte_classification)
        if inferred is None:
            return None, "ambigu"
        if inferred != transaction:
            return None, "transaction"

        # Detections
        texte_complet = f"{titre} {location_brute} {card_text}"
        surface = parse_surface(card_text) or parse_surface(titre)
        chambres = parse_chambres(card_text) or parse_chambres(titre)
        quartier = detecter_quartier(texte_complet)
        sous_quartier = detecter_sous_quartier(texte_complet, quartier)
        standing = detecter_standing(texte_complet)
        type_bien = detecter_type_bien(texte_complet)
        prix_m2 = calculer_prix_m2(prix, surface)

        if not prix or (not surface and not quartier):
            return None, "donnees_insuffisantes"

        return (
            {
                "source": "coinafrique",
                "transaction": transaction,
                "type_bien": type_bien,
                "titre": titre,
                "prix_fcfa": prix,
                "surface_m2": surface,
                "prix_m2_fcfa": prix_m2,
                "chambres": chambres,
                "quartier": quartier,
                "sous_quartier": sous_quartier,
                "standing": standing,
                "url": url_annonce,
            },
            "ok",
        )
    except Exception as e:
        log.error(f"[COINAFRIQUE] Erreur extraction annonce : {e}")
        return None, "exception"

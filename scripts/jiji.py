"""Scraper Jiji.co.ci - annonces immobilieres Abidjan.

Structure typique d'une annonce sur Jiji :
  <div class="b-list-advert__gallery__item">
    <a href="/abidjan/...">
      <div class="qa-advert-title">Titre de l'annonce</div>
      <div class="qa-advert-price">CFA 12,000,000</div>
      <div class="b-list-advert__attribute">300 sqm · 4 chambres · Cocody</div>
    </a>
  </div>

Note : les classes CSS de Jiji peuvent changer. Le script utilise plusieurs
selecteurs alternatifs pour rester robuste.
"""

from __future__ import annotations

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

JIJI_BASE = "https://jiji.co.ci"


def scraper_jiji_categorie(
    url_categorie: str, max_pages: int, transaction: str
) -> Iterator[dict]:
    """Scrape une categorie Jiji sur plusieurs pages.

    Args:
        url_categorie: URL de la categorie (ex: .../houses-apartments-for-sale)
        max_pages: nombre maximum de pages a parcourir
        transaction: 'achat' ou 'location'

    Yields:
        Un dict par annonce avec les champs normalises.
    """
    log.info(f"[JIJI] Demarrage : {url_categorie}")

    for page in range(1, max_pages + 1):
        url = url_categorie if page == 1 else f"{url_categorie}?page={page}"
        log.info(f"[JIJI] Page {page}/{max_pages}")

        soup = fetch_page(url)
        if soup is None:
            log.warning(f"[JIJI] Page {page} non recuperee, on continue.")
            continue

        # Selecteurs robustes : on essaie plusieurs variantes
        annonces = (
            soup.select("div.b-list-advert__gallery__item")
            or soup.select("div[class*='b-list-advert']")
            or soup.select("a[class*='qa-advert-list-item']")
            or soup.select('a[href*="/houses-apartments-for-"][href$=".html"]')
        )

        if not annonces:
            log.warning(f"[JIJI] Aucune annonce trouvee page {page} - fin probable.")
            break

        log.info(f"[JIJI]   {len(annonces)} annonces sur cette page")

        nb_extraites = 0
        for annonce in annonces:
            data = extraire_annonce_jiji(annonce, transaction)
            if data:
                yield data
                nb_extraites += 1

        log.info(f"[JIJI]   -> {nb_extraites} annonces exploitables extraites")

        # Si on a moins de 5 annonces, on est probablement a la derniere page
        if nb_extraites < 5 and page > 1:
            log.info("[JIJI] Peu d'annonces, arret anticipe.")
            break

    log.info(f"[JIJI] Termine : {url_categorie}")


def extraire_annonce_jiji(annonce, transaction: str) -> Optional[dict]:
    """Extrait les champs d'une annonce Jiji."""
    try:
        # Titre
        titre_tag = (
            annonce.select_one(".qa-advert-title")
            or annonce.select_one("[class*='advert-title']")
            or annonce.select_one("h3")
        )
        titre = titre_tag.get_text(strip=True) if titre_tag else ""

        # Prix
        prix_tag = (
            annonce.select_one(".qa-advert-price")
            or annonce.select_one("[class*='advert-price']")
            or annonce.select_one("[class*='price']")
        )
        prix_texte = prix_tag.get_text(strip=True) if prix_tag else ""
        prix = parse_prix(prix_texte)

        # Attributs (surface, chambres, quartier)
        attributs_tag = (
            annonce.select_one(".b-list-advert__attribute")
            or annonce.select_one("[class*='attribute']")
        )
        attributs = attributs_tag.get_text(" ", strip=True) if attributs_tag else ""

        # URL de l'annonce (l'annonce peut etre <div> ou <a> selon la variante)
        href = get_href(annonce)
        if not href:
            return None
        url_annonce = urljoin(JIJI_BASE, href.split("?")[0])

        # Texte combine pour detection
        texte_complet = f"{titre} {attributs}"

        surface = parse_surface(attributs) or parse_surface(titre)
        chambres = parse_chambres(attributs) or parse_chambres(titre)
        quartier = detecter_quartier(texte_complet)
        sous_quartier = detecter_sous_quartier(texte_complet, quartier)
        standing = detecter_standing(texte_complet)
        type_bien = detecter_type_bien(texte_complet)
        prix_m2 = calculer_prix_m2(prix, surface)

        # On ne garde que les annonces avec au moins prix + (surface OU quartier)
        if not prix or (not surface and not quartier):
            return None

        return {
            "source": "jiji",
            "transaction": transaction,
            "type_bien": type_bien,
            "titre": titre[:200],
            "prix_fcfa": prix,
            "surface_m2": surface,
            "prix_m2_fcfa": prix_m2,
            "chambres": chambres,
            "quartier": quartier,
            "sous_quartier": sous_quartier,
            "standing": standing,
            "url": url_annonce,
        }
    except Exception as e:
        log.error(f"[JIJI] Erreur extraction annonce : {e}")
        return None

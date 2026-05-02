"""Helpers partages pour les scrapers immobiliers Jiji + CoinAfrique.

Tous les parsers numeriques renvoient None si la valeur n'est pas fiable.
Les detecteurs textuels renvoient '' si rien n'est trouve.
"""

from __future__ import annotations

import logging
import re
import sys
import time
from typing import Optional

import requests
from bs4 import BeautifulSoup

# =============================================================================
# Config HTTP
# =============================================================================

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
TIMEOUT = 25
RETRIES = 2
RETRY_DELAY = 4  # secondes entre 2 essais en cas d'erreur

# =============================================================================
# Logger
# =============================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,
)
log = logging.getLogger("immo")

# =============================================================================
# Session HTTP partagee + fetch
# =============================================================================

_session: Optional[requests.Session] = None


def _get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update(
            {
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
                "Cache-Control": "no-cache",
            }
        )
    return _session


def fetch_page(url: str) -> Optional[BeautifulSoup]:
    """GET une URL avec retry. Renvoie BeautifulSoup, ou None si echec definitif."""
    session = _get_session()
    last_err: Optional[str] = None
    for attempt in range(RETRIES + 1):
        try:
            resp = session.get(url, timeout=TIMEOUT)
        except requests.RequestException as e:
            last_err = str(e)
            log.warning(f"Erreur requete {url} (essai {attempt + 1}) : {e}")
        else:
            if resp.status_code == 200:
                try:
                    return BeautifulSoup(resp.text, "lxml")
                except Exception:
                    return BeautifulSoup(resp.text, "html.parser")
            if resp.status_code == 403:
                log.warning(
                    f"403 sur {url} : challenge anti-bot probable (Cloudflare). "
                    "Augmenter --delay ou passer a curl_cffi/Playwright."
                )
                return None
            last_err = f"HTTP {resp.status_code}"
            log.warning(f"HTTP {resp.status_code} sur {url}")
        if attempt < RETRIES:
            time.sleep(RETRY_DELAY)
    log.error(f"Echec definitif {url} : {last_err}")
    return None


# =============================================================================
# Parsers numeriques
# =============================================================================

def parse_prix(text: str) -> Optional[int]:
    """'CFA 12 500 000', '12,500,000 FCFA', '350 000 / mois' -> int (FCFA)."""
    if not text:
        return None
    s = text.replace("\xa0", " ")
    digits = re.sub(r"[^\d]", "", s)
    if not digits:
        return None
    try:
        v = int(digits)
    except ValueError:
        return None
    # Filtre les valeurs invraisemblables (ex : numero de reference attrape par erreur)
    if v < 1000 or v > 50_000_000_000:
        return None
    return v


def parse_surface(text: str) -> Optional[int]:
    """'300 sqm', '120 m²', 'surface 250m2' -> int."""
    if not text:
        return None
    m = re.search(
        r"\b(\d{2,5})\s*(?:m[²2]|sqm|m\.?\s*carr[ée]s?)\b",
        text,
        re.IGNORECASE,
    )
    return int(m.group(1)) if m else None


def parse_chambres(text: str) -> Optional[int]:
    """'4 chambres', '3 chbres', '2 bedrooms', '5 pieces' -> int."""
    if not text:
        return None
    m = re.search(
        r"\b(\d+)\s*(?:chambres?|chbres?|chbre|bedrooms?|pi[èe]ces?|pieces?)\b",
        text,
        re.IGNORECASE,
    )
    return int(m.group(1)) if m else None


def calculer_prix_m2(prix: Optional[int], surface: Optional[int]) -> Optional[int]:
    if not prix or not surface or surface <= 0:
        return None
    return int(round(prix / surface))


# =============================================================================
# Detecteurs textuels (quartier, sous-quartier, standing, type de bien)
# =============================================================================

# Quartiers principaux d'Abidjan + agglomeration
QUARTIERS = [
    "Cocody", "Yopougon", "Marcory", "Plateau", "Treichville",
    "Adjamé", "Adjame", "Abobo", "Attécoubé", "Attecoube",
    "Koumassi", "Port-Bouët", "Port-Bouet", "Bingerville",
    "Anyama", "Songon", "Grand-Bassam", "Bassam",
    "Riviera",  # techniquement sous Cocody, mais souvent ecrit en autonome
]

# Sous-zones connues par quartier (best-effort, a etendre selon besoins)
SOUS_QUARTIERS: dict[str, list[str]] = {
    "Cocody": [
        "Riviera Palmeraie", "Riviera Bonoumin", "Riviera Faya", "Riviera Golf",
        "Riviera M'Badon", "Riviera Mbadon", "Riviera 1", "Riviera 2",
        "Riviera 3", "Riviera 4",
        "II Plateaux", "Deux Plateaux", "2 Plateaux", "Les II Plateaux",
        "Angré", "Angre",
        "Bonoumin", "Faya", "Palmeraie", "Saint Jean", "Cocody Ambassade",
        "Cocody Centre", "Danga", "Vallon", "Mermoz", "Bessikoi",
        "M'Pouto", "Mpouto", "Attoban", "7e Tranche", "Cite des Arts",
    ],
    "Yopougon": [
        "Niangon", "Selmer", "Maroc", "Sicogi", "Ananeraie", "Kouté", "Koute",
        "Sideci", "Toits Rouges", "Andokoi", "Banco",
    ],
    "Marcory": [
        "Zone 4", "Anoumabo", "Résidentiel", "Residentiel", "Biafrais",
        "Remblais", "Aliodan",
    ],
    "Plateau": ["Indénié", "Indenie", "Gallieni", "Plateau Centre"],
    "Adjamé": ["220 Logements", "Bracodi", "Williamsville", "Pailler"],
    "Adjame": ["220 Logements", "Bracodi", "Williamsville", "Pailler"],
    "Abobo": ["Abobo Sagbé", "Abobo Sagbe", "PK 18", "Anonkoua Kouté", "Anonkoua Koute"],
    "Koumassi": ["Remblai", "Prodomo", "Sicogi", "Inchallah"],
    "Port-Bouët": ["Vridi", "Aéroport", "Aeroport", "Adjouffou"],
    "Port-Bouet": ["Vridi", "Aéroport", "Aeroport", "Adjouffou"],
    "Treichville": ["Avenue 12", "Belleville"],
    "Grand-Bassam": ["Quartier France", "Phare", "Mossou"],
    "Bassam": ["Quartier France", "Phare", "Mossou"],
}


def detecter_quartier(text: str) -> str:
    """Retourne le 1er quartier d'Abidjan trouve dans le texte (ou '')."""
    if not text:
        return ""
    for q in QUARTIERS:
        if re.search(r"\b" + re.escape(q) + r"\b", text, re.IGNORECASE):
            return q
    return ""


def detecter_sous_quartier(text: str, quartier: str) -> str:
    """Retourne le sous-quartier le plus specifique pour le quartier donne."""
    if not text or not quartier:
        return ""
    candidats = SOUS_QUARTIERS.get(quartier, [])
    # On teste les noms les plus longs en premier ("Riviera Palmeraie" avant "Riviera")
    for cand in sorted(candidats, key=len, reverse=True):
        if re.search(r"\b" + re.escape(cand) + r"\b", text, re.IGNORECASE):
            return cand
    return ""


# Standing : haut / bas. On evite "moyen" qui serait un faux positif par defaut.
STANDING_HAUT = (
    "haut standing", "haut de gamme", "luxueuse", "luxueux", "luxe",
    "premium", "prestige", "vip", "ultra moderne", "tres moderne", "design",
    "neuve", "neuf", "moderne",
)
STANDING_BAS = (
    "économique", "economique", "social", "modeste", "vétuste", "vetuste",
    "à rénover", "a renover", "ancien", "ancienne",
)


def detecter_standing(text: str) -> str:
    if not text:
        return ""
    t = text.lower()
    for kw in STANDING_HAUT:
        if kw in t:
            return "haut"
    for kw in STANDING_BAS:
        if kw in t:
            return "bas"
    return ""


def detecter_type_bien(text: str) -> str:
    """villa | appartement | studio | maison | immeuble | terrain | commercial | ''"""
    if not text:
        return ""
    t = text.lower()
    if "studio" in t:
        return "studio"
    if any(w in t for w in ("villa", "duplex", "triplex")):
        return "villa"
    if "appartement" in t or "appart" in t or "apartment" in t:
        return "appartement"
    if "immeuble" in t or "résidence" in t or "residence" in t:
        return "immeuble"
    if "terrain" in t or "parcelle" in t or " plot " in t or " lot " in t:
        return "terrain"
    if any(w in t for w in ("bureau", "commerce", "magasin", "boutique")):
        return "commercial"
    if "maison" in t or "house" in t:
        return "maison"
    return ""


# =============================================================================
# Helper anchor : recupere l'attribut href quel que soit le tag
# =============================================================================

def get_href(tag) -> str:
    """Recupere href, que tag soit un <a> direct ou un wrapper contenant un <a>."""
    if tag is None:
        return ""
    if getattr(tag, "name", None) == "a" and tag.get("href"):
        return str(tag["href"])
    inner = tag.select_one("a[href]") if hasattr(tag, "select_one") else None
    if inner and inner.get("href"):
        return str(inner["href"])
    return ""

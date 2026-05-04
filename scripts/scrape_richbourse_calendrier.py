"""
Scraper RichBourse : calendrier des publications BRVM depuis 2010.

Source : https://www.richbourse.com/common/actualite/index
Filtre par societe via ?symbole=TICKER, pagination via ?page=N.

Sortie : 5 fichiers CSV (un par type de publication) dans
data/calendrier_publications/. Chaque fichier a comme colonnes
[ticker, 2010, 2011, ..., annee_courante]. Chaque cellule contient la
date (jj/mm/aaaa) de la PREMIERE publication de ce type pour cette annee
- ce qui donne le calendrier "probable" pour anticiper les publications
futures.

Types extraits :
  - annuelle  : Etats financiers de l'exercice (annuel SYSCOHADA / IFRS)
  - t1        : Rapport d'activites 1er trimestre
  - s1        : Rapport d'activites 1er semestre
  - t3        : Rapport d'activites 3eme trimestre
  - dividende : Annonces de dividende et mise en paiement

Usage :
  python scripts/scrape_richbourse_calendrier.py
  python scripts/scrape_richbourse_calendrier.py --tickers NSBC,BOAC
  python scripts/scrape_richbourse_calendrier.py --delay 0.6 --max-pages 30
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.richbourse.com"
INDEX_URL = f"{BASE_URL}/common/actualite/index"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; AzimutFinance/1.0; +https://azimutfinance.com)"
    ),
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml",
}

# Deux formats observes au debut du slug d'URL :
#   - recent : DD-MM-YYYY-...  (depuis 2019/2020)
#   - ancien : YYYY-MM-DD-...  (avant)
DATE_RE_DMY = re.compile(r"^(\d{2})-(\d{2})-(\d{4})-")
DATE_RE_YMD = re.compile(r"^(\d{4})-(\d{2})-(\d{2})-")

PUB_TYPES = ("annuelle", "t1", "s1", "t3", "dividende")


# ============================================================================
# CLASSIFICATION
# ============================================================================


def classify(slug: str) -> str | None:
    """Retourne le type de publication ou None si non pertinent.

    Ordre des tests important : on teste les sous-periodes (trimestre,
    semestre) avant l'annuel, puisque le mot "etats-financiers" peut
    apparaitre sur n'importe quoi.
    """
    s = slug.lower()

    if (
        "1er-trimestre" in s
        or "premier-trimestre" in s
        or "rapport-dactivites-t1" in s
    ):
        return "t1"

    if (
        "1er-semestre" in s
        or "premier-semestre" in s
        or "rapport-dactivites-s1" in s
    ):
        return "s1"

    if (
        "3eme-trimestre" in s
        or "3e-trimestre" in s
        or "troisieme-trimestre" in s
        or "rapport-dactivites-t3" in s
    ):
        return "t3"

    # Dividendes : annonce ou mise en paiement
    if "dividende" in s or "mise-en-paiement" in s:
        return "dividende"

    # Annuel : "etats-financiers" + indice d'exercice complet, sans
    # mots-cles trimestre/semestre (deja captes au-dessus).
    if "etats-financiers" in s and (
        "exercice" in s
        or "syscohada" in s
        or "ifrs" in s
        or "rapport-annuel" in s
        or "annuel" in s
    ):
        return "annuelle"

    return None


def parse_date(slug: str) -> datetime | None:
    # Format recent DD-MM-YYYY
    m = DATE_RE_DMY.match(slug)
    if m:
        dd, mm, yyyy = m.groups()
        try:
            return datetime(int(yyyy), int(mm), int(dd))
        except ValueError:
            return None
    # Format ancien YYYY-MM-DD
    m = DATE_RE_YMD.match(slug)
    if m:
        yyyy, mm, dd = m.groups()
        try:
            return datetime(int(yyyy), int(mm), int(dd))
        except ValueError:
            return None
    return None


# ============================================================================
# SCRAPING
# ============================================================================


@dataclass
class Article:
    slug: str
    date: datetime
    pub_type: str


RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def fetch_html(url: str, session: requests.Session, retries: int = 4) -> str | None:
    """GET avec retry + backoff exponentiel sur erreurs transitoires.

    RichBourse renvoie sporadiquement des 500 (pic de charge ou
    timeout backend) ; un retry avec backoff suffit a recuperer la
    plupart des pages.
    """
    for attempt in range(retries + 1):
        try:
            r = session.get(url, headers=HEADERS, timeout=25)
            if r.status_code == 200:
                return r.text
            if r.status_code in RETRYABLE_STATUS and attempt < retries:
                wait = min(30.0, 1.5 * (2 ** attempt))
                time.sleep(wait)
                continue
            print(
                f"  HTTP {r.status_code} sur {url} (apres {attempt + 1} tentative(s))",
                file=sys.stderr,
            )
            return None
        except requests.RequestException as e:
            if attempt < retries:
                wait = min(30.0, 1.5 * (2 ** attempt))
                time.sleep(wait)
                continue
            print(f"  erreur {url} : {e}", file=sys.stderr)
            return None
    return None


def fetch_tickers(session: requests.Session) -> list[tuple[str, str]]:
    """Liste des couples (ticker, libelle) depuis le select#symbole."""
    html = fetch_html(INDEX_URL, session)
    if not html:
        raise RuntimeError("Impossible de charger la page index pour la liste des tickers")
    soup = BeautifulSoup(html, "lxml")
    sel = soup.select_one("select#symbole")
    if not sel:
        raise RuntimeError("Selecteur #symbole introuvable sur la page index")
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for opt in sel.find_all("option"):
        ticker = (opt.get("value") or "").strip()
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        out.append((ticker, opt.get_text(strip=True)))
    return out


def fetch_articles_for_ticker(
    ticker: str,
    session: requests.Session,
    delay: float,
    max_pages: int,
) -> list[Article]:
    """Pagine sur tous les articles d'un ticker et retourne les pertinents.

    On classe ici directement pour reduire la memoire ; les slugs hors
    types cibles sont ignores.
    """
    articles: list[Article] = []
    seen_slugs: set[str] = set()
    consecutive_failures = 0
    for page in range(1, max_pages + 1):
        url = f"{INDEX_URL}?symbole={ticker}&page={page}"
        html = fetch_html(url, session)
        if not html:
            consecutive_failures += 1
            # Tolere 2 echecs consecutifs au cas ou une page intermediaire
            # leve un 500 ; au-dela on coupe.
            if consecutive_failures >= 3:
                print(
                    f"  trop d'echecs consecutifs sur {ticker} a la page {page}, arret",
                    file=sys.stderr,
                )
                break
            time.sleep(delay * 2)
            continue
        consecutive_failures = 0

        soup = BeautifulSoup(html, "lxml")
        links = soup.select('a[href^="/common/actualite/details/"]')
        if not links:
            break

        new_count = 0
        for a in links:
            href = a.get("href") or ""
            slug = href.replace("/common/actualite/details/", "").strip().rstrip("/")
            if not slug or slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            new_count += 1

            pub_type = classify(slug)
            if not pub_type:
                continue
            d = parse_date(slug)
            if not d:
                continue
            articles.append(Article(slug=slug, date=d, pub_type=pub_type))

        # Fin de pagination : pas de bouton "Suiv." actif, ou rien de nouveau
        next_li = soup.select_one("li.next a")
        has_next = bool(next_li and next_li.get("href"))
        if not has_next or new_count == 0:
            break

        time.sleep(delay)
    return articles


# ============================================================================
# SORTIE CSV
# ============================================================================


def write_csv(
    path: Path,
    tickers: list[tuple[str, str]],
    by_ticker_year: dict[str, dict[int, datetime]],
    years: list[int],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        # Delimiter ; pour cohérence avec les autres CSV du projet (cf CLAUDE.md)
        w = csv.writer(f, delimiter=";")
        w.writerow(["ticker"] + [str(y) for y in years])
        for ticker, _ in tickers:
            row = [ticker]
            year_map = by_ticker_year.get(ticker, {})
            for y in years:
                d = year_map.get(y)
                row.append(d.strftime("%d/%m/%Y") if d else "")
            w.writerow(row)


# ============================================================================
# MAIN
# ============================================================================


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument(
        "--tickers",
        type=str,
        default=None,
        help=(
            "Liste de tickers separes par des virgules pour limiter le scraping "
            "(ex --tickers NSBC,BOAC). Par defaut tous les tickers disponibles."
        ),
    )
    p.add_argument(
        "--delay",
        type=float,
        default=0.4,
        help="Delai en secondes entre requetes (politeness, defaut 0.4).",
    )
    p.add_argument(
        "--max-pages",
        type=int,
        default=50,
        help="Plafond de pages par ticker (defaut 50).",
    )
    p.add_argument(
        "--out-dir",
        type=str,
        default="data/calendrier_publications",
        help="Repertoire de sortie (defaut data/calendrier_publications/).",
    )
    p.add_argument(
        "--start-year",
        type=int,
        default=2010,
        help="Annee de debut des colonnes (defaut 2010).",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    out_dir = Path(args.out_dir)
    session = requests.Session()

    print("Chargement de la liste des tickers...", flush=True)
    all_tickers = fetch_tickers(session)
    if args.tickers:
        wanted = {t.strip().upper() for t in args.tickers.split(",") if t.strip()}
        tickers = [(t, n) for t, n in all_tickers if t.upper() in wanted]
        if not tickers:
            print(f"Aucun ticker valide parmi : {wanted}", file=sys.stderr)
            return 1
    else:
        tickers = all_tickers
    print(f"{len(tickers)} ticker(s) a traiter", flush=True)

    # by_type[type][ticker][year] = date la plus precoce
    by_type: dict[str, dict[str, dict[int, datetime]]] = {
        t: defaultdict(dict) for t in PUB_TYPES
    }

    for i, (ticker, name) in enumerate(tickers, 1):
        print(f"[{i}/{len(tickers)}] {ticker} — {name}", flush=True)
        try:
            articles = fetch_articles_for_ticker(
                ticker, session, args.delay, args.max_pages
            )
        except Exception as e:
            print(f"  erreur : {e}", file=sys.stderr)
            continue

        for a in articles:
            if a.date.year < args.start_year:
                continue
            year_map = by_type[a.pub_type][ticker]
            cur = year_map.get(a.date.year)
            if cur is None or a.date < cur:
                year_map[a.date.year] = a.date

        per_type_count = {t: sum(1 for _ in by_type[t][ticker]) for t in PUB_TYPES}
        print(
            f"  -> {len(articles)} articles classes ; "
            f"annees couvertes : "
            + " ".join(f"{t}={per_type_count[t]}" for t in PUB_TYPES),
            flush=True,
        )
        time.sleep(args.delay)

    # Annees couvertes : start_year .. annee courante
    years = list(range(args.start_year, datetime.now().year + 1))

    # Un fichier par type
    type_to_filename = {
        "annuelle": "publications_annuelles.csv",
        "t1": "publications_t1.csv",
        "s1": "publications_s1.csv",
        "t3": "publications_t3.csv",
        "dividende": "publications_dividendes.csv",
    }
    print()
    for t in PUB_TYPES:
        path = out_dir / type_to_filename[t]
        write_csv(path, tickers, by_type[t], years)
        # Stats : combien de tickers ont au moins une donnee
        non_empty = sum(1 for ticker, _ in tickers if by_type[t][ticker])
        print(f"  {path}  ({non_empty}/{len(tickers)} tickers avec donnees)")

    return 0


if __name__ == "__main__":
    sys.exit(main())

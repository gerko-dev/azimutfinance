#!/usr/bin/env python3
"""
Scrape l'historique complet (depuis l'origine) des titres BRVM cotes sur
Sikafinance et exporte un CSV par titre, avec OHLC + volume.

API decouverte :
    POST https://www.sikafinance.com/api/general/GetHistos
    Body: {"ticker":"BOAC.ci","datedeb":"YYYY-MM-DD","datefin":"YYYY-MM-DD","xperiod":"0"}
    Reponse: {"lst":[{Date:"DD/MM/YYYY",Open,High,Low,Close,Volume}, ...], "error":""}

Limitation serveur : 3 mois max par requete (sinon error="toolong").
On pagine donc en tranches de 90 jours en remontant le temps, et on
s'arrete apres N fenetres "nodata" consecutives (titre pas encore introduit).

Dependances : requests
    pip install requests

Usage:
    python scrape_sika_history.py
    python scrape_sika_history.py --only BOAC SNTS --out-dir data/historique_sika
    python scrape_sika_history.py --workers 4 --max-empty 8

Output:
    data/historique_sika/<TICKER>.<pays>.csv
    Colonnes : date_iso ; date_fr ; open ; high ; low ; close ; volume
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import requests

API_URL = "https://www.sikafinance.com/api/general/GetHistos"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    "Origin": "https://www.sikafinance.com",
    "Referer": "https://www.sikafinance.com/",
    "Accept-Language": "fr-FR,fr;q=0.9",
}

# Tickers BRVM connus avec leur code pays Sikafinance
# Source : la liste BRVM cours-actions/0 + connaissance des pays d'emission
TICKERS: list[tuple[str, str]] = [
    ("ABJC", "ci"),  # SERVAIR ABIDJAN
    ("BICB", "bj"),  # BANQUE INTERNATIONALE BENIN
    ("BICC", "ci"),  # BICI CI
    ("BNBC", "ci"),  # BERNABE
    ("BOAB", "bj"),  # BOA BENIN
    ("BOABF", "bf"),  # BOA BURKINA FASO
    ("BOAC", "ci"),  # BOA CI
    ("BOAM", "ml"),  # BOA MALI
    ("BOAN", "ne"),  # BOA NIGER
    ("BOAS", "sn"),  # BOA SENEGAL
    ("CABC", "ci"),  # SICABLE
    ("CBIBF", "bf"),  # CORIS BANK BURKINA FASO
    ("CFAC", "ci"),  # CFAO MOTORS
    ("CIEC", "ci"),  # CIE CI
    ("ECOC", "ci"),  # ECOBANK CI
    ("ETIT", "tg"),  # ECOBANK TRANSNATIONAL TOGO
    ("FTSC", "ci"),  # FILTISAC
    ("LNBB", "bj"),  # LOTERIE NATIONALE BENIN
    ("NEIC", "ci"),  # NEI-CEDA
    ("NSBC", "ci"),  # NSIA BANQUE CI
    ("NTLC", "ci"),  # NESTLE CI
    ("ONTBF", "bf"),  # ONATEL BURKINA FASO
    ("ORAC", "ci"),  # ORANGE CI
    ("ORGT", "tg"),  # ORAGROUP TOGO
    ("PALC", "ci"),  # PALM CI
    ("PRSC", "ci"),  # TRACTAFRIC MOTORS CI
    ("SAFC", "ci"),  # SAFCA
    ("SCRC", "ci"),  # SUCRIVOIRE
    ("SDCC", "ci"),  # SODE
    ("SDSC", "ci"),  # AFRICA GLOBAL LOGISTICS
    ("SEMC", "ci"),  # EVIOSYS PACKAGING SIEM
    ("SGBC", "ci"),  # SOCIETE GENERALE CI
    ("SHEC", "ci"),  # VIVO ENERGY CI
    ("SIBC", "ci"),  # SIB CI
    ("SICC", "ci"),  # SICOR
    ("SIVC", "ci"),  # ERIUM CI (ex SOLIBRA SARL)
    ("SLBC", "ci"),  # SOLIBRA
    ("SMBC", "ci"),  # SMB CI
    ("SNTS", "sn"),  # SONATEL SENEGAL
    ("SOGC", "ci"),  # SOGB
    ("SPHC", "ci"),  # SAPH
    ("STAC", "ci"),  # SETAO
    ("STBC", "ci"),  # SITAB
    ("TTLC", "ci"),  # TOTALENERGIES MARKETING CI
    ("TTLS", "sn"),  # TOTALENERGIES MARKETING SENEGAL
    ("UNLC", "ci"),  # UNILEVER CI
    ("UNXC", "ci"),  # UNIWAX
]

# Indices BRVM : sur Sika, les indices s'utilisent SANS suffixe pays
# (code pays vide), URL = /marches/historiques/<TICKER> directement.
INDICES: list[tuple[str, str]] = [
    ("BRVMC", ""),     # BRVM Composite
    ("BRVM30", ""),    # BRVM 30
    ("BRVMPR", ""),    # BRVM Prestige
    ("BRVMPA", ""),    # BRVM Principal
    ("BRVM-CB", ""),   # Consommation de Base
    ("BRVM-CD", ""),   # Consommation Discretionnaire
    ("BRVM-EN", ""),   # Energie
    ("BRVM-IN", ""),   # Industriels
    ("BRVM-SF", ""),   # Services Financiers
    # BRVM-SP volontairement absent : Sikafinance ne publie pas cet indice
    # (teste sous 10 variantes de ticker, toutes en "nodata") et ne renvoie
    # qu'une fenetre de janvier 2025. Comme ce script REECRIT chaque fichier
    # integralement, l'inclure retronquait BRVM-SP.csv a 20 lignes a chaque
    # passage, effacant l'historique reconstitue depuis les BOC. Cet indice
    # est alimente par scripts/update_index_history_live.py.
    ("BRVM-TEL", ""),  # Telecommunications
]

# Format ISO YYYY-MM-DD attendu par l'API
DATE_FMT_API = "%Y-%m-%d"

# Tranche de 89 jours (sous la limite serveur de "3 mois")
CHUNK_DAYS_DEFAULT = 89


def fetch_chunk(
    session: requests.Session,
    ticker_full: str,
    date_deb: date,
    date_fin: date,
    xperiod: str = "0",
) -> tuple[list[dict], Optional[str]]:
    """Une requete POST → liste de lignes + erreur eventuelle."""
    payload = {
        "ticker": ticker_full,
        "datedeb": date_deb.strftime(DATE_FMT_API),
        "datefin": date_fin.strftime(DATE_FMT_API),
        "xperiod": xperiod,
    }
    try:
        r = session.post(API_URL, json=payload, timeout=30)
        r.raise_for_status()
        data = r.json()
        return data.get("lst") or [], data.get("error") or None
    except (requests.RequestException, ValueError) as e:
        return [], f"requestException:{e}"


def parse_dmy(s: str) -> tuple[int, int, int]:
    """'DD/MM/YYYY' → (year, month, day) pour le tri. (0,0,0) si invalide."""
    parts = s.split("/")
    if len(parts) != 3:
        return (0, 0, 0)
    try:
        d_, m_, y_ = parts
        return (int(y_), int(m_), int(d_))
    except ValueError:
        return (0, 0, 0)


def scrape_ticker(
    ticker: str,
    country: str,
    out_dir: Path,
    chunk_days: int = CHUNK_DAYS_DEFAULT,
    max_empty_streak: int = 8,
    delay_between_chunks: float = 0.3,
    verbose: bool = False,
) -> tuple[str, int, str]:
    """
    Scrape l'historique complet du ticker en remontant par tranches.
    Retourne (ticker_full, nb_lignes, status).
    """
    # Pour les indices, country="" → pas de suffixe pays dans l'URL/ticker
    ticker_full = f"{ticker}.{country}" if country else ticker
    session = requests.Session()
    session.headers.update(HEADERS)
    session.headers["Referer"] = (
        f"https://www.sikafinance.com/marches/historiques/{ticker_full}"
    )

    rows: dict[str, dict] = {}  # dedup par date
    cur_end = date.today()
    empty_streak = 0
    chunks_fetched = 0
    last_error: Optional[str] = None
    cur_chunk_days = chunk_days

    while empty_streak < max_empty_streak:
        cur_start = cur_end - timedelta(days=cur_chunk_days)
        lst, err = fetch_chunk(session, ticker_full, cur_start, cur_end)
        chunks_fetched += 1

        if err == "toolong":
            # Fenetre trop large : reduit
            cur_chunk_days = max(45, cur_chunk_days - 15)
            if verbose:
                print(
                    f"  [{ticker_full}] toolong, reduit a {cur_chunk_days}j",
                    file=sys.stderr,
                )
            continue

        if err and err != "nodata":
            last_error = err
            if verbose:
                print(f"  [{ticker_full}] erreur: {err}", file=sys.stderr)
            # Re-essaie une fois apres delai, puis abandonne le ticker
            time.sleep(2)
            lst, err = fetch_chunk(session, ticker_full, cur_start, cur_end)
            chunks_fetched += 1
            if err and err != "nodata":
                break

        if lst:
            empty_streak = 0
            for row in lst:
                d = row.get("Date") or ""
                if d:
                    rows[d] = row
        else:
            empty_streak += 1

        # Avance la fenetre vers le passe : 1 jour avant la precedente
        cur_end = cur_start - timedelta(days=1)
        time.sleep(delay_between_chunks)

    if not rows:
        status = f"no data ({chunks_fetched} chunks, last_err={last_error})"
        return ticker_full, 0, status

    sorted_dates = sorted(rows.keys(), key=parse_dmy)
    out_path = out_dir / f"{ticker_full}.csv"

    # Garde-fou anti-troncature. Le fichier est reecrit integralement : si la
    # source se tarit (ticker retire, renomme, ou API qui ne remonte plus qu'une
    # fenetre partielle), un scrape "reussi" mais incomplet effacerait
    # silencieusement des annees d'historique. On refuse d'ecrire un fichier
    # nettement plus court que l'existant. Cas vecu : BRVM-SP, ramene de 403 a
    # 20 lignes a chaque passage parce que Sika ne publie plus cet indice.
    if out_path.exists():
        try:
            with out_path.open(encoding="utf-8-sig") as f:
                existing = max(0, sum(1 for _ in f) - 1)
        except OSError:
            existing = 0
        if existing > 20 and len(sorted_dates) < existing * 0.9:
            return (
                ticker_full,
                len(sorted_dates),
                f"IGNORE : {len(sorted_dates)} lignes scrapees contre {existing} "
                f"existantes — fichier conserve (source incomplete ?)",
            )
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(
            ["date_iso", "date_fr", "open", "high", "low", "close", "volume"]
        )
        for dfr in sorted_dates:
            row = rows[dfr]
            y, m, d_ = parse_dmy(dfr)
            iso = f"{y:04d}-{m:02d}-{d_:02d}" if y else ""
            writer.writerow(
                [
                    iso,
                    dfr,
                    row.get("Open", ""),
                    row.get("High", ""),
                    row.get("Low", ""),
                    row.get("Close", ""),
                    row.get("Volume", ""),
                ]
            )

    return ticker_full, len(sorted_dates), f"{chunks_fetched} chunks"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape l'historique complet des titres BRVM depuis Sikafinance.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Exemple: python scrape_sika_history.py --only BOAC --workers 1",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Dossier de sortie (defaut: data/historique_sika ou data/historique_sika_indices avec --indices)",
    )
    parser.add_argument(
        "--indices",
        action="store_true",
        help="Scrape les indices BRVM (BRVMC, BRVM30, BRVM-SF...) au lieu des actions",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Workers paralleles (defaut: 4 — gardez bas pour respecter Sika)",
    )
    parser.add_argument(
        "--only",
        nargs="*",
        help="Limiter a certains tickers (sans le code pays). Ex: --only BOAC SNTS",
    )
    parser.add_argument(
        "--max-empty",
        type=int,
        default=8,
        help="Nombre de fenetres vides consecutives avant arret (defaut: 8 ≈ 2 ans)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.3,
        help="Delai (s) entre 2 requetes du meme ticker (defaut: 0.3)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Affiche les erreurs intermediaires",
    )
    args = parser.parse_args()

    # Choix de la source : actions (defaut) ou indices
    source_list = INDICES if args.indices else TICKERS
    out_dir = args.out_dir or (
        Path("data/historique_sika_indices")
        if args.indices
        else Path("data/historique_sika")
    )

    tickers = source_list
    if args.only:
        wanted = {t.upper() for t in args.only}
        tickers = [(t, c) for t, c in source_list if t.upper() in wanted]
        missing = wanted - {t.upper() for t, _ in tickers}
        if missing:
            print(
                f"ATTENTION : tickers inconnus ignores: {sorted(missing)}",
                file=sys.stderr,
            )

    if not tickers:
        print("Aucun ticker a traiter.", file=sys.stderr)
        sys.exit(1)

    kind = "indices" if args.indices else "actions"
    print(
        f"Scraping {len(tickers)} {kind} vers {out_dir} "
        f"(workers={args.workers}, delay={args.delay}s)",
        file=sys.stderr,
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    results: list[tuple[str, int, str]] = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(
                scrape_ticker,
                t,
                c,
                out_dir,
                CHUNK_DAYS_DEFAULT,
                args.max_empty,
                args.delay,
                args.verbose,
            ): (f"{t}.{c}" if c else t)
            for t, c in tickers
        }
        for fut in as_completed(futures):
            try:
                ticker, nb, status = fut.result()
                results.append((ticker, nb, status))
                tag = "OK" if nb > 0 else "--"
                print(f"  [{tag}] {ticker:14s} {nb:6d} lignes  ({status})")
            except Exception as e:
                print(f"  [KO] {futures[fut]:14s} echec: {e}", file=sys.stderr)
                results.append((futures[fut], 0, f"exception:{e}"))

    # Recap final
    total_lines = sum(nb for _, nb, _ in results)
    ok_count = sum(1 for _, nb, _ in results if nb > 0)
    print(
        f"\nTermine : {ok_count}/{len(results)} {kind} OK, "
        f"{total_lines:,} lignes au total. Fichiers dans {out_dir}/",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()

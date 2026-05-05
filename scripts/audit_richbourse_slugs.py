"""
Audit : repere les slugs RichBourse NON CLASSES mais qui contiennent des
mots-cles financiers, pour detecter d'eventuels patterns d'annonces de
resultats que classify() rate.

Usage :
  python scripts/audit_richbourse_slugs.py
  python scripts/audit_richbourse_slugs.py --tickers SNTS,BOAC --max-pages 10
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from collections import defaultdict

import requests
from bs4 import BeautifulSoup

# Reutilise classify() du scraper principal
sys.path.insert(0, "scripts")
from scrape_richbourse_calendrier import (  # noqa: E402
    INDEX_URL,
    HEADERS,
    fetch_html,
    fetch_tickers,
    classify,
)

# Mots-cles "financiers" qui devraient generalement etre classes :
SUSPICIOUS = (
    "etats-financiers",
    "exercice",
    "resultats",
    "rapport-annuel",
    "rapport-dactivites",
    "rapport-de-gestion",
    "rapport-d-activites",
    "rapport-d-activite",
    "synthese-rapport",
    "synthese-du-rapport",
    "comptes-annuels",
    "comptes-consolides",
    "performance",
    "annuel",
    "trimestre",
    "semestre",
    "dividende",
    "mise-en-paiement",
)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--tickers", default=None, help="liste CSV de tickers (defaut: tous)")
    p.add_argument("--max-pages", type=int, default=20)
    p.add_argument("--delay", type=float, default=0.4)
    p.add_argument("--limit", type=int, default=200, help="max slugs unclassified a afficher")
    args = p.parse_args()

    session = requests.Session()
    all_tickers = fetch_tickers(session)
    if args.tickers:
        wanted = {t.strip().upper() for t in args.tickers.split(",")}
        tickers = [(t, n) for t, n in all_tickers if t.upper() in wanted]
    else:
        tickers = all_tickers
    print(f"{len(tickers)} ticker(s)", flush=True)

    # slug normalise (sans la date prefixe) -> liste de (ticker, slug complet)
    unclassified_pattern_to_examples: dict[str, list[tuple[str, str]]] = defaultdict(list)
    classified_count = 0
    unclassified_count = 0
    unclassified_suspect_count = 0

    for i, (ticker, _) in enumerate(tickers, 1):
        print(f"[{i}/{len(tickers)}] {ticker}", flush=True)
        seen: set[str] = set()
        for page in range(1, args.max_pages + 1):
            url = f"{INDEX_URL}?symbole={ticker}&page={page}"
            html = fetch_html(url, session)
            if not html:
                break
            soup = BeautifulSoup(html, "lxml")
            links = soup.select('a[href^="/common/actualite/details/"]')
            if not links:
                break
            new = 0
            for a in links:
                href = a.get("href") or ""
                slug = href.replace("/common/actualite/details/", "").strip().rstrip("/")
                if not slug or slug in seen:
                    continue
                seen.add(slug)
                new += 1
                cls = classify(slug)
                if cls:
                    classified_count += 1
                    continue
                unclassified_count += 1
                # On ne s'interesse qu'aux slugs qui SEMBLENT financiers
                low = slug.lower()
                if any(k in low for k in SUSPICIOUS):
                    unclassified_suspect_count += 1
                    # Cle de regroupement : on retire la date prefixe et les
                    # numeros (annees) pour repere le PATTERN du slug.
                    pattern = re.sub(r"^\d{2}-\d{2}-\d{4}-", "", low)
                    pattern = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", pattern)
                    pattern = re.sub(r"-\d{4}\b", "-YYYY", pattern)
                    pattern = re.sub(r"\b\d{4}-\d{2}-\d{2}\b", "YYYY-MM-DD", pattern)
                    unclassified_pattern_to_examples[pattern].append((ticker, slug))
            next_li = soup.select_one("li.next a")
            if not next_li or not next_li.get("href") or new == 0:
                break
            time.sleep(args.delay)
        time.sleep(args.delay)

    print()
    print(f"Classes      : {classified_count}")
    print(f"Non classes  : {unclassified_count}")
    print(f"  dont suspects : {unclassified_suspect_count}")
    print()
    print("=" * 80)
    print("Patterns non classes (groupes par forme), tries par frequence :")
    print("=" * 80)
    sorted_patterns = sorted(
        unclassified_pattern_to_examples.items(), key=lambda kv: -len(kv[1])
    )
    shown = 0
    for pattern, examples in sorted_patterns:
        n = len(examples)
        tickers_set = sorted({t for t, _ in examples})
        print(f"\n[{n:3d}] {pattern}")
        print(f"      tickers : {', '.join(tickers_set[:8])}"
              + (f" (+{len(tickers_set)-8})" if len(tickers_set) > 8 else ""))
        # Un exemple complet
        print(f"      ex      : {examples[0][1]}")
        shown += 1
        if shown >= args.limit:
            break

    return 0


if __name__ == "__main__":
    sys.exit(main())

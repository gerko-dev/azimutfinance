#!/usr/bin/env python3
"""
Scrape les emissions UMOA-Titres (3 tableaux) depuis :
https://www.umoatitres.org/fr/agence-umoa-titres-agence-regionale-dappui-a-lemission-a-gestion-titres-publics-lumoa/emissions-professionnels-3/

Sortie :
  - data/umoa-emissions-realisees.csv  (22 colonnes, resultats d'adjudication)
  - data/umoa-emissions-a-venir.csv    (10 colonnes, prochaines emissions)
  - data/umoa-emissions-planifiees.csv (7 colonnes, calendrier annuel)

Tables sources dans le HTML :
  - id="emission-hub-passees"   -> realisees
  - id="emission-hub-avenir"    -> a venir
  - id="emission-hub-planifie"  -> planifiees

Toutes les dates sont normalisees en ISO YYYY-MM-DD.
Tous les nombres FR (12 345,67) sont convertis en decimal point (12345.67).
Le sentinel "--" devient une chaine vide.

Dependances : pip install requests beautifulsoup4 lxml

Usage : python scripts/scrape_umoa_emissions.py
"""

from __future__ import annotations

import csv
import re
import sys
from collections import Counter
from datetime import date as date_cls
from pathlib import Path
from typing import Iterable

import requests
from bs4 import BeautifulSoup, Tag

URL = (
    "https://www.umoatitres.org/fr/"
    "agence-umoa-titres-agence-regionale-dappui-a-lemission-a-gestion-titres-publics-lumoa/"
    "emissions-professionnels-3/"
)

# === REGLES DE NETTOYAGE ===
# Pays canoniques attendus dans le CSV final (apres normalisation).
PAYS_CANONIQUES = {
    "Bénin", "Burkina Faso", "Côte d'Ivoire", "Guinée Bissau",
    "Mali", "Niger", "Sénégal", "Togo",
}
# Alias rencontres dans le scraping UMOA-Titres -> forme canonique.
PAYS_ALIASES = {
    "Burkina": "Burkina Faso",
    "Côte d’Ivoire": "Côte d'Ivoire",  # U+2019 -> U+0027 (apostrophe droite)
    "Cote d'Ivoire": "Côte d'Ivoire",
    "Senegal": "Sénégal",
    "Benin": "Bénin",
    "Guinee Bissau": "Guinée Bissau",
    "Guinée-Bissau": "Guinée Bissau",
}
# Plafonds reglementaires UMOA-Titres :
#  - BAT (Bon Assimilable du Tresor) : <= 2 ans (regle UMOA stricte)
#  - OAT (Obligation Assimilable du Tresor) : > 2 ans typiquement, max ~30 ans
BAT_MAX_YEARS = 2.05  # tolerance arrondi
OAT_MAX_YEARS = 50.0
# Bornes plausibles sur les rendements UMOA (les CSV sont en UNITES POURCENT,
# ex 5.5200 = 5,52%, donc bornes en % et non en decimal).
YIELD_MIN_PCT = 0.0
YIELD_MAX_PCT = 30.0
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
}
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

# Fichiers de sortie, ordonnes par usage frequent.
OUT = {
    "emission-hub-passees": DATA_DIR / "umoa-emissions-realisees.csv",
    "emission-hub-avenir": DATA_DIR / "umoa-emissions-a-venir.csv",
    "emission-hub-planifie": DATA_DIR / "umoa-emissions-planifiees.csv",
}

# Mapping ordre des colonnes -> nom canonique. L'ordre suit le <thead> reel
# en sautant les colonnes invisibles (display:none) et utilitaires
# (notexport / icone / filtres). Les visibles + l'etat (display:none mais
# valeur utile) + l'URL "Plus d'infos" sont conserves.
COLS_REALISEES = [
    "_icon",            # 1. <td></td> vide (icone)
    "emetteur",         # 2. Togo + ES (Titre 1)
    "_emetteur_hidden",  # 3. dup hidden
    "instrument",       # 4. BAT / OAT / ES
    "precisions",       # 5. (hidden)
    "dateOperation",    # 6.
    "dateValeur",       # 7.
    "echeance",         # 8.
    "maturiteMois",     # 9.
    "differeAnnee",     # 10.
    "montantM",         # 11. montant emis (millions FCFA)
    "montantSoumisM",   # 12.
    "montantRetenuM",   # 13.
    "isin",             # 14.
    "tauxInteret",      # 15. (hidden) "multiple" / valeur
    "prixMarginal",     # 16.
    "tauxMarginalPct",  # 17.
    "prixMoyenPondere",  # 18.
    "tauxMoyenPonderePct",  # 19.
    "rendementMoyenPondere",  # 20.
    "typeAmortissement",  # 21.
    "ponderationPct",   # 22.
    "_plusInfos",       # 23. <a>Plus d'infos</a> -> on capture l'href
    "etat",             # 24. (hidden) "realisee" etc.
    "_filtre",          # 25. (hidden)
]
COLS_A_VENIR = [
    "emetteur",
    "instrument",
    "precisions",
    "dateOperation",
    "dateValeur",
    "echeance",
    "maturiteMois",
    "differeAnnee",
    "montantM",
    "_plusInfos",
    "etat",
]
COLS_PLANIFIEES = [
    "emetteur",
    "instrument",
    "precisions",
    "dateOperation",
    "montantM",
    "_plusInfos",
    "etat",
    "_filtre",
]
COLS_BY_TABLE = {
    "emission-hub-passees": COLS_REALISEES,
    "emission-hub-avenir": COLS_A_VENIR,
    "emission-hub-planifie": COLS_PLANIFIEES,
}

# Colonnes finales ecrites au CSV (on remplace les _xxx par leurs valeurs
# derivees : emetteur_pays + emetteur_titre depuis "emetteur" brut, lien
# depuis _plusInfos). On droppe les helpers/duplicats.
FINAL_COLS = {
    "emission-hub-passees": [
        "pays", "titreES", "instrument", "precisions",
        "dateOperation", "dateValeur", "echeance",
        "maturiteMois", "differeAnnee",
        "montantM", "montantSoumisM", "montantRetenuM",
        "isin", "tauxInteret",
        "prixMarginal", "tauxMarginalPct",
        "prixMoyenPondere", "tauxMoyenPonderePct", "rendementMoyenPondere",
        "typeAmortissement", "ponderationPct",
        "etat", "url",
    ],
    "emission-hub-avenir": [
        "pays", "titreES", "instrument", "precisions",
        "dateOperation", "dateValeur", "echeance",
        "maturiteMois", "differeAnnee",
        "montantM",
        "etat", "url",
    ],
    "emission-hub-planifie": [
        "pays", "titreES", "instrument", "precisions",
        "dateOperation", "montantM",
        "etat", "url",
    ],
}


def normalize_date(s: str) -> str:
    """DD/MM/YYYY -> YYYY-MM-DD. Vide / '--' -> ''."""
    if not s or s.strip() in {"--", ""}:
        return ""
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", s.strip())
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return s.strip()


def normalize_number(s: str) -> str:
    """'12 345,67' -> '12345.67' ; '--' / '' -> ''. NBSP-aware."""
    if not s:
        return ""
    t = s.strip().replace("\xa0", " ").replace(" ", " ")
    if t in {"--", "", "NC"}:
        return ""
    # Retire les espaces (separateurs de milliers) et convertit virgule -> point.
    cleaned = re.sub(r"\s", "", t).replace(",", ".")
    # Si c'est un nombre valide, on renvoie tel quel. Sinon, on garde la chaine
    # brute (cas "multiple" pour taux d'interet).
    try:
        float(cleaned)
        return cleaned
    except ValueError:
        return t


def split_emetteur(td: Tag) -> tuple[str, str]:
    """
    Extrait pays + titre ES depuis un <td class="tb-emetteur-contenu">.
    Le format est : <img/> Pays<br><i>ES (Titre N)</i>
    """
    # Texte sans l'image. On separe sur <br>.
    parts: list[str] = []
    for child in td.children:
        if isinstance(child, Tag):
            if child.name == "img":
                continue
            if child.name == "br":
                parts.append("|BR|")
                continue
            parts.append(child.get_text(strip=True))
        else:
            text = str(child).strip()
            if text:
                parts.append(text)
    joined = " ".join(parts).replace("  ", " ").strip()
    if "|BR|" in joined:
        pays, _, titre = joined.partition("|BR|")
        return pays.strip(), titre.strip()
    return joined.strip(), ""


def extract_href(td: Tag) -> str:
    """Extrait l'URL du lien 'Plus d'infos'."""
    a = td.find("a")
    if a and a.has_attr("href"):
        return a["href"].strip()
    return ""


def cell_text(td: Tag) -> str:
    return td.get_text(separator=" ", strip=True).replace("\xa0", " ")


def parse_table(table: Tag, table_id: str) -> list[dict[str, str]]:
    """Parse les <tr> du tbody et renvoie une liste de dicts (colonnes finales)."""
    cols_raw = COLS_BY_TABLE[table_id]
    cols_final = FINAL_COLS[table_id]
    tbody = table.find("tbody")
    if not tbody:
        return []
    rows: list[dict[str, str]] = []
    for tr in tbody.find_all("tr", recursive=False):
        tds = tr.find_all("td", recursive=False)
        if len(tds) < len(cols_raw):
            # Ligne malformee : skip mais log.
            print(
                f"  [{table_id}] ligne ignoree : {len(tds)} td vs {len(cols_raw)} attendus",
                file=sys.stderr,
            )
            continue
        record: dict[str, str] = {}
        for col_name, td in zip(cols_raw, tds):
            if col_name == "_icon" or col_name == "_emetteur_hidden" or col_name == "_filtre":
                continue
            if col_name == "emetteur":
                pays, titre_es = split_emetteur(td)
                record["pays"] = pays
                record["titreES"] = titre_es
                continue
            if col_name == "_plusInfos":
                record["url"] = extract_href(td)
                continue
            record[col_name] = cell_text(td)

        # Normalisations
        for date_col in ("dateOperation", "dateValeur", "echeance"):
            if date_col in record:
                record[date_col] = normalize_date(record[date_col])
        for num_col in (
            "maturiteMois", "differeAnnee",
            "montantM", "montantSoumisM", "montantRetenuM",
            "prixMarginal", "tauxMarginalPct",
            "prixMoyenPondere", "tauxMoyenPonderePct", "rendementMoyenPondere",
            "ponderationPct",
        ):
            if num_col in record:
                record[num_col] = normalize_number(record[num_col])
        # tauxInteret peut valoir "multiple", un sentinel "--", ou un nombre.
        # On normalise les nombres pour la coherence (virgule -> point), mais
        # on conserve "multiple" tel quel (texte semantique).
        if "tauxInteret" in record:
            t = record["tauxInteret"].strip()
            if t.lower() == "multiple":
                record["tauxInteret"] = t
            else:
                record["tauxInteret"] = normalize_number(t)

        # Sentinel "--" -> chaine vide pour les colonnes texte.
        for k, v in list(record.items()):
            if v.strip() in {"--", "—"}:
                record[k] = ""

        # On limite aux colonnes finales attendues.
        rows.append({c: record.get(c, "") for c in cols_final})
    return rows


def parse_iso(s: str) -> date_cls | None:
    if not s:
        return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s.strip())
    if not m:
        return None
    try:
        return date_cls(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def try_float(s: str) -> float | None:
    if not s:
        return None
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def clean_rows(
    rows: list[dict[str, str]],
    table_id: str,
) -> tuple[list[dict[str, str]], dict[str, int]]:
    """
    Applique les regles de nettoyage UMOA-Titres en place :
      1. Normalise les pays via PAYS_ALIASES ("Burkina" -> "Burkina Faso", etc.)
      2. Filtre les lignes : pays inconnu, dates absentes/incoherentes, montants
         <= 0, rendements hors borne.
      3. Reclasse les BAT avec maturite > 2 ans en OAT (erreur de saisie cote
         UMOA, 5 lignes observees).

    Retourne (rows_cleanees, stats) ou stats est un compteur par categorie.
    """
    stats: Counter[str] = Counter()
    cleaned: list[dict[str, str]] = []

    # Plus le tableau est detaille (realisees), plus les regles sont strictes.
    is_realisees = table_id == "emission-hub-passees"

    for row in rows:
        # 1. Normalisation pays (toujours, sur les 3 tables).
        pays = row.get("pays", "").strip()
        if pays in PAYS_ALIASES:
            row["pays"] = PAYS_ALIASES[pays]
            pays = row["pays"]
            stats["pays_normalise"] += 1

        if not pays:
            stats["pays_vide"] += 1
            continue
        if pays not in PAYS_CANONIQUES:
            stats["pays_inconnu"] += 1
            continue

        # 2. Date d'operation : obligatoire pour toutes les tables.
        date_op = row.get("dateOperation", "").strip()
        if not date_op or not parse_iso(date_op):
            stats["dateOperation_invalide"] += 1
            continue

        # 3. Verifications supplementaires pour les realisees (qui ont les
        #    champs dateValeur / echeance / montants / rendement).
        if is_realisees:
            d_val = parse_iso(row.get("dateValeur", ""))
            d_ech = parse_iso(row.get("echeance", ""))
            if not d_val or not d_ech:
                stats["dates_manquantes_realisees"] += 1
                continue
            if d_val >= d_ech:
                stats["dateValeur_apres_echeance"] += 1
                continue
            years = (d_ech - d_val).days / 365.25
            if years <= 0 or years > OAT_MAX_YEARS:
                stats["maturite_hors_borne"] += 1
                continue
            # Reclassification BAT trop long -> OAT.
            if row.get("instrument", "").strip().upper() == "BAT" and years > BAT_MAX_YEARS:
                row["instrument"] = "OAT"
                stats["bat_reclasse_en_oat"] += 1

            # Montant retenu : doit etre > 0 (sinon emission echouee/annulee).
            ret = try_float(row.get("montantRetenuM", ""))
            if ret is None or ret <= 0:
                stats["montant_retenu_invalide"] += 1
                continue
            # Rendement moyen pondere : doit etre dans [0 ; 30%]. Les CSV sont
            # publies en UNITES POURCENT (5.5200 = 5,52%).
            yld = try_float(row.get("rendementMoyenPondere", ""))
            if yld is None or yld <= YIELD_MIN_PCT or yld > YIELD_MAX_PCT:
                stats["rendement_hors_borne"] += 1
                continue

        cleaned.append(row)

    return cleaned, dict(stats)


def write_csv(path: Path, cols: list[str], rows: Iterable[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, delimiter=";")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def main() -> int:
    print(f"GET {URL}", file=sys.stderr)
    r = requests.get(URL, headers=HEADERS, timeout=60)
    r.raise_for_status()
    html = r.text
    print(f"  -> {len(html):,} bytes", file=sys.stderr)

    soup = BeautifulSoup(html, "lxml")

    total_in = 0
    total_out = 0
    for table_id, out_path in OUT.items():
        table = soup.find("table", id=table_id)
        if not table:
            print(f"!! Table #{table_id} introuvable", file=sys.stderr)
            continue
        raw_rows = parse_table(table, table_id)
        # Nettoyage : applique normalisations + filtres + reclassifications
        # AVANT ecriture CSV. Le CSV de sortie est donc deja propre, sans
        # filtrage runtime cote TS.
        cleaned_rows, stats = clean_rows(raw_rows, table_id)
        cols = FINAL_COLS[table_id]
        write_csv(out_path, cols, cleaned_rows)
        rel = out_path.relative_to(ROOT)
        kept = len(cleaned_rows)
        in_n = len(raw_rows)
        dropped = in_n - kept
        print(
            f"  {table_id:24s} -> {kept:4d}/{in_n} lignes "
            f"({dropped} filtrees) -> {rel}",
            file=sys.stderr,
        )
        if stats:
            for cat, n in sorted(stats.items(), key=lambda kv: -kv[1]):
                tag = "  ↳ "
                # Distinguer les normalisations (pas un drop) des filtres.
                if cat in {"pays_normalise", "bat_reclasse_en_oat"}:
                    tag = "  + "
                print(f"{tag}{cat:32s} {n}", file=sys.stderr)
        total_in += in_n
        total_out += kept

    print(
        f"\nTotal : {total_out}/{total_in} emissions conservees apres nettoyage.",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

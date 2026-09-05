#!/usr/bin/env python3
"""
Scrape le Bulletin Officiel de la Cote (BOC) de la BRVM pour capter :
  1) Les valeurs nominales courantes des obligations cotees (table
     "OBLIGATIONS CLASSIQUES").
  2) La synthese journaliere du marche obligataire en page 1 :
     capitalisation boursiere, volume echange, valeur transigee.
  3) Le tableau des FCP / SICAV (derniere page du BOC) : gestionnaire,
     nom du fonds, nominal, valeur precedente + valeur du jour + dates,
     date d'emission, performance origine, variation jour.

URLs (par ordre de priorite) :
    1. https://bfin.brvm.org/boc/BOC_JOUR/BOC_YYYYMMDD.pdf
    2. https://bfin.brvm.org/boc/BOC_JOUR/BOC_YYYYMMDD_2.pdf

Sorties :
    - data/obligations-cotees-vn-boc.csv  : audit VN par mnemonique
    - data/obligations-cotees-boc-synthese.json : KPIs marche obligataire
    - data/fcp.csv                              : tableau FCP / SICAV
    - data/obligations-cotees.csv : maj colonne nominalValue (avec --merge)
    - data/obligations-cotees-prix.csv : backfill volume + transactions des
      lignes du jour (avec --merge) — cf. scrape_brvm_bond_prices.py
    - data/obligations-cotees-boc-statut.csv : statut de chaque mnemonique au
      BOC — "cotee" (ligne de cotation reelle) ou "annoncee" (avis de premiere
      cotation, donc avant le premier echange). Alimente le controle de
      coherence de /admin/sources.

Dependances :
    pip install requests pypdf

Usage :
    python scripts/scrape_brvm_boc.py            # date du jour (avec fallback j-1, j-2...)
    python scripts/scrape_brvm_boc.py 20260508   # date precise
    python scripts/scrape_brvm_boc.py --merge    # injecte les VN dans obligations-cotees.csv
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import unicodedata
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import requests

try:
    import pypdf
except ImportError:
    print("Erreur : `pypdf` requis. `pip install pypdf`", file=sys.stderr)
    sys.exit(1)


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept": "application/pdf,*/*",
}

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
BONDS_CSV = DATA_DIR / "obligations-cotees.csv"
OUTPUT_CSV = DATA_DIR / "obligations-cotees-vn-boc.csv"
SYNTHESE_JSON = DATA_DIR / "obligations-cotees-boc-synthese.json"
FCP_CSV = DATA_DIR / "fcp.csv"
# Historique des cours obligataires : alimente a 15h par
# scripts/scrape_brvm_bond_prices.py (clean + dirty price) ; les colonnes
# volume / transactions sont completees ici le soir, une fois le BOC publie.
PRICES_CSV = DATA_DIR / "obligations-cotees-prix.csv"
PRICE_COLUMNS = [
    "isin", "date", "cleanPrice", "dirtyPrice", "volume", "valeurTransigee",
]
# Referentiel OPCVM pour enrichissement (gestionnaire canonique + type + categorie).
# Encode Latin-1 (Excel FR), separateur ";".
AUMFCP_CSV = DATA_DIR / "fcp" / "aumfcp.csv"

# Liste des societes de gestion connues (figurent une fois par groupe sur la
# derniere page du BOC, puis les lignes suivantes du groupe ne reprennent
# que le nom du FCP). Si une nouvelle SDG apparait, l'ajouter ici.
KNOWN_GESTIONNAIRES = [
    "ATLANTIC ASSET MANAGEMENT ATLANTIQUE FINANCE",
    "BOA ASSET MANAGEMENT BOA CAPITAL SECURITIES",
    "ENKO CAPITAL WEST AFRICA EDC Investment Corporation",
    "IMPAXIS ASSET MANAGEMENT IMPAXIS SECURITIES",
    "SGO MALI FINANCES SGI MALI SA",
    "WAFI CAPITAL S.A. SGI AGI BENIN",
    "BNI GESTION BNI FINANCES",
    "OAM S.A SGI TOGO",
    "SOGESPAR SOGEBOURSE",
    "AFRICABOURSE SA",
    "BRIDGE SECURITIES",
    "NSIA BANQUE CI",
    "AFRICAM SA SBIF",
    "NSIA AM BOA CI",
    "NSIA AM UBA CI",
    "CORIS BOURSE",
    "NSIA FINANCE",
    "UBA CI",
]
# Tri par longueur decroissante pour le matching "longest prefix wins".
KNOWN_GESTIONNAIRES.sort(key=len, reverse=True)

# Mnemonique BRVM (ex EOM.O10, BIDC.O7, SUKSN.S2, FCTC.O1, ...)
SYMBOL_RE = re.compile(r"\b([A-Z]{2,7}\.(?:O|S)\d{1,3})\b")
# Sequence de chiffres avec separateurs (espace simple, NBSP U+00A0, narrow NBSP U+202F).
NUM_RE = re.compile(r"\d{1,3}(?:[   ]\d{3})*(?:[.,]\d+)?")


def boc_url(d: date, fallback: bool) -> str:
    suffix = "_2" if fallback else ""
    return (
        f"https://bfin.brvm.org/boc/BOC_JOUR/BOC_{d.strftime('%Y%m%d')}{suffix}.pdf"
    )


def fetch_boc(d: date) -> bytes | None:
    """Tente l'URL primaire, puis fallback `_2`. Retourne None si rien dispo."""
    for fb in (False, True):
        url = boc_url(d, fb)
        try:
            r = requests.get(url, headers=HEADERS, timeout=30, verify=False)
        except requests.RequestException as e:
            print(f"  [{url}] erreur reseau : {e}", file=sys.stderr)
            continue
        if r.status_code == 200 and r.content[:4] == b"%PDF":
            print(f"  [{url}] OK ({len(r.content):,} octets)", file=sys.stderr)
            return r.content
        print(
            f"  [{url}] HTTP {r.status_code}, "
            f"{'pas un PDF' if r.status_code == 200 else 'absent'}",
            file=sys.stderr,
        )
    return None


def find_latest_boc(start: date, max_lookback: int = 10) -> tuple[date, bytes] | None:
    """Cherche le BOC le plus recent disponible (utile le matin / le week-end)."""
    for i in range(max_lookback):
        d = start - timedelta(days=i)
        # Skip weekends (samedi=5, dimanche=6) — pas de BOC publié.
        if d.weekday() >= 5:
            continue
        print(f"Tentative BOC du {d.isoformat()}...", file=sys.stderr)
        pdf = fetch_boc(d)
        if pdf is not None:
            return d, pdf
    return None


def parse_french_number(s: str) -> float | None:
    """'10 000' -> 10000.0, '9 795,50' -> 9795.5"""
    if not s:
        return None
    cleaned = re.sub(r"[   ]", "", s).replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_text(pdf_bytes: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(p.extract_text() or "" for p in reader.pages)


def extract_nominal_values(text: str) -> dict[str, float]:
    """
    Pour chaque mnemonique trouve dans le texte, extrait le premier nombre
    "rond" (>= 1000, sans decimales) qui suit, c'est la Valeur nominale.

    Le nombre suivant la VN est le "cours precedent" (peut etre identique).
    On evite les colonnes "Coupon couru" (decimales typiques) et "Volume"
    (souvent "NC" = Non Cote).
    """
    out: dict[str, float] = {}

    # Le PDF coupe parfois "ETAT DU SENEGAL 6,15 % 2023-\n2030\n    10 000 ..."
    # On nettoie en remplacant les retours a la ligne par des espaces, sauf
    # quand un nouveau mnemonique commence (= debut de nouvelle ligne).
    # Strategie : parcourir les positions des mnemoniques et capturer le
    # bloc entre deux mnemoniques.
    matches = list(SYMBOL_RE.finditer(text))
    if not matches:
        return out

    for i, m in enumerate(matches):
        sym = m.group(1)
        # Le PDF reaffiche les memes mnemoniques sur d'autres pages (sections
        # par echeance, coupons courus, etc.) avec une seule colonne tronquee
        # qui ferait piquer la mauvaise VN. On ne garde que la premiere
        # occurrence (table principale "OBLIGATIONS CLASSIQUES", page ~5).
        if sym in out:
            continue
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start:end]
        # Premier nombre dans le chunk qui ressemble a une VN (entier >= 1000).
        # Les VN sont des entiers entre 1000 et 100 000 typiquement. On evite
        # les coupons courus (decimales) et les petits nombres (volumes, durees).
        for nm in NUM_RE.finditer(chunk):
            val = parse_french_number(nm.group(0))
            if val is None:
                continue
            if 1000 <= val <= 100000 and val == int(val):
                out[sym] = val
                break

    return out


def extract_market_synthesis(text: str) -> dict[str, float] | None:
    """
    Page 1 du BOC, section "Obligations Niveau Evol. Jour" :
        Capitalisation boursiere (FCFA)   12 325 280 488 887 0,01 %
        Volume echange      405 368
        Valeur transigee (FCFA)    4 018 875 283
    On ancre sur le header "Obligations Niveau Evol. Jour" (qui suit la section
    Actions) puis on cherche les 3 chiffres dans les ~800 caracteres suivants.
    """
    anchor = re.search(
        r"Obligations\s+Niveau\s+Evol\.?\s*Jour", text, re.IGNORECASE
    )
    if not anchor:
        return None

    chunk = text[anchor.end() : anchor.end() + 1000]

    # Sequence de chiffres avec separateurs (espace, NBSP, narrow NBSP).
    NUM = r"(\d{1,3}(?:[   ]\d{3})*(?:[.,]\d+)?)"

    cap_m = re.search(
        r"Capitalisation\s+boursi[èe]re\s*\(FCFA\)\s*" + NUM,
        chunk,
        re.IGNORECASE,
    )
    vol_m = re.search(
        r"Volume\s+[ée]chang[ée]\s*" + NUM, chunk, re.IGNORECASE
    )
    val_m = re.search(
        r"Valeur\s+transig[ée]e\s*\(FCFA\)\s*" + NUM,
        chunk,
        re.IGNORECASE,
    )

    if not (cap_m and vol_m and val_m):
        missing = [
            n
            for n, m in [("cap", cap_m), ("vol", vol_m), ("val", val_m)]
            if not m
        ]
        print(
            f"  Synthese partielle, manque : {', '.join(missing)}",
            file=sys.stderr,
        )
        return None

    cap = parse_french_number(cap_m.group(1))
    vol = parse_french_number(vol_m.group(1))
    val = parse_french_number(val_m.group(1))
    if cap is None or vol is None or val is None:
        return None

    return {
        "capitalisationBoursiere": cap,
        "volumeEchange": vol,
        "valeurTransigee": val,
    }


def write_synthese_json(synth: dict[str, float], boc_date: date) -> None:
    payload = {
        "bocDate": boc_date.isoformat(),
        "capitalisationBoursiere": int(synth["capitalisationBoursiere"]),
        "volumeEchange": int(synth["volumeEchange"]),
        "valeurTransigee": int(synth["valeurTransigee"]),
    }
    SYNTHESE_JSON.parent.mkdir(parents=True, exist_ok=True)
    SYNTHESE_JSON.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        f"Synthese ecrite dans {SYNTHESE_JSON.relative_to(ROOT)} : "
        f"cap={payload['capitalisationBoursiere']:,} FCFA, "
        f"vol={payload['volumeEchange']:,}, "
        f"val={payload['valeurTransigee']:,} FCFA".replace(",", " "),
        file=sys.stderr,
    )


def write_output_csv(values: dict[str, float], boc_date: date) -> None:
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["code", "valeurNominale", "bocDate"])
        for sym in sorted(values):
            w.writerow([sym, int(values[sym]), boc_date.isoformat()])
    print(
        f"\n{len(values)} VN ecrites dans {OUTPUT_CSV.relative_to(ROOT)}",
        file=sys.stderr,
    )


def merge_into_bonds_csv(values: dict[str, float]) -> None:
    """Met a jour la colonne `nominalValue` du CSV obligations-cotees.csv pour
    chaque code present dans le BOC. Conserve les autres colonnes intactes."""
    if not BONDS_CSV.exists():
        print(f"Erreur : {BONDS_CSV} introuvable.", file=sys.stderr)
        return
    raw = BONDS_CSV.read_text(encoding="utf-8")
    if raw.startswith("﻿"):
        raw = raw[1:]
    lines = raw.splitlines()
    if not lines:
        return
    header = lines[0].split(";")
    try:
        code_idx = header.index("code")
        vn_idx = header.index("nominalValue")
    except ValueError as e:
        print(f"Erreur : colonne manquante dans le CSV : {e}", file=sys.stderr)
        return

    updated = 0
    out_lines = [lines[0]]
    for line in lines[1:]:
        if not line.strip():
            out_lines.append(line)
            continue
        cols = line.split(";")
        if len(cols) <= max(code_idx, vn_idx):
            out_lines.append(line)
            continue
        code = cols[code_idx].strip()
        if code in values:
            new_vn = str(int(values[code]))
            if cols[vn_idx] != new_vn:
                cols[vn_idx] = new_vn
                updated += 1
        out_lines.append(";".join(cols))

    BONDS_CSV.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    print(
        f"{updated} lignes mises a jour dans {BONDS_CSV.relative_to(ROOT)}",
        file=sys.stderr,
    )


# ============================================================
# VOLUME / TRANSACTIONS PAR OBLIGATION — table "OBLIGATIONS CLASSIQUES"
# ============================================================
# Structure d'une ligne du BOC (apres le mnemonique) :
#   <Titre> <VN> <CoursPrec> <CoursJour|NC|SP> <CoursRef> [<Volume> <Valeur>]
#   <CouponCouru> <Periode A|S|T> <MontantNet> <Ech.> <TypeAmort IF|AC|ACD>
# Les colonnes Volume + Valeur n'existent que si l'obligation a ete cotee
# (sinon "Cours du jour" = NC = Non Cote, ou SP = Suspendu).
#
# On ancre sur la "queue" (CouponCouru Periode MontantNet Ech. TypeAmort), tres
# reguliere : CouponCouru et MontantNet sont des montants par titre toujours
# < 10 000 et a virgule, donc sans separateur de milliers -> pas d'ambiguite.
# Tout ce qui precede la queue = <Titre ...VN CoursPrec CoursJour CoursRef
# [Volume Valeur]>. Si "NC"/"SP" y figure -> pas de transaction (0, 0). Sinon,
# Volume et Valeur sont les deux dernieres "colonnes" (separees par 2+ espaces).

# CouponCouru / MontantNet : montant par titre, < 10 000, a virgule, sans
# espace -> pas d'ambiguite avec les separateurs de milliers. On n'ancre pas en
# fin de chunk : un saut de page peut coller un pied de page / entete apres la
# ligne, donc on prend la 1ere occurrence (le motif est assez specifique pour
# ne matcher que la vraie queue).
BOND_TAIL_RE = re.compile(
    r"\s\d{1,4}[.,]\d+\s+[AST]\s+\d{1,4}[.,]\d+\s+"
    r"\d{1,2}-[^\s-]+-\d{2,4}\s+(?:IF|AC|ACD)\b"
)


# Avis de premiere cotation : "... (EOS.O34), ... (EOS.O37) - Premiere cotation
# le 08 septembre 2026". C'est le signal UTILE pour alimenter le referentiel :
# il arrive AVANT que l'obligation ne traite, donc avec de l'avance.
MOIS_FR = {
    "janvier": 1, "fevrier": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5,
    "juin": 6, "juillet": 7, "aout": 8, "septembre": 9, "octobre": 10,
    "novembre": 11, "decembre": 12,
}
NOTICE_SYMBOL_RE = re.compile(r"\(([A-Z]{2,7}\.(?:O|S)\d{1,3})\)")
NOTICE_RE = re.compile(
    r"Premi[eè]re\s+cotation\s+le\s+(\d{1,2})\s+([A-Za-zà-ÿ]+)\s+(\d{4})",
    re.IGNORECASE,
)


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def extract_first_listing_notices(text: str) -> dict[str, str]:
    """{mnemonique: date ISO de premiere cotation} depuis les avis du BOC.

    Les mnemoniques appartiennent a l'avis qui les SUIT. La fenetre de
    recherche est donc bornee a la fin de l'avis precedent : sans cela un avis
    absorbe les mnemoniques de son voisin (cas du BOC du 03/09/2026, ou les
    quatre EOS etaient attribuees a l'avis des TPBF).
    """
    flat = re.sub(r"\s+", " ", text)
    out: dict[str, str] = {}
    prev_end = 0
    for m in NOTICE_RE.finditer(flat):
        mois = _strip_accents(m.group(2)).lower()
        num = MOIS_FR.get(mois)
        if not num:
            prev_end = m.end()
            continue
        iso = f"{int(m.group(3)):04d}-{num:02d}-{int(m.group(1)):02d}"
        start = max(prev_end, m.start() - 800)
        for code in NOTICE_SYMBOL_RE.findall(flat[start : m.start()]):
            # Un meme titre peut etre annonce plusieurs jours ; on garde la
            # date la plus tardive, qui est la programmation en vigueur.
            if code not in out or iso > out[code]:
                out[code] = iso
        prev_end = m.end()
    return out


def write_boc_status_csv(
    quoted: list[str], notices: dict[str, str], boc_date: date
) -> None:
    """data/obligations-cotees-boc-statut.csv : etat de chaque mnemonique au BOC.

    statut = "cotee"   ligne de cotation reelle dans OBLIGATIONS CLASSIQUES
             "annoncee" avis de premiere cotation, pas encore negociee

    Remplace l'usage detourne de obligations-cotees-vn-boc.csv, qui listait des
    mnemoniques reperes n'importe ou dans le PDF : il ratait 3 des 4 emissions
    annoncees le 04/09/2026 et qualifiait la quatrieme de "cotee" a tort.
    """
    rows: list[tuple[str, str, str]] = []
    for c in sorted(set(quoted)):
        rows.append((c, "cotee", ""))
    for c, iso in sorted(notices.items()):
        if c not in quoted:
            rows.append((c, "annoncee", iso))

    path = DATA_DIR / "obligations-cotees-boc-statut.csv"
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["code", "statut", "premiereCotation", "bocDate"])
        for c, st, iso in rows:
            w.writerow([c, st, iso, boc_date.isoformat()])
    print(
        f"\nStatut BOC : {sum(1 for r in rows if r[1] == 'cotee')} cotees, "
        f"{sum(1 for r in rows if r[1] == 'annoncee')} annoncees "
        f"-> {path.name}",
        file=sys.stderr,
    )


_NUM_HEAD_RE = re.compile(r"^\d{1,3}([.,]\d+)?$")
_NUM_GROUP_RE = re.compile(r"^\d{3}$")
_NUM_LAST_RE = re.compile(r"^\d{3}([.,]\d+)?$")


def _to_number(groups: list[str]) -> float:
    """['5', '899.50'] -> 5899.5"""
    return float("".join(groups).replace(",", "."))


def _all_splits(tokens: list[str], n: int) -> list[list[int]]:
    """Tous les decoupages valides de `tokens` en n nombres a groupement par 3.

    "5 950 6 000 6 000 10 60 000" -> [[5950, 6000, 6000, 10, 60000], ...]
    """
    if n == 0:
        return [[]] if not tokens else []
    res: list[list[int]] = []
    for take in range(1, len(tokens) + 1):
        head = tokens[:take]
        if not _NUM_HEAD_RE.match(head[0]):
            break
        # Les groupes intermediaires font exactement 3 chiffres ; seul le
        # DERNIER peut porter une decimale — "5 899.50" au BOC du 29/07/2026.
        # Sans cette tolerance, une ligne a cours decimal fait echouer tout le
        # decoupage et le code retombe sur le chemin fautif.
        if any(not _NUM_GROUP_RE.match(t) for t in head[1:-1]):
            break
        if len(head) > 1 and not _NUM_LAST_RE.match(head[-1]):
            break
        # "000" n'ouvre pas un nombre : un groupe de milliers ne peut pas etre
        # en tete. Sans cette regle les decoupages se multiplient inutilement.
        if len(head[0]) > 1 and head[0].startswith("0"):
            break
        for rest in _all_splits(tokens[take:], n - 1):
            res.append([_to_number(head)] + rest)
    return res


def _split_numbers(tokens: list[str], n: int) -> list[int] | None:
    """Decoupage UNIQUE en n nombres, ou None s'il y a ambiguite."""
    cands = _all_splits(tokens, n)
    return cands[0] if len(cands) == 1 else None


def _pick_quote(tokens: list[str], nominal: float) -> list[int] | None:
    """Decoupe "cours x3 + volume + montant" colles en espaces simples.

    L'unicite du decoupage ne suffit pas : "3 150 3 150 3 150 38 119 700"
    admet [38][119 700] ET [38 119][700]. On tranche par le PRIX IMPLICITE,
    montant / volume, qui doit tomber dans la fourchette de la seance :

        119 700 / 38     = 3 150   <- coherent avec les cours du jour
        700 / 38 119     = 0,018   <- absurde

    On ne peut pas exiger montant = volume x cours de cloture : le montant
    reflete le cours moyen pondere de la seance. ORGT.O2 au 10/07/2026 traite
    10 946 titres pour 64 711 400 FCFA, soit 5 912 de moyenne, entre la veille
    (5 850) et la cloture (6 200). D'ou une fourchette large plutot qu'une
    egalite.
    """
    best, best_err = None, None
    for c in _all_splits(tokens, 5):
        prec, jour, ref, vol, val = c
        if nominal and not (0.1 * nominal <= jour <= 5 * nominal):
            continue
        if vol <= 0:
            # Pas d'echange : montant nul attendu.
            if val == 0:
                return c
            continue
        implicite = val / vol
        lo = min(prec, jour, ref) * 0.8
        hi = max(prec, jour, ref) * 1.25
        if not (lo <= implicite <= hi):
            continue
        err = abs(implicite - jour) / max(jour, 1)
        if best_err is None or err < best_err:
            best, best_err = c, err
    return best



def extract_bond_volumes(text: str) -> dict[str, tuple[float, float]]:
    """Pour chaque mnemonique de la table principale, extrait (volume, valeur
    transigee). NC / SP / non parsable -> (0.0, 0.0). On ne garde que la
    premiere occurrence de chaque mnemonique (= table OBLIGATIONS CLASSIQUES ;
    le PDF reaffiche les memes symboles ailleurs)."""
    out: dict[str, tuple[float, float]] = {}
    matches = list(SYMBOL_RE.finditer(text))
    for i, m in enumerate(matches):
        sym = m.group(1)
        if sym in out:
            continue
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start:end]
        # Recolle les nombres coupes par un retour a la ligne du PDF
        # (ex "319 068 \n400" -> "319 068 400"), puis aplatit les \n restants.
        chunk = re.sub(r"(\d)[^\S\n]*\n[^\S\n]*(\d)", r"\1 \2", chunk)
        chunk = chunk.replace("\n", " ")

        tail = BOND_TAIL_RE.search(chunk)
        if not tail:
            # Pas une ligne de la table principale (autre section / entete).
            continue
        prefix = chunk[: tail.start()]

        if re.search(r"\b(?:NC|SP)\b", prefix):
            out[sym] = (0.0, 0.0)
            continue

        # Les colonnes sont NORMALEMENT separees par 2+ espaces, un nombre
        # n'utilisant qu'un espace simple pour ses milliers. Volume et Valeur
        # sont alors les deux dernieres cellules.
        cells = [c for c in re.split(r"\s{2,}", prefix.strip()) if c]

        # Mais le BOC colle parfois toute la ligne en espaces simples :
        #
        #   ORGT.O2 ... 5 000   5 950 6 000 6 000 10 60 000   121,12 S ...
        #               ^VN     ^prec ^jour ^ref  ^vol ^montant
        #
        # La derniere cellule porte alors CINQ nombres. Prendre "l'avant
        # derniere cellule" y donnait le NOMINAL comme volume (5 000 au lieu
        # de 10) et un montant concatene de 19 chiffres. Ce defaut avait
        # corrompu 43 des 1 156 seances traitees de
        # data/obligations-cotees-prix.csv — soit 3,7 % des seules lignes
        # portant une information d'echange.
        if cells:
            nominal = 0.0
            if len(cells) >= 2:
                nominal = parse_french_number(cells[-2]) or 0.0
            inline = _pick_quote(cells[-1].split(), nominal)
            if inline is not None:
                out[sym] = (float(inline[3]), float(inline[4]))
                continue

        if len(cells) >= 2:
            volume = parse_french_number(cells[-2])
            valeur = parse_french_number(cells[-1])
            if volume is not None and valeur is not None:
                out[sym] = (volume, valeur)
                continue
        # Ligne cotee mais colonnes illisibles : on n'invente rien.
        out[sym] = (0.0, 0.0)
    return out


def _read_prices_csv() -> list[list[str]]:
    """Lit obligations-cotees-prix.csv -> liste de lignes (sans header).
    Dedoublonne par (isin, date), derniere occurrence gagnante."""
    if not PRICES_CSV.exists():
        return []
    seen: dict[tuple[str, str], list[str]] = {}
    raw = PRICES_CSV.read_text(encoding="utf-8")
    if raw.startswith("﻿"):
        raw = raw[1:]
    reader = csv.reader(io.StringIO(raw), delimiter=";")
    next(reader, None)  # header
    for row in reader:
        if len(row) < 6 or not row[0].strip():
            continue
        seen[(row[0].strip(), row[1].strip())] = row[:6]
    return list(seen.values())


def _write_prices_csv(rows: list[list[str]]) -> None:
    rows.sort(key=lambda r: (r[1], r[0]))
    with PRICES_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(PRICE_COLUMNS)
        w.writerows(rows)


def backfill_bond_prices(
    volumes: dict[str, tuple[float, float]], boc_date: date
) -> None:
    """Complete les colonnes volume / transactions des lignes du BOC dans
    data/obligations-cotees-prix.csv (celles dont la date == boc_date), a partir
    des volumes extraits. Les lignes des autres dates sont laissees intactes."""
    if not PRICES_CSV.exists():
        print(
            f"  {PRICES_CSV.relative_to(ROOT)} absent — backfill volume ignore.",
            file=sys.stderr,
        )
        return
    if not BONDS_CSV.exists():
        return

    # code mnemonique -> isin (cle de jointure avec le CSV des prix).
    code_to_isin: dict[str, str] = {}
    raw = BONDS_CSV.read_text(encoding="utf-8")
    if raw.startswith("﻿"):
        raw = raw[1:]
    reader = csv.DictReader(io.StringIO(raw), delimiter=";")
    for row in reader:
        code = (row.get("code") or "").strip().upper()
        isin = (row.get("isin") or "").strip()
        if code and isin:
            code_to_isin[code] = isin

    isin_vol: dict[str, tuple[float, float]] = {}
    for code, vv in volumes.items():
        isin = code_to_isin.get(code.upper())
        if isin:
            isin_vol[isin] = vv

    date_iso = boc_date.isoformat()
    rows = _read_prices_csv()
    updated = 0
    for row in rows:
        if row[1].strip() != date_iso:
            continue
        vv = isin_vol.get(row[0].strip())
        if vv is None:
            continue
        volume, valeur = vv
        row[4] = str(int(round(volume)))
        row[5] = str(int(round(valeur)))
        updated += 1

    if updated == 0:
        print(
            f"  Backfill volume : aucune ligne du {date_iso} dans "
            f"{PRICES_CSV.relative_to(ROOT)} (snapshot 15h pas encore passe ?).",
            file=sys.stderr,
        )
        return

    _write_prices_csv(rows)
    traded = sum(1 for v in isin_vol.values() if v[0] > 0)
    print(
        f"  Backfill volume : {updated} lignes du {date_iso} mises a jour dans "
        f"{PRICES_CSV.relative_to(ROOT)} ({traded} obligations effectivement cotees).",
        file=sys.stderr,
    )


# ============================================================
# FCP / SICAV — derniere page du BOC
# ============================================================
# Structure d'une ligne :
#   [Gestionnaire?] NOM_DU_FCP NOMINAL VAL_PREV DATE_PREV VAL_DAY DATE_DAY \
#       [DATE_EMISSION] [PERF%] [VAR_JOUR%]
# Le Gestionnaire n'apparait qu'une fois par groupe. Les lignes suivantes du
# meme groupe heritent du dernier Gestionnaire vu. Valeurs/dates peuvent etre
# "ND" si pas dispo. Date d'emission peut etre "DD/MM/YYYY", "Mois. YYYY"
# (ex "Dec. 2013"), ou absente. Perf/var peuvent etre "-".

# Sequence numerique : "5 000", "1 423 826,01", "10000", etc.
_NUM = r"(?:\d{1,3}(?:[   ]\d{3})+(?:[,.]\d+)?|\d+(?:[,.]\d+)?)"
# Date DD/MM/YYYY ou DD/MM/YY
_DATE = r"\d{1,2}/\d{1,2}/\d{2,4}"
# Date "Mois Annee" (formats observes : "Dec. 2013", "Mai. 2021", "Fev.2010",
# "Mars. 2017", "Juil. 2017", "Dec.2012")
_DATE_TEXTE = r"[A-Za-zéèê]+\.?\s*\d{4}"
_DATE_ANY = rf"(?:{_DATE}|{_DATE_TEXTE})"
# Pourcentage : "144,67%", "-0,11%", "0,012%", "0,00%", "-" (vide)
_PCT = r"(?:-|-?\d+(?:[,.]\d+)?%)"

# Codes de categorie observés dans la colonne Catégorie du BOC (suffixe court
# qui ne fait pas partie du nom du fonds). On les utilise pour ancrer la
# decoupe entre OPCVM et data dans le parseur layout-aware.
CAT_CODES = {"D", "A", "M", "OATC", "OCT", "OMLT", "OAT", "OLMT", "O"}

# Mapping code → libelle long (utilise quand on enrichit avec aumfcp).
CAT_TO_LABEL = {
    "D": "Diversifié",
    "A": "Actions",
    "M": "Monétaire (OCT)",
    "OCT": "Monétaire (OCT)",
    "OMLT": "Obligataire (OLMT)",
    "OLMT": "Obligataire (OLMT)",
    "OATC": "Obligataire (OLMT)",
    "OAT": "Obligataire (OLMT)",
    "O": "Obligataire (OLMT)",
}

# Sections du tableau FCP — une seule occurrence par BOC, dans cet ordre.
FREQ_SECTIONS = {
    "QUOTIDIENNES": "Quotidienne",
    "HEBDOMADAIRES": "Hebdomadaire",
    "MENSUELLES": "Mensuelle",
}


def parse_fr_number(s: str) -> float | None:
    """'12 192,88' -> 12192.88 ; 'ND' / '-' / '' -> None."""
    if not s:
        return None
    t = s.strip()
    if t in {"ND", "-", "—", ""}:
        return None
    cleaned = re.sub(r"[   ]", "", t).replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_pct(s: str) -> float | None:
    """'144,67%' -> 144.67 ; '0,012%' -> 0.012 ; '-' / 'ND' / '' -> None."""
    if not s:
        return None
    t = s.strip().rstrip("%").replace(",", ".")
    if t in {"-", "—", "ND", ""}:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def normalize_iso_date(s: str) -> str:
    """DD/MM/YYYY -> YYYY-MM-DD. DD/MM/YY -> 20YY-MM-DD. Texte / ND -> "" ."""
    if not s:
        return ""
    t = s.strip()
    if t in {"ND", "-", ""}:
        return ""
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2,4})$", t)
    if not m:
        # Format texte "Mois Annee" — non normalisable. On garde brut.
        return t
    dd, mm, yyyy = m.groups()
    if len(yyyy) == 2:
        yyyy = "20" + yyyy
    return f"{int(yyyy):04d}-{int(mm):02d}-{int(dd):02d}"


def split_gestionnaire(libelle: str, current: str) -> tuple[str, str]:
    """
    Detecte si `libelle` commence par un gestionnaire connu. Retourne
    (gestionnaire, nom_fcp). Si aucun match, retourne (current, libelle).
    """
    for g in KNOWN_GESTIONNAIRES:
        if libelle.startswith(g + " "):
            return g, libelle[len(g) + 1 :].strip()
        if libelle == g:
            # Ligne degeneree : SDG sans fonds. On garde current.
            return current, libelle
    return current, libelle


def extract_fcp(text: str) -> list[dict[str, str]]:
    """
    Parse la derniere page du BOC (layout-aware) pour extraire les FCP/SICAV.

    Le tableau BOC a 4 colonnes textuelles (Société de gestion | Dépositaire |
    OPCVM | Catégorie) puis 8 colonnes numériques (VL origine, VL précédente +
    date, VL actuelle + date, date d'origine, perf %, var %). Les colonnes
    textuelles sont alignees a des positions fixes detectables depuis l'entete.

    Le tableau est decoupe en 3 sections selon la frequence de calcul de la VL :
      QUOTIDIENNES → freq = "Quotidienne"
      HEBDOMADAIRES → freq = "Hebdomadaire"
      MENSUELLES   → freq = "Mensuelle"

    La Société de gestion peut s'etaler sur 2 lignes (nom long). Le Dépositaire
    n'apparait qu'a la 1ere ligne de chaque groupe. Les lignes suivantes du
    meme groupe heritent du gestionnaire et du depositaire.

    Retourne une liste de dicts avec les champs bruts (gestionnaire,
    depositaire, opcvm, categorieCode, vlOrigine, valeurPrecedente,
    datePrecedente, valeurJour, dateJour, dateOrigine, frequenceCalcul).
    L'enrichissement avec aumfcp.csv (categorie longue, gestionnaire canonique)
    se fait dans enrich_fcp_rows().
    """
    lines = text.splitlines()

    current_freq = ""
    gest_buffer = ""
    current_depo = ""
    rows: list[dict[str, str]] = []

    for raw_line in lines:
        if not raw_line.strip():
            continue
        stripped = raw_line.strip()

        # Section markers (QUOTIDIENNES / HEBDOMADAIRES / MENSUELLES).
        if stripped in FREQ_SECTIONS:
            current_freq = FREQ_SECTIONS[stripped]
            gest_buffer = ""
            current_depo = ""
            continue

        # Skip lignes d'entete (sans donnees numeriques).
        if "Sociétés de gestion" in stripped or "Dépositaire" in stripped:
            continue
        if "OPCVM:" in stripped or "vendredi" in stripped.lower() or "Valeur Liquidative" in stripped:
            continue

        # Split par 2+ espaces consecutifs : preserve la separation des
        # colonnes du layout PDF tout en supportant les valeurs avec un seul
        # espace interne ("5 000", "12 192,88").
        cells = [c.strip() for c in re.split(r"\s{2,}", stripped) if c.strip()]
        if len(cells) < 6:
            # Trop peu de cellules pour etre une ligne de donnees.
            # Possible continuation multi-ligne du gestionnaire seul.
            if len(cells) == 1 and not re.search(r"\d", cells[0]):
                gest_buffer = (gest_buffer + " " + cells[0]).strip() if gest_buffer else cells[0]
            continue

        # Localise le code categorie : 1ere cellule dont la valeur appartient
        # a CAT_CODES. Sert d'ancre pour separer prefix (texte) de data (chiffres).
        cat_idx = -1
        for i, c in enumerate(cells):
            if c in CAT_CODES:
                cat_idx = i
                break
        if cat_idx < 1:
            continue
        # data = cellules apres cat
        data = cells[cat_idx + 1 :]
        if len(data) < 5:
            continue

        cat_code = cells[cat_idx]
        # prefix = tout ce qui est avant cat (au moins l'OPCVM)
        prefix = cells[:cat_idx]
        opcvm_raw = prefix[-1]
        head = prefix[:-1]  # 0, 1, ou 2 cellules avant OPCVM

        # Gestion du gestionnaire / depositaire :
        # - 0 cell  : ligne de continuation (meme groupe)
        # - 1 cell  : continuation multi-ligne du gestionnaire (e.g. "MANAGEMENT")
        #             OU nouveau gestionnaire+depositaire concatenes (rare quirk pypdf)
        # - 2 cells : nouveau groupe (gestionnaire, depositaire)
        if len(head) == 2:
            gest_buffer = head[0]
            current_depo = head[1]
        elif len(head) == 1:
            # Si le cell ne contient pas de mot-cle de SDG/depo, on l'ajoute au
            # gestionnaire (continuation multi-ligne). Sinon on suppose un
            # nouveau groupe ou hybride — on remplace le gestionnaire.
            gest_buffer = (gest_buffer + " " + head[0]).strip() if gest_buffer else head[0]

        # Parse data : vl_orig, val_prec, date_prec, val_day, date_day, [date_orig]
        vl_orig = data[0]
        val_prec = data[1]
        date_prec = data[2]
        val_day = data[3]
        date_day = data[4]
        date_orig = data[5] if len(data) > 5 else ""

        if not opcvm_raw:
            continue

        rows.append(
            {
                "gestionnaire": gest_buffer.strip(),
                "depositaire": current_depo,
                "opcvm": opcvm_raw,
                "categorieCode": cat_code,
                "frequenceCalcul": current_freq,
                "vlOrigine": str(int(parse_fr_number(vl_orig) or 0)) if parse_fr_number(vl_orig) else "",
                "valeurPrecedente": _fmt_num(parse_fr_number(val_prec)),
                "datePrecedente": normalize_iso_date(date_prec),
                "valeurJour": _fmt_num(parse_fr_number(val_day)),
                "dateJour": normalize_iso_date(date_day),
                "dateOrigine": normalize_iso_date(date_orig),
            }
        )

    return rows


def _fmt_num(n: float | None) -> str:
    if n is None:
        return ""
    # 2 decimales (pas plus) pour les valeurs liquidatives. Strip trailing zeroes.
    return f"{n:.4f}".rstrip("0").rstrip(".")


def _fmt_pct(n: float | None) -> str:
    if n is None:
        return ""
    return f"{n:.4f}".rstrip("0").rstrip(".")


# Inference de la categorie a partir du suffixe BOC (utilise quand aucun
# match aumfcp n'est trouve). Cle = suffixe alphanumerique en fin de nom.
BOC_SUFFIX_TO_CAT = {
    "D": "Diversifié",
    "A": "Actions",
    "M": "Monétaire (OCT)",
    "OCT": "Monétaire (OCT)",
    "OMLT": "Obligataire (OLMT)",
    "OLMT": "Obligataire (OLMT)",
    "OATC": "Obligataire (OLMT)",
    "OAT": "Obligataire (OLMT)",
    "O": "Obligataire (OLMT)",
}


# Aliases manuels BOC -> aumfcp pour les cas non resolubles par tokenisation
# (abreviations pays, sigles divergents). Cle = _normalize_name(boc), valeur =
# _normalize_name(aumfcp). Verifie par audit : tout match ajoute ici doit
# pointer sur un nom present dans aumfcp.csv.
FCP_NAME_ALIASES: dict[str, str] = {
    "ORANGE MALI": "ORANGE ML",
    "SODEFOR": "SODEFOR COMPLEMENTAIRE RETRAITE",
}


def _tokens(s: str) -> list[str]:
    """Tokens normalises pour matching fuzzy :
       - ascii lowercase, ponctuation -> espaces
       - prefixe de type (FCP/FCPE/FCPR/SICAV/FCT) retire
       - numeros isoles ignores (OPTI PLACEMENT 1 == OPTI PLACEMENT)
       - 's' final retire pour stem leger (SOLIDARITES == SOLIDARITE)
    """
    import unicodedata

    t = s.strip().lower()
    t = "".join(c for c in unicodedata.normalize("NFKD", t) if not unicodedata.combining(c))
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    raw = [x for x in t.split() if x]
    if raw and raw[0] in ("fcp", "fcpe", "fcpr", "sicav", "fct"):
        raw = raw[1:]
    out: list[str] = []
    for tok in raw:
        if tok.isdigit():
            continue
        if len(tok) >= 4 and tok.endswith("s"):
            tok = tok[:-1]
        out.append(tok)
    return out


def _normalize_name(s: str) -> str:
    """
    Normalise un nom de fonds pour le matching BOC <-> aumfcp.
    Cle = tokens joints (cf. _tokens). Les suffixes de categorie BOC
    (D, A, OMLT, OCT, OATC, M, O, OAT, OLMT) ne sont pas presents dans
    `opcvm` apres extract_fcp (deja separes en colonne categorieCode),
    donc inutile de les retirer ici.
    """
    return " ".join(_tokens(s))


def _category_from_boc_suffix(opcvm_name: str) -> str:
    """Devine la categorie depuis le suffixe BOC quand pas de match aumfcp."""
    m = re.search(r"\b(OMLT|OLMT|OATC|OCT|OAT|D|A|M|O)\s*$", opcvm_name.strip().upper())
    return BOC_SUFFIX_TO_CAT.get(m.group(1)) if m else ""


def _aum_date_key(s: str) -> tuple[int, int, int]:
    """Parse 'DD/MM/YYYY' en tuple comparable (YYYY, MM, DD)."""
    try:
        d, m, y = s.split("/")
        return (int(y), int(m), int(d))
    except Exception:
        return (0, 0, 0)


def load_aumfcp_index() -> dict[str, dict[str, str]]:
    """
    Charge aumfcp.csv (Latin-1) et construit un index normalise :
       _normalize_name(Nom de l'OPC) -> {gestionnaire, type, categorie,
                                          actifNet, vlAumfcp, dateAumfcp,
                                          nomAumfcp}
    Quand un OPCVM apparait sur plusieurs dates de snapshot on garde la
    plus recente (Date au format DD/MM/YYYY).
    """
    idx: dict[str, dict[str, str]] = {}
    if not AUMFCP_CSV.exists():
        print(
            f"  Avertissement : {AUMFCP_CSV.relative_to(ROOT)} introuvable — "
            "aucun enrichissement applique.",
            file=sys.stderr,
        )
        return idx

    # Garde la ligne la plus recente par cle normalisee.
    latest: dict[str, tuple[tuple[int, int, int], dict[str, str]]] = {}
    with AUMFCP_CSV.open(encoding="latin-1") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            nom = (row.get("Nom de l'OPC") or "").strip()
            if not nom:
                continue
            key = _normalize_name(nom)
            if not key:
                continue
            dkey = _aum_date_key((row.get("Date") or "").strip())
            entry = {
                "gestionnaire": (row.get("Gestionnaire") or "").strip(),
                "type": (row.get("Type d'OPC") or "").strip(),
                "categorie": (row.get("Catégorie") or "").strip(),
                "actifNet": (row.get(" Actif net ") or row.get("Actif net") or "").strip(),
                "vlAumfcp": (row.get("Valeur Liquidative") or "").strip(),
                "dateAumfcp": normalize_iso_date((row.get("Date") or "").strip()),
                "nomAumfcp": nom,
            }
            prev = latest.get(key)
            if prev is None or dkey > prev[0]:
                latest[key] = (dkey, entry)
    for k, (_, e) in latest.items():
        idx[k] = e
    return idx


def _find_aum_match(
    boc_key: str,
    boc_tokens: set[str],
    aumfcp_idx: dict[str, dict[str, str]],
    aum_tokens_cache: dict[str, set[str]],
) -> tuple[dict[str, str] | None, str]:
    """Cherche le meilleur match aumfcp pour une cle BOC.
    Retourne (entry, methode) ou (None, "no_match"). Methodes :
      - "exact"   : cle normalisee identique
      - "alias"   : table FCP_NAME_ALIASES
      - "tokens"  : max(|intersection|) avec Jaccard >= 0.34 et >=2 tokens
    """
    # 1. Exact
    entry = aumfcp_idx.get(boc_key)
    if entry is not None:
        return entry, "exact"
    # 2. Alias manuel
    alias = FCP_NAME_ALIASES.get(boc_key.upper())
    if alias:
        alias_key = _normalize_name(alias)
        entry = aumfcp_idx.get(alias_key)
        if entry is not None:
            return entry, "alias"
    # 3. Match par tokens (Jaccard, min intersection 2 OU couverture totale)
    if not boc_tokens:
        return None, "no_match"
    best: tuple[float, dict[str, str] | None] = (0.0, None)
    for k, atoks in aum_tokens_cache.items():
        inter = boc_tokens & atoks
        if not inter:
            continue
        if len(inter) >= 2 or boc_tokens <= atoks or atoks <= boc_tokens:
            score = len(inter) / max(len(boc_tokens | atoks), 1)
            if score > best[0]:
                best = (score, aumfcp_idx[k])
    if best[1] is not None and best[0] >= 0.34:
        return best[1], "tokens"
    return None, "no_match"


def enrich_fcp_rows(
    boc_rows: list[dict[str, str]],
    aumfcp_idx: dict[str, dict[str, str]],
) -> tuple[list[dict[str, str]], dict[str, int]]:
    """
    Pour chaque ligne BOC, cherche le match aumfcp (exact / alias / tokens).
    Si match : enrichit avec gestionnaire canonique, categorie longue,
    Actif net, VL & date aumfcp. Sinon : garde l'extraction BOC + categorie
    deduite du code (CAT_TO_LABEL), colonnes aum* vides.
    """
    stats: Counter[str] = Counter()
    out: list[dict[str, str]] = []
    aum_tokens_cache = {k: set(_tokens(k)) for k in aumfcp_idx}

    for r in boc_rows:
        boc_key = _normalize_name(r["opcvm"])
        boc_toks = set(_tokens(r["opcvm"]))
        match, method = _find_aum_match(boc_key, boc_toks, aumfcp_idx, aum_tokens_cache)
        stats[f"match_{method}"] += 1

        if match:
            gestionnaire = match["gestionnaire"] or r["gestionnaire"]
            categorie = match["categorie"] or CAT_TO_LABEL.get(r["categorieCode"], r["categorieCode"])
            type_opc = match["type"]
            actif_net = match["actifNet"]
            vl_aumfcp = match["vlAumfcp"]
            date_aumfcp = match["dateAumfcp"]
            nom_aumfcp = match["nomAumfcp"]
        else:
            gestionnaire = r["gestionnaire"]
            categorie = CAT_TO_LABEL.get(r["categorieCode"], r["categorieCode"])
            type_opc = ""
            actif_net = ""
            vl_aumfcp = ""
            date_aumfcp = ""
            nom_aumfcp = ""

        out.append(
            {
                "gestionnaire": gestionnaire,
                "depositaire": r["depositaire"],
                "opcvm": r["opcvm"],
                "categorie": categorie,
                "frequenceCalcul": r["frequenceCalcul"],
                "vlOrigine": r["vlOrigine"],
                "dateOrigine": r["dateOrigine"],
                "vlPrecedente": r["valeurPrecedente"],
                "datePrecedente": r["datePrecedente"],
                "vlActuelle": r["valeurJour"],
                "dateActuelle": r["dateJour"],
                "typeOpc": type_opc,
                "actifNet": actif_net,
                "vlAumfcp": vl_aumfcp,
                "dateAumfcp": date_aumfcp,
                "nomAumfcp": nom_aumfcp,
            }
        )
    return out, dict(stats)


def write_fcp_csv(
    rows: list[dict[str, str]],
    boc_date: date,
) -> None:
    """
    Ecrit data/fcp.csv avec les 11 colonnes demandees :
    bocDate + Gestionnaire/Dépositaire/OPCVM/Catégorie/FréquenceCalcul +
    VLOrigine/DateOrigine/VLPrécédente/DatePrécédente/VLActuelle/DateActuelle.
    """
    cols = [
        "bocDate",
        "gestionnaire",
        "depositaire",
        "opcvm",
        "categorie",
        "frequenceCalcul",
        "vlOrigine",
        "dateOrigine",
        "vlPrecedente",
        "datePrecedente",
        "vlActuelle",
        "dateActuelle",
        # Enrichissement aumfcp.csv (snapshot le plus recent par OPCVM)
        "typeOpc",
        "actifNet",
        "vlAumfcp",
        "dateAumfcp",
        "nomAumfcp",
    ]
    FCP_CSV.parent.mkdir(parents=True, exist_ok=True)
    with FCP_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, delimiter=";")
        w.writeheader()
        for r in rows:
            w.writerow({"bocDate": boc_date.isoformat(), **r})
    print(
        f"FCP : {len(rows)} lignes ecrites dans {FCP_CSV.relative_to(ROOT)}",
        file=sys.stderr,
    )


def extract_last_page_text(pdf_bytes: bytes) -> str:
    """
    Extrait le texte de la DERNIERE page du PDF (table FCP) en preservant
    la mise en page (layout mode). Indispensable pour decouper Dépositaire,
    OPCVM et Catégorie qui sont alignes a des positions fixes de colonne.
    """
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    if len(reader.pages) == 0:
        return ""
    return reader.pages[-1].extract_text(extraction_mode="layout") or ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument(
        "date",
        nargs="?",
        help="YYYYMMDD (ex: 20260508). Defaut : auto-detect dernier BOC dispo.",
    )
    ap.add_argument(
        "--merge",
        action="store_true",
        help="Injecte les VN dans data/obligations-cotees.csv (sinon ecrit juste le CSV d'audit).",
    )
    args = ap.parse_args()

    # Suppress urllib3 warning sur verify=False (BRVM SSL parfois problematique).
    requests.packages.urllib3.disable_warnings()  # type: ignore[attr-defined]

    if args.date:
        try:
            d = date(
                int(args.date[:4]), int(args.date[4:6]), int(args.date[6:8])
            )
        except (ValueError, IndexError):
            print(f"Date invalide : {args.date}", file=sys.stderr)
            return 1
        pdf = fetch_boc(d)
        if pdf is None:
            print("Aucun PDF trouve a cette date.", file=sys.stderr)
            return 1
        boc_date = d
    else:
        result = find_latest_boc(date.today())
        if result is None:
            print("Aucun BOC dispo dans les 10 derniers jours.", file=sys.stderr)
            return 1
        boc_date, pdf = result

    text = extract_text(pdf)
    values = extract_nominal_values(text)
    synthese = extract_market_synthesis(text)

    if not values and not synthese:
        print(
            "Aucune VN ni synthese extraite (parsing echoue).", file=sys.stderr
        )
        return 1

    if values:
        print(
            f"\n{len(values)} obligations parsees du BOC {boc_date.isoformat()} :"
        )
        for sym in sorted(values):
            print(f"  {sym:<14} VN = {int(values[sym]):>7,}".replace(",", " "))
        write_output_csv(values, boc_date)
        if args.merge:
            merge_into_bonds_csv(values)
    else:
        print("Aucune VN extraite, on continue avec la synthese.", file=sys.stderr)

    # === Volume / transactions par obligation -> backfill du CSV des prix ===
    # Independant de l'extraction des VN. La page "OBLIGATIONS CLASSIQUES" du
    # BOC porte, pour chaque obligation cotee ce jour, le volume echange et la
    # valeur transigee. On les injecte dans obligations-cotees-prix.csv sur les
    # lignes du jour (deja ecrites a 15h par scrape_brvm_bond_prices.py).
    bond_volumes = extract_bond_volumes(text)
    if bond_volumes:
        traded = sum(1 for v in bond_volumes.values() if v[0] > 0)
        print(
            f"\nVolumes obligations : {len(bond_volumes)} obligations dans le BOC, "
            f"{traded} cotees ce jour.",
            file=sys.stderr,
        )
        if args.merge:
            backfill_bond_prices(bond_volumes, boc_date)
    else:
        print("Aucun volume obligataire extrait du BOC.", file=sys.stderr)

    if synthese:
        write_synthese_json(synthese, boc_date)
    else:
        print(
            "Synthese marche obligataire non extraite — JSON inchange.",
            file=sys.stderr,
        )

    # === Statut BOC de chaque mnemonique -> referentiel ===
    # Deux signaux distincts, et c'est la distinction qui compte :
    #  - "cotee"    ligne de cotation reelle (extract_bond_volumes) ;
    #  - "annoncee" avis de premiere cotation, donc AVANT le premier echange.
    # Le second donne de l'avance pour saisir la ligne au referentiel.
    try:
        write_boc_status_csv(
            list(bond_volumes.keys()),
            extract_first_listing_notices(text),
            boc_date,
        )
    except Exception as e:  # ne doit jamais faire echouer le reste du BOC
        print(
            f"Statut BOC non ecrit ({type(e).__name__}: {e}).", file=sys.stderr
        )

    # === FCP (derniere page) + enrichissement aumfcp ===
    fcp_text = extract_last_page_text(pdf)
    raw_fcp_rows = extract_fcp(fcp_text)
    if raw_fcp_rows:
        aumfcp_idx = load_aumfcp_index()
        enriched, match_stats = enrich_fcp_rows(raw_fcp_rows, aumfcp_idx)
        write_fcp_csv(enriched, boc_date)
        print(
            f"  Enrichissement aumfcp : "
            f"{match_stats.get('match_exact', 0)} exact, "
            f"{match_stats.get('match_alias', 0)} alias, "
            f"{match_stats.get('match_tokens', 0)} tokens, "
            f"{match_stats.get('match_no_match', 0)} sans match.",
            file=sys.stderr,
        )
    else:
        print(
            "FCP : aucune ligne extraite de la derniere page — CSV inchange.",
            file=sys.stderr,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())

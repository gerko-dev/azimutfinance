"""
Extract data/data_ef.xlsb -> data/DB_Titres.csv & data/DB_Valeurs.csv

Le xlsb sert de source de vérité pour les fondamentaux (états SYSCOHADA et
bancaires + suivi infra-annuel). Le script reconstruit les deux CSV à zéro.
DB_Postes.csv n'est PAS touché (codes stables côté loader).

Usage:
    python scripts/extract_data_ef.py

Templates supportés:
- SYSCOHADA: en-tête de ticker à R000 (ex "SNTS — SONATEL"), années en R034
- Bancaire:  en-tête "MODÈLE BANCAIRE — TEMPLATE" en R000, années en R031

Les valeurs sont écrites au format brut (Number), périodes ∈ {Annuel, T1, S1, 9M}.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path
from typing import Iterable

from pyxlsb import open_workbook

ROOT = Path(__file__).resolve().parent.parent
XLSB = ROOT / "data" / "data_ef.xlsb"
OUT_TITRES = ROOT / "data" / "DB_Titres.csv"
OUT_VALEURS = ROOT / "data" / "DB_Valeurs.csv"

# Sheets à ignorer (templates et utilitaires)
SKIP_SHEETS = {"BANK", "AUDIT_v2", "Etiquettes de données"}

YEARS = list(range(2016, 2026))  # 2016..2025 (cols B..K = index 1..10)

# ───────────────────────────────────────────────────────────────────────────
# Mapping ligne xlsb → code_poste pour le template SYSCOHADA
# (référence: feuille SNTS, années en R034 cols 1..10)
# ───────────────────────────────────────────────────────────────────────────
SYSCOHADA_MAP: dict[int, str] = {
    # BILAN ACTIF (R037..R065)
    37: "BIL_IMMO_INCORP",
    38: "BIL_A_FRAIS_DE_DVELOPPEMENT_ET_DE_PROSPECTION",
    39: "BIL_A_BREVETS_LICENCES_LOGICIELS_ET_DROITS_SIM",
    40: "BIL_A_FONDS_COMMERCIAL_ET_DROIT_AU_BAIL",
    41: "BIL_A_AUTRES_IMMOBILISATIONS_INCORPORELLES",
    42: "BIL_IMMO_CORP",
    43: "BIL_A_TERRAINS_DONT_PLACEMENT_NET",
    44: "BIL_A_BTIMENTS_DONT_PLACEMENT_NET",
    45: "BIL_A_AMNAGEMENTS_AGENCEMENTS_ET_INSTALLATIONS",
    46: "BIL_A_MATRIEL_MOBILIER_ET_ACTIFS_BIOLOGIQUES",
    47: "BIL_A_MATRIEL_DE_TRANSPORT",
    48: "BIL_IMMO_AVANCES",
    49: "BIL_IMMO_FIN",
    50: "BIL_A_TITRES_DE_PARTICIPATION",
    51: "BIL_A_AUTRES_IMMOBILISATIONS_FINANCIRES",
    52: "BIL_TOTAL_IMMOB",
    53: "BIL_A_ACTIF_CIRCULANT_HAO",
    54: "BIL_STOCKS",
    55: "BIL_TOTAL_CREANCES",
    56: "BIL_FOURN_AVANCES",
    57: "BIL_CLIENTS",
    58: "BIL_A_AUTRES_CRANCES",
    59: "BIL_TOTAL_CIRC",
    60: "BIL_A_TITRES_DE_PLACEMENT",
    61: "BIL_A_VALEURS_ENCAISSER",
    62: "BIL_A_BANQUES_CHQUES_POSTAUX_CAISSE_ET_ASSIMIL",
    63: "BIL_TOTAL_TRES_ACTIF",
    64: "BIL_A_ECART_DE_CONVERSIONACTIF",
    65: "BIL_TOTAL_ACTIF",
    # BILAN PASSIF (R068..R095)
    68: "BIL_CAPITAL",
    69: "BIL_P_APPORTEURS_CAPITAL_NON_APPEL",
    70: "BIL_P_PRIMES_LIES_AU_CAPITAL_SOCIAL",
    71: "BIL_P_ECARTS_DE_RVALUATION",
    72: "BIL_P_RSERVES_INDISPONIBLES",
    73: "BIL_P_RSERVES_LIBRES",
    74: "BIL_REPORT_NVEAU",
    75: "BIL_RNET",
    76: "BIL_P_SUBVENTIONS_D_INVESTISSEMENT",
    77: "BIL_P_PROVISIONS_RGLEMENTES",
    78: "BIL_TOTAL_CP",
    79: "BIL_EMPRUNTS",
    80: "BIL_P_DETTES_DE_LOCATIONACQUISITION",
    81: "BIL_PROV_RC",
    82: "BIL_TOTAL_DETTES_FIN",
    83: "BIL_TOTAL_RESS_STABLES",
    84: "BIL_P_DETTES_CIRCULANTES_HAO",
    85: "BIL_CLIENTS_AV_RECUES",
    86: "BIL_FOURN_EXPL",
    87: "BIL_DETTES_FISC",
    88: "BIL_AUTRES_DETTES",
    89: "BIL_P_PROVISIONS_POUR_RISQUES_ET_CHARGES_COURT",
    90: "BIL_TOTAL_PASSIF_CIRC",
    91: "BIL_P_BANQUES_CRDITS_D_ESCOMPTE",
    92: "BIL_P_BANQUES_TABLISSEMENTS_FINANCIERS_ET_CRDI",
    93: "BIL_TOTAL_TRES_PASSIF",
    94: "BIL_P_ECART_DE_CONVERSIONPASSIF",
    95: "BIL_TOTAL_PASSIF",
    # COMPTE DE RÉSULTAT (R098..R140)
    98: "CR_VENTES_DE_MARCHANDISES",
    99: "CR_ACHATS_DE_MARCHANDISES",
    100: "CR_VARIATION_DE_STOCKS_DE_MARCHANDISES",
    101: "CR_MARGE_COMMERCIALE",
    102: "CR_VENTES_DE_PRODUITS_FABRIQUS",
    103: "CR_TRAVAUX_SERVICES_VENDUS",
    104: "CR_PRODUITS_ACCESSOIRES",
    105: "CR_CA",
    106: "CR_PRODUCTION_STOCKE",
    107: "CR_PRODUCTION_IMMOBILISE",
    108: "CR_SUBVENTIONS_DEXPLOITATION",
    109: "CR_AUTRES_PRODUITS",
    110: "CR_TRANSFERTS_DE_CHARGES_D_EXPLOITATION",
    111: "CR_ACHATS_DE_MATIRES_PREMIRES_ET_FOURNITURE",
    112: "CR_VARIATION_DE_STOCKS_DE_MATIRES_PREMIRES_",
    113: "CR_AUTRES_ACHATS",
    114: "CR_VARIATION_DE_STOCKS_DAUTRES_APPROVISIONN",
    115: "CR_TRANSPORTS",
    116: "CR_SERVICES_EXTRIEURS",
    117: "CR_IMPTS_ET_TAXES",
    118: "CR_AUTRES_CHARGES",
    119: "CR_VA",
    120: "CR_CHARGES_DE_PERSONNEL",
    121: "CR_EBE",
    122: "CR_REPRISES_DAMORTISSEMENTS_PROVISIONS_ET_D",
    123: "CR_TRANSFERT_DE_CHARGES",
    124: "CR_DOTATIONS_AUX_AMORTISSEMENTS_AUX_PROVISI",
    125: "CR_REXP",
    126: "CR_REVENUS_FINANCIERS_ET_ASSIMILS",
    127: "CR_REPRISES_DE_PROVISIONS_ET_DPRCIATIONS_FI",
    128: "CR_TRANSFERTS_DE_CHARGES_FINANCIRES",
    129: "CR_FRAIS_FINANCIERS_ET_CHARGES_ASSIMILES",
    130: "CR_DOTATIONS_AUX_PROVISIONS_ET_AUX_DPRCIATI",
    131: "CR_RFIN",
    132: "CR_RESULTAT_DES_ACTIVITES_ORDINAIRES",
    133: "CR_PRODUITS_DES_CESSIONS_D_IMMOBILISATIONS",
    134: "CR_AUTRES_PRODUITS_HAO",
    135: "CR_VALEURS_COMPTABLES_DES_CESSIONS_D_IMMOBI",
    136: "CR_AUTRES_CHARGES_HAO",
    137: "CR_RHAO",
    138: "CR_PARTICIPATION_DES_TRAVAILLEURS",
    139: "CR_IMPTS_SUR_LE_RSULTAT",
    140: "CR_RNET",
    # TABLEAU DES FLUX DE TRÉSORERIE (R143..R168)
    143: "TFT_SOLDE_OUV",
    144: "TFT_CAFG",
    145: "TFT_VARIATION_D_ACTIF_CIRCULANT_HAO",
    146: "TFT_VARIATION_DES_STOCKS",
    147: "TFT_VARIATION_DES_CRANCES",
    148: "TFT_VARIATION_DU_PASSIF_CIRCULANT",
    149: "TFT_FTO",                                # Variation BF (proxy FTO)
    150: "TFT_FTO",                                # FTO consolidé (écrase)
    151: "TFT_DCAISSEMENTS_LIS_AUX_ACQUISITIONS_D_IMMO",
    152: "TFT_DCAISSEMENTS_LIS_AUX_ACQUISITIONS_D_IMMO",
    153: "TFT_DCAISSEMENTS_LIS_AUX_ACQUISITIONS_D_IMMO",
    154: "TFT_ENCAISSEMENTS_LIS_AUX_CESSIONS_DIMMOBILI",
    155: "TFT_ENCAISSEMENTS_LIS_AUX_CESSIONS_DIMMOBILI",
    156: "TFT_FLUX_DE_TRSORERIE_PROVENANT_DES_ACTIVITS",
    157: "TFT_AUGMENTATIONS_DE_CAPITAL_PAR_APPORTS_NOU",
    158: "TFT_SUBVENTIONS_D_INVESTISSEMENT_REUES",
    159: "TFT_PRLVEMENTS_SUR_LE_CAPITAL",
    # 160 = "- Dividendes versés" : pas de code_poste dédié → omis
    161: "TFT_FTCP",
    162: "TFT_EMPRUNTS",
    163: "TFT_AUTRES_DETTES_FINANCIRES_DIVERSES",
    164: "TFT_REMBOURSEMENTS_DES_EMPRUNTS_ET_AUTRES_DE",
    165: "TFT_FTCE",
    166: "TFT_FTF",
    167: "TFT_VAR_TRES",
    168: "TFT_TRES_NETTE",
}

# ───────────────────────────────────────────────────────────────────────────
# Mapping ligne xlsb → code_poste pour le template BANCAIRE
# (référence: feuille BOAC, années en R031 cols 1..10)
# ───────────────────────────────────────────────────────────────────────────
BANK_MAP: dict[int, str] = {
    # BILAN ACTIF (R035..R049)
    35: "BIL_CAISSE_BC",
    36: "BIL_A_EFFETS_PUBLICS_ET_VALEURS_ASSIMILEES",
    37: "BIL_CREANCES_BANC",
    38: "BIL_CREANCES_CLIENT",
    39: "BIL_A_OBLIGATIONS_ET_AUTRES_TITRES_A_REVENU_FI",
    40: "BIL_A_ACTIONS_ET_AUTRES_TITRES_A_REVENU_VARIAB",
    41: "BIL_A_ACTIONNAIRES_OU_ASSOCIES",
    42: "BIL_A_AUTRES_ACTIFS",
    43: "BIL_A_COMPTES_DE_REGULARISATION",
    44: "BIL_A_PARTICIPATIONS_ET_AUTRES_TITRES_DETENUS_",
    45: "BIL_A_PARTS_DANS_LES_ENTREPRISES_LIEES",
    46: "BIL_A_PRETS_SUBORDONNES",
    47: "BIL_IMMO_INCORP",
    48: "BIL_IMMO_CORP",
    49: "BIL_TOTAL_ACTIF",
    # BILAN PASSIF (R052..R069)
    52: "BIL_P_BANQUES_CENTRALES_CCP",
    53: "BIL_DETTES_INTERBANC",
    54: "BIL_DETTES_CLIENTELE",
    55: "BIL_P_DETTES_REPRESENTEES_PAR_UN_TITRE",
    56: "BIL_P_AUTRES_PASSIFS",
    57: "BIL_P_COMPTES_DE_REGULARISATION",
    58: "BIL_P_PROVISIONS",
    59: "BIL_P_EMPRUNTS_ET_TITRES_EMIS_SUBORDONNES",
    # R060 = "CAPITAUX PROPRES" (header), skip
    61: "BIL_CAPITAL",
    62: "BIL_PRIMES",
    63: "BIL_RESERVES",
    64: "BIL_P_ECARTS_DE_REEVALUATION",
    65: "BIL_P_PROVISIONS_REGLEMENTEES",
    66: "BIL_REPORT_NVEAU",
    67: "BIL_RNET",
    68: "BIL_TOTAL_CP",
    69: "BIL_TOTAL_PASSIF",
    # COMPTE DE RÉSULTAT BANCAIRE (R072..R091)
    72: "CR_INTERETS_ET_PRODUITS_ASSIMILES",
    73: "CR_INTERETS_ET_CHARGES_ASSIMILEES",
    74: "CR_REVENUS_DES_TITRES_A_REVENU_VARIABLE",
    75: "CR_COMMISSIONS",                          # Produits (DB_Postes a un dupe Produit/Charge)
    76: "CR_COMMISSIONS",                          # Charges
    77: "CR_GAINS_NETS_SUR_OPERATIONS_DES_PORTEFEUIL",  # négociation
    78: "CR_GAINS_NETS_SUR_OPERATIONS_DES_PORTEFEUIL",  # placement
    79: "CR_AUTRES_PRODUITS_D_EXPL_BANCAIRE",
    80: "CR_AUTRES_CHARGES_D_EXPL_BANCAIRE",
    81: "CR_CA",                                   # PNB (CR_CA pour le format Bancaire)
    82: "CR_SUBVENTIONS_D_INVESTISSEMENT",
    83: "CR_CHARGES_GENERALES_D_EXPLOITATION",
    84: "CR_DOTATION_AUX_AMORT",
    85: "CR_RBE",
    86: "CR_COT_NET_DU_RISQUE",
    87: "CR_REXP",
    88: "CR_GAINS_OU_PERTES_SUR_ACTIFS_IMMOBILISES",
    89: "CR_RAI",
    90: "CR_IMPTS_SUR_LES_BENEFICES",
    91: "CR_RNET",
    # HORS BILAN (R095..R104)
    95: "HB_ENG_DONNES",
    96: "HB_ENGAGEMENTS_DE_FINANCEMENT",
    97: "HB_ENGAGEMENTS_DE_GARANTIE",
    98: "HB_ENGAGEMENTS_SUR_TITRES",
    # R099 = TOTAL ENGAGEMENTS DONNÉS : agrégé via HB_ENG_DONNES déjà
    101: "HB_ENG_RECUS",
    102: "HB_ENGAGEMENTS_DE_FINANCEMENT",          # reçus (collision Produit/Charge)
    103: "HB_ENGAGEMENTS_DE_GARANTIE",
    104: "HB_ENGAGEMENTS_SUR_TITRES",
}

# Zone 5 — suivi infra-annuel (rows identiques sur les 2 templates : R255..R281)
ZONE5_MAP: list[tuple[int, str, str]] = [
    # (row_idx, code_poste, periode)
    (255, "CR_CA", "T1"),
    (256, "CR_RNET", "T1"),
    (260, "CR_CA", "S1"),
    (261, "CR_REXP", "S1"),
    (262, "CR_RNET", "S1"),
    (267, "CR_CA", "9M"),
    (268, "CR_REXP", "9M"),
    (269, "CR_RNET", "9M"),
    (281, "PA_DNPA", "Annuel"),
]

# Lignes Zone 1 pour la fiche signalétique (SYSCOHADA, R006..R016)
# Pour le template BANK, ces lignes sont normalement vides (R005..R024 sans valeurs).
SIG_ROWS_SYSCOHADA = {
    6: "symbole",
    7: "raison_sociale",
    8: "pays",
    9: "annee_creation",
    10: "secteur_brvm",
    11: "secteur_affine",
    15: "capital_social",
    16: "nb_actions",
}


def num_or_none(v):
    """Convertit une cellule pyxlsb en float (ou None si vide/non-num).
    Gère les nombres français : '3 420', '12 345,67' (espaces normaux ou
    insécables comme séparateurs de milliers, virgule pour décimale)."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s in ("", "NC", "-", "n/a"):
        return None
    try:
        return float(s)
    except ValueError:
        # Format français : retirer espaces (normal + insécable) et NBSP narrow,
        # remplacer virgule par point.
        cleaned = (
            s.replace("\xa0", "")
             .replace(" ", "")
             .replace(" ", "")
             .replace(",", ".")
        )
        try:
            return float(cleaned)
        except ValueError:
            return None


def clean_raison_sociale(s: str) -> str:
    """Filtre les valeurs poubelle ('0x17', chaines vides) en raison_sociale."""
    s = (s or "").strip()
    if len(s) < 3:
        return ""
    # rejette les chaines type 0x17 (cellules corrompues du xlsb)
    import re
    if re.fullmatch(r"0x[0-9a-fA-F]+", s):
        return ""
    return s


def cell_str(v) -> str:
    if v is None:
        return ""
    return str(v).strip()


def read_sheet_rows(sh) -> dict[int, list]:
    """Retourne {row_idx → list[cell_values]} pour itération aléatoire ensuite."""
    out: dict[int, list] = {}
    for i, row in enumerate(sh.rows()):
        out[i] = [c.v for c in row]
    return out


def detect_template(rows: dict[int, list]) -> str | None:
    """Retourne 'BANK' ou 'SYSCOHADA' ou None."""
    r0 = rows.get(0, [])
    if r0 and isinstance(r0[0], str):
        if "MODÈLE BANCAIRE" in r0[0]:
            return "BANK"
    # SYSCOHADA: la ligne d'années est en R034 et commence par 'Poste'
    r34 = rows.get(34, [])
    if r34 and isinstance(r34[0], str) and r34[0] == "Poste":
        return "SYSCOHADA"
    # BANK: ligne d'années en R031, commence par 'Indicateur'
    r31 = rows.get(31, [])
    if r31 and isinstance(r31[0], str) and r31[0] == "Indicateur":
        return "BANK"
    return None


def extract_values(
    rows: dict[int, list],
    template: str,
    ticker: str,
    devise: str = "XOF",
) -> Iterable[tuple[str, int, str, str, float, str]]:
    """Yield (ticker, exercice, periode, code_poste, valeur, devise)."""
    mapping = SYSCOHADA_MAP if template == "SYSCOHADA" else BANK_MAP

    for row_idx, code in mapping.items():
        row = rows.get(row_idx)
        if not row:
            continue
        for col_idx, year in enumerate(YEARS, start=1):
            if col_idx >= len(row):
                continue
            val = num_or_none(row[col_idx])
            if val is None:
                continue
            yield (ticker, year, "Annuel", code, val, devise)

    # Zone 5 (mêmes rows sur les 2 templates)
    for row_idx, code, periode in ZONE5_MAP:
        row = rows.get(row_idx)
        if not row:
            continue
        for col_idx, year in enumerate(YEARS, start=1):
            if col_idx >= len(row):
                continue
            val = num_or_none(row[col_idx])
            if val is None:
                continue
            yield (ticker, year, periode, code, val, devise)


def extract_signaletique(rows: dict[int, list]) -> dict[str, str | float | None]:
    """Lit la Zone 1 d'une feuille SYSCOHADA. Pour BANK les lignes sont vides → renvoie {}."""
    out: dict[str, str | float | None] = {}
    for r_idx, key in SIG_ROWS_SYSCOHADA.items():
        row = rows.get(r_idx, [])
        if len(row) < 2:
            continue
        val = row[1]
        if val is None:
            continue
        if key in ("annee_creation", "capital_social", "nb_actions"):
            n = num_or_none(val)
            if n is not None:
                out[key] = n
        else:
            s = cell_str(val)
            if s:
                out[key] = s
    return out


def load_etiquettes(wb) -> dict[str, dict]:
    """Lit la feuille 'Etiquettes de données' → {ticker → {nom, secteur, nb_titres, cours, capi}}."""
    out: dict[str, dict] = {}
    with wb.get_sheet("Etiquettes de données") as sh:
        for i, row in enumerate(sh.rows()):
            if i == 0:
                continue  # header
            vals = [c.v for c in row]
            if len(vals) < 7:
                continue
            ticker = cell_str(vals[1])
            if not ticker or ticker == "TOTAL":
                continue
            out[ticker] = {
                "raison_sociale": cell_str(vals[2]),
                "secteur": cell_str(vals[3]),
                "nb_titres": num_or_none(vals[4]),
                "cours": num_or_none(vals[5]),
                "capitalisation": num_or_none(vals[6]),
            }
    return out


def main() -> int:
    if not XLSB.exists():
        print(f"ERROR: {XLSB} introuvable", file=sys.stderr)
        return 1

    titres_rows: list[dict] = []
    valeurs_rows: list[tuple] = []
    skipped: list[str] = []
    stats: dict[str, int] = {"SYSCOHADA": 0, "BANK": 0, "unknown": 0}

    with open_workbook(str(XLSB)) as wb:
        etiquettes = load_etiquettes(wb)
        print(f"Tickers dans 'Etiquettes de données': {len(etiquettes)}")

        for sheet_name in wb.sheets:
            if sheet_name in SKIP_SHEETS:
                continue
            ticker = sheet_name.strip()
            if not ticker:
                continue

            with wb.get_sheet(sheet_name) as sh:
                rows = read_sheet_rows(sh)

            template = detect_template(rows)
            if template is None:
                skipped.append(f"{ticker} (template inconnu)")
                stats["unknown"] += 1
                continue

            stats[template] += 1
            format_etats = "Bancaire" if template == "BANK" else "SYSCOHADA"

            sig = extract_signaletique(rows) if template == "SYSCOHADA" else {}
            etiq = etiquettes.get(ticker, {})

            # raison_sociale: priorité étiquettes (officielles) > signalétique > ticker
            raison = (
                clean_raison_sociale(etiq.get("raison_sociale", ""))
                or clean_raison_sociale(str(sig.get("raison_sociale", "")))
                or ticker
            )
            secteur = etiq.get("secteur") or sig.get("secteur_brvm") or ""
            nb_titres = etiq.get("nb_titres") or sig.get("nb_actions") or 0
            cours = etiq.get("cours") or 0
            capi = etiq.get("capitalisation") or 0

            titres_rows.append({
                "ticker": ticker,
                "raison_sociale": str(raison),
                "secteur": secteur,
                "nb_titres": nb_titres or 0,
                "cours": cours or 0,
                "capitalisation": capi or 0,
                "devise": "XOF",
                "format_etats": format_etats,
            })

            for v in extract_values(rows, template, ticker):
                valeurs_rows.append(v)

    # ─── Écriture DB_Titres.csv ────────────────────────────────────────────
    titres_rows.sort(key=lambda r: r["ticker"])
    with OUT_TITRES.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["ticker", "raison_sociale", "secteur", "nb_titres",
                    "cours", "capitalisation", "devise", "format_etats"])
        for r in titres_rows:
            w.writerow([
                r["ticker"],
                r["raison_sociale"],
                r["secteur"],
                format_num(r["nb_titres"]),
                format_num(r["cours"]),
                format_num(r["capitalisation"]),
                r["devise"],
                r["format_etats"],
            ])

    # ─── Écriture DB_Valeurs.csv ───────────────────────────────────────────
    valeurs_rows.sort(key=lambda r: (r[0], r[1], r[2], r[3]))
    with OUT_VALEURS.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["ticker", "exercice", "periode", "code_poste", "valeur", "devise"])
        for tk, ex, per, code, val, dev in valeurs_rows:
            w.writerow([tk, int(ex), per, code, format_num(val), dev])

    print(f"Tickers extraits      : {stats}")
    print(f"DB_Titres.csv         : {len(titres_rows)} lignes -> {OUT_TITRES}")
    print(f"DB_Valeurs.csv        : {len(valeurs_rows)} lignes -> {OUT_VALEURS}")
    if skipped:
        print(f"Sheets ignorées       : {skipped}")
    return 0


def format_num(v) -> str:
    if v is None or v == "":
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


if __name__ == "__main__":
    sys.exit(main())

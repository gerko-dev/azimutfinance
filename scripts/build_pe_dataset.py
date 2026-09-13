#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Consolide data/pe/*.xlsx (un classeur par entreprise) en trois CSV lisibles
par lib/pe.ts.

POURQUOI UNE ETAPE HORS LIGNE
Il y a ~1700 classeurs. Les ouvrir a chaque rendu de page couterait plusieurs
dizaines de secondes ; les CSV produits ici sont lus par le meme parseur que le
reste du portail (delimiteur ';', nombres a la francaise) et memoises au niveau
module. Les .xlsx restent la source de verite : ce script se rejoue.

UNITE DES MONTANTS — etablie, pas supposee
Aucun classeur n'indique son unite. Le controle croise la tranche : le fichier
Sonatel donne un chiffre d'affaires 2020 de 445278, et data/DB_Valeurs.csv
(fondamentaux BRVM) donne 445 277 683 373 XOF pour le meme exercice. Le rapport
est de 1e6 : les montants sont donc en MILLIONS DE FCFA, arrondis. Les ratios
et croissances sont en pourcentage, les leviers en multiple.

DEUX MODELES DE DONNEES
Les societes non financieres publient un chiffre d'affaires ; les banques
publient un produit net bancaire, des depots et des credits. Le champ `modele`
dit lequel s'applique, ce qui evite a l'interface d'afficher une ligne « CA »
vide pour une banque.

Usage :  python scripts/build_pe_dataset.py
"""

from __future__ import annotations

import csv
import glob
import os
import re
import sys
import unicodedata

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("openpyxl requis :  pip install openpyxl")

SRC_DIR = os.path.join("data", "pe")
OUT_ENTREPRISES = os.path.join("data", "pe-entreprises.csv")
OUT_COMPTES = os.path.join("data", "pe-comptes.csv")
OUT_ACTIONNAIRES = os.path.join("data", "pe-actionnaires.csv")

# Libelle du classeur -> code stable. Le code est ce que le TypeScript
# manipule ; renommer une ligne dans un classeur ne doit pas casser l'app.
METRIQUES: dict[str, str] = {
    # Compte de resultat — societes
    "chiffre d'affaires": "ca",
    "croissance ca": "croissance_ca",
    "ebit": "ebit",
    "ebitda": "ebitda",
    "charges d'exploitation": "charges_exploitation",
    "resultat net": "resultat_net",
    "croissance rn": "croissance_rn",
    "dividende": "dividende",
    # Compte de resultat — banques
    "produit net bancaire": "pnb",
    "croissance du pnb": "croissance_pnb",
    # Bilan — societes
    "capitaux propres": "capitaux_propres",
    "dette nette": "dette_nette",
    "tresorerie": "tresorerie",
    "total bilan": "total_bilan",
    # Bilan — banques
    "depots clientele": "depots_clientele",
    "credits clientele": "credits_clientele",
    # Ratios
    "marge nette": "marge_nette",
    "marge d'exploitation": "marge_exploitation",
    "return on equity": "roe",
    "return on assets": "roa",
    "levier financier": "levier_financier",
    "autonomie financiere": "autonomie_financiere",
    "ratio endettement net": "ratio_endettement_net",
    "credits/depots": "credits_depots",
    # Ratios — assurances. Aucun classeur ne les renseigne aujourd'hui, mais
    # les mapper maintenant evite de perdre silencieusement la donnee le jour
    # ou elle arrive.
    "solde de souscription": "solde_souscription",
    "solde d'assurance": "solde_assurance",
    "solde de reassurance": "solde_reassurance",
    "resultats avant placements et is": "resultat_avant_placements",
    "placements": "placements",
    "produits des placements": "produits_placements",
    "solde financier": "solde_financier",
    "taux rendement placements": "taux_rendement_placements",
}

# Unite par code, pour que l'interface n'ait pas a deviner comment formater.
UNITES: dict[str, str] = {
    "croissance_ca": "pct",
    "croissance_rn": "pct",
    "croissance_pnb": "pct",
    "marge_nette": "pct",
    "marge_exploitation": "pct",
    "roe": "pct",
    "roa": "pct",
    "autonomie_financiere": "pct",
    "ratio_endettement_net": "pct",
    "credits_depots": "pct",
    "levier_financier": "x",
    "taux_rendement_placements": "pct",
}

CODES_BANQUE = {"pnb", "croissance_pnb", "depots_clientele", "credits_clientele", "credits_depots"}
CODES_ASSURANCE = {
    "solde_souscription", "solde_assurance", "solde_reassurance",
    "resultat_avant_placements", "placements", "produits_placements",
    "solde_financier", "taux_rendement_placements",
}


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


# ---------------------------------------------------------------------------
# PAYS — DEDUIT, JAMAIS SOURCE
#
# Aucun classeur ne porte de pays, et les metadonnees des .xlsx sont vides
# (creator=openpyxl, rien d'autre). Le seul signal disponible est la raison
# sociale : « ... COTE D'IVOIRE », « ... SENEGAL », « SUCCURSALE ... AU TOGO ».
#
# Cela ne couvre qu'un tiers du referentiel. Les deux autres tiers restent
# vides — une entreprise sans indice n'est PAS rattachee au pays le plus
# frequent, ce qui fabriquerait une donnee d'apparence officielle. L'interface
# doit afficher « pays deduit de la raison sociale » et non « pays ».
#
# Les raisons sociales citant deux pays (« BANQUE MALIENNE ... CI ») sont
# laissees vides : elles sont 5, et une regle de position se tromperait sur
# certaines (SIVOP SENEGAL, filiale senegalaise d'un groupe ivoirien).
# ---------------------------------------------------------------------------
PAYS_MOTIFS: list[tuple[str, list[str]]] = [
    # Les raisons sociales sont TRONQUEES a ~50 caracteres dans la source
    # (« ... D'ELECTRICITE DU S »). Les motifs doivent donc accepter une fin
    # coupee, et les separateurs sont irreguliers (« COTE D' IVOIRE »).
    ("CI", [r"COTE.{0,3}D.{0,3}IVOIRE", r"\bEN COTE D", r"\bCOTE D.?$",
            r"IVOIRIEN", r"IVOIRE", r"\bIVORY\b", r"\bABIDJAN",
            r"\bCIV\b", r"[ \-]CI\b", r"\bRCI\b", r"\bYAMOUSSOUKRO\b",
            r"\bBOUAKE\b", r"\bSAN.?PEDRO\b"]),
    ("SN", [r"\bSENEGA", r"\bDAKAR", r"\bSUARL\b", r"\bTHIES\b",
            r"\bSENEGALAIS"]),
    ("ML", [r"\bMALI\b", r"\bMALIEN", r"\bBAMAKO\b"]),
    ("BF", [r"\bBURKINA", r"\bOUAGADOUGOU\b", r"\bBF\b"]),
    ("TG", [r"\bTOGO\b", r"\bTOGOLAIS", r"\bLOME\b"]),
    ("BJ", [r"\bBENIN\b", r"\bBENINOIS", r"\bCOTONOU\b"]),
    ("NE", [r"\bNIGER\b(?!IA)", r"\bNIGERIEN", r"\bNIAMEY\b"]),
    ("GW", [r"GUINEE.?BISSAU", r"\bBISSAU\b"]),
    ("GH", [r"\bGHANA", r"\bACCRA\b"]),
    ("NG", [r"\bNIGERIA", r"\bLAGOS\b"]),
]

# Entreprises dont la raison sociale ne trahit pas le pays — « SENELEC » ne
# contient pas « Senegal », « SAPH » ni « Ivoire ». Chaque entree a ete
# VERIFIEE par recherche web, source a l'appui ; aucune ne repose sur une
# intuition. Cle : raison sociale normalisee EXACTE, volontairement — un
# prefixe « SAPH » attraperait « SAPHIR », un prefixe « SAR » attraperait
# « SARL ».
PAYS_EXACTS: dict[str, str] = {
    # --- Senegal ---------------------------------------------------------
    "SENELEC - SA (SOCIETE NATIONALE D'ELECTRICITE DU S": "SN",
    "SAR SA (SOCIETE AFRICAINE DE RAFFINAGE)": "SN",
    "PETROSEN TRADING ET SERVICES SA": "SN",
    "SONATEL - SA (STE NATIONALE DES TELECOMMUNICATION)": "SN",
    "SOCOCIM INDUSTRIES - SA": "SN",
    "C.D.S. - SA (LES CIMENTS DU SAHEL)": "SN",
    "SGO SA (SABODALA GOLD OPERATIONS SA)": "SN",
    "MASSAWA SA": "SN",
    "GRANDE COTE OPERATIONS SA": "SN",
    "ELTON SA (ELTON OIL COMPANY SA)": "SN",
    "NMA SANDERS - SA (NOUVELLE MINOTERIE AFRICAINE SA)": "SN",
    "CCMN (COMPTOIR COMMERCIAL MANDIAYE NDIAYE)": "SN",
    "PETOWAL MINING COMPANY - SA": "SN",
    # --- Cote d'Ivoire ---------------------------------------------------
    "PETROCI HOLDING": "CI",
    "PETROCI-HOLDING": "CI",
    "PETROCI-STE NATIONALE": "CI",
    "SOTACI-STE DE TUBES EN": "CI",
    "SITAB INDUSTRIES": "CI",
    "SOCIETE DES MINES D'ITY": "CI",
    "SOCIETE DES MINES DE TONGON": "CI",
    "PERSEUS MINING YAOURE": "CI",
    "BONIKRO GOLD MINE": "CI",
    "SOCIETE DES MINES DE LAFIGUE": "CI",
    "SOCIETE DES MINES DE FLOLEU": "CI",
    "SAPH": "CI",
    "SANIA CIE": "CI",
    "SOCIETE AFRICAINE DE CACAO": "CI",
    "SOCIETE DE LIMONADERIES ET BRASSERIES D'AFRIQUE": "CI",
    "PALMC": "CI",
    "SOCIETE DES CAOUTCHOUCS DE GRAND BEREBY": "CI",
    "FOXTROT INTERNATIONAL LDC": "CI",
    "BANQUE NATIONALE D'INVESTISSEMENT (BNI)": "CI",
    "AGBAOU GOLD OPERATIONS": "CI",
    "CDCI": "CI",
    "CDCI-CIE.DE DISTRIBUTION": "CI",
    "STAR-OIL SA": "CI",
    "SMB-STE MULTINATIONALE DE BITUMES": "CI",
    "SOCIETE MINIERE DE LA LOBO": "CI",
    "PORTEO BTP": "CI",
    # --- Hors UEMOA -------------------------------------------------------
    # Le referentiel n'est pas strictement ouest-africain : une poignee
    # d'entreprises tunisiennes, ghaneennes et nigerianes s'y trouvent.
    "STEG INTERNATIONAL": "TN",
    "ZITOUNA TAKAFUL": "TN",
    "AGRICULTURAL DEVELOPMENT BANK": "GH",
}


def deduire_pays(nom: str) -> tuple[str, str]:
    """
    Renvoie (code ISO-2, source). Source vaut "nom" quand la raison sociale
    tranche a elle seule, "web" quand l'entree vient du dictionnaire verifie
    en ligne, "" quand on ne sait pas. Un doute laisse le champ vide : une entreprise sans indice n'est
    jamais rattachee au pays le plus frequent.
    """
    n = strip_accents(nom).upper()
    exact = PAYS_EXACTS.get(re.sub(r"\s+", " ", n).strip())
    if exact:
        return exact, "web"
    trouves = [
        code for code, motifs in PAYS_MOTIFS
        if any(re.search(m, n) for m in motifs)
    ]
    return (trouves[0], "nom") if len(trouves) == 1 else ("", "")


def slugify(s: str) -> str:
    """Meme convention que slugify() dans lib/fcp.ts."""
    s = strip_accents(s).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def norm_label(s: str) -> str:
    return re.sub(r"\s+", " ", strip_accents(str(s)).lower().strip())


def parse_value(raw) -> float | None:
    """
    Accepte : nombre Excel, « 6,95% », « -0,88x », « 1 234,56 », « - », vide.
    Renvoie None pour toute valeur manquante — jamais 0, qui serait un chiffre.
    """
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    t = str(raw).strip()
    if t in ("", "-", "NC", "N/A", "n/a", "ND"):
        return None
    t = t.replace(" ", "").replace(" ", "").replace(" ", "")
    t = t.rstrip("%").rstrip("xX")
    # Format francais : la virgule est le separateur decimal.
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".")
    else:
        t = t.replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def fmt(v: float) -> str:
    """Ecrit un nombre sans notation scientifique ni zeros inutiles."""
    if v == int(v) and abs(v) < 1e15:
        return str(int(v))
    return f"{v:.4f}".rstrip("0").rstrip(".")


def main() -> int:
    files = sorted(glob.glob(os.path.join(SRC_DIR, "*.xlsx")))
    if not files:
        sys.exit(f"Aucun classeur dans {SRC_DIR}")

    entreprises: list[dict] = []
    comptes: list[tuple] = []
    actionnaires: list[tuple] = []
    slugs_vus: dict[str, str] = {}
    ignores: list[str] = []
    sans_exercice: list[str] = []
    labels_inconnus: dict[str, int] = {}

    for path in files:
        base = os.path.splitext(os.path.basename(path))[0]
        try:
            wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
        except Exception as e:
            ignores.append(f"{base} : ouverture impossible ({e})")
            continue

        ws = wb.worksheets[0]
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        wb.close()
        if len(rows) < 3:
            ignores.append(f"{base} : classeur vide")
            continue

        nom = str(rows[0][0]).strip() if rows[0] and rows[0][0] else base
        slug = slugify(nom) or slugify(base)
        if not slug:
            ignores.append(f"{base} : nom inexploitable")
            continue
        # Collision de slug : on suffixe, plutot que d'ecraser silencieusement
        # une entreprise par une autre.
        if slug in slugs_vus:
            n = 2
            while f"{slug}-{n}" in slugs_vus:
                n += 1
            slug = f"{slug}-{n}"
        slugs_vus[slug] = nom

        # Ligne d'en-tete : « Libellé » puis les exercices.
        header = rows[1] if len(rows) > 1 else []
        annees: list[tuple[int, int]] = []  # (index colonne, annee)
        for i, cell in enumerate(header[1:], start=1):
            if cell is None:
                continue
            m = re.search(r"(19|20)\d{2}", str(cell))
            if m:
                annees.append((i, int(m.group(0))))
        # Pas d'exercice en en-tete : 37 classeurs sont des coquilles, sans
        # aucun chiffre. Les ecarter les ferait disparaitre du referentiel
        # alors qu'ils portent un secteur et parfois un actionnariat. On les
        # garde, avec nb_exercices a 0 — l'interface dira « non publies »
        # plutot que de laisser croire que l'entreprise n'existe pas.
        if not annees:
            sans_exercice.append(base)

        section = None
        secteur = ""
        codes_presents: set[str] = set()
        rang_actionnaire = 0

        for r in rows[2:]:
            if not r or r[0] is None:
                continue
            lab = str(r[0]).strip()
            if not lab:
                continue

            if lab.startswith("---"):
                section = norm_label(lab.strip("- ").strip())
                continue

            if section == "secteur":
                if not secteur:
                    secteur = lab
                continue

            if section == "actionnariat":
                if norm_label(lab) == "actionnaire":
                    continue
                pct = parse_value(r[1] if len(r) > 1 else None)
                rang_actionnaire += 1
                actionnaires.append((slug, rang_actionnaire, lab, "" if pct is None else fmt(pct)))
                continue

            code = METRIQUES.get(norm_label(lab))
            if code is None:
                labels_inconnus[lab] = labels_inconnus.get(lab, 0) + 1
                continue

            for col, annee in annees:
                v = parse_value(r[col] if len(r) > col else None)
                if v is None:
                    continue
                comptes.append((slug, annee, code, fmt(v)))
                codes_presents.add(code)

        if codes_presents & CODES_BANQUE:
            modele = "banque"
        elif codes_presents & CODES_ASSURANCE or norm_label(secteur) == "assurances":
            modele = "assurance"
        else:
            modele = "societe"
        annees_avec_donnees = sorted({a for (s, a, c, v) in comptes if s == slug})
        entreprises.append(
            {
                "slug": slug,
                "nom": nom,
                "secteur": secteur,
                "pays": deduire_pays(nom)[0],
                "pays_source": deduire_pays(nom)[1],
                "modele": modele,
                "annee_min": annees_avec_donnees[0] if annees_avec_donnees else "",
                "annee_max": annees_avec_donnees[-1] if annees_avec_donnees else "",
                "nb_exercices": len(annees_avec_donnees),
                "fichier": os.path.basename(path),
            }
        )

    def write_csv(path: str, header: list[str], rows) -> None:
        with open(path, "w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh, delimiter=";", lineterminator="\n")
            w.writerow(header)
            w.writerows(rows)

    entreprises.sort(key=lambda e: e["nom"])
    write_csv(
        OUT_ENTREPRISES,
        ["slug", "nom", "secteur", "pays", "pays_source", "modele", "annee_min", "annee_max", "nb_exercices", "fichier"],
        [
            [
                e["slug"], e["nom"], e["secteur"], e["pays"], e["pays_source"], e["modele"],
                e["annee_min"], e["annee_max"], e["nb_exercices"], e["fichier"],
            ]
            for e in entreprises
        ],
    )
    comptes.sort(key=lambda t: (t[0], t[2], t[1]))
    write_csv(OUT_COMPTES, ["slug", "annee", "code", "valeur"], comptes)
    actionnaires.sort(key=lambda t: (t[0], t[1]))
    write_csv(OUT_ACTIONNAIRES, ["slug", "rang", "actionnaire", "pct"], actionnaires)

    print(f"classeurs lus        : {len(files)}")
    print(f"entreprises ecrites  : {len(entreprises)}")
    print(f"  dont banques       : {sum(1 for e in entreprises if e['modele'] == 'banque')}")
    print(f"  sans secteur       : {sum(1 for e in entreprises if not e['secteur'])}")
    print(f"lignes de comptes    : {len(comptes)}")
    print(f"lignes actionnaires  : {len(actionnaires)}")
    print(f"  sans exercice publie : {len(sans_exercice)}")
    avec_pays = sum(1 for e in entreprises if e["pays"])
    print(f"  pays deduit          : {avec_pays} ({100 * avec_pays / max(1, len(entreprises)):.0f} %)")
    if ignores:
        print(f"\nclasseurs ignores ({len(ignores)}) :")
        for x in ignores[:15]:
            print("   ", x)
    if labels_inconnus:
        print(f"\nlibelles non mappes ({len(labels_inconnus)}) — a verifier :")
        for lab, n in sorted(labels_inconnus.items(), key=lambda kv: -kv[1])[:15]:
            print(f"    {n:5}  {lab}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

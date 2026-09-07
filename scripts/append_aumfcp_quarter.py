#!/usr/bin/env python3
"""
Ajoute un trimestre a data/fcp/aumfcp.csv depuis la compilation ASGOP.

Entree  : un classeur « ASGOP - Statistiques AUM Compilation - <mois> <annee>.xlsx »
          contenant une feuille « données au JJ.MM.AAAA ».
Sortie  : data/fcp/aumfcp.csv, une ligne par fonds pour le trimestre ajoute.

Le fichier cible est une SERIE : la valeur liquidative de chaque fonds y est
suivie de trimestre en trimestre, et la jointure se fait sur le couple
(gestionnaire, nom du fonds). D'ou les trois precautions qui font l'essentiel de
ce script :

1. L'ASGOP prefixe ses libelles de la forme juridique — « FCP SOAGA TRESORERIE »
   la ou la serie porte « SOAGA TRESORERIE ». Le prefixe est retire avant tout
   rapprochement.

2. Les libelles bougent d'un trimestre a l'autre sans que le fonds change.
   AFRICABOURSE a prefixe tous les siens de « AAM » au T1 2026, OPTI a supprime
   les chiffres finaux de ses trois fonds, BNI a mis « Initiatives » au pluriel.
   Reprendre le nouveau libelle couperait chaque serie en deux : un fonds
   s'arreterait fin 2025, un homonyme naitrait en 2026. La table RENOMMAGES
   ci-dessous ramene explicitement chacun a son nom historique.

3. Un suffixe n'est PAS toujours un renommage. Au T1 2026, l'ASGOP publie a la
   fois « BOA OBLIGATIONS » et « BOA OBLIGATIONS PLUS », « BRIDGE OBLIGATIONS »
   et « BRIDGE OBLIGATIONS SOUVERAINES » : ce sont bien quatre fonds distincts.
   Le script ne rapproche donc jamais deux libelles tout seul — il signale les
   inconnus et laisse trancher.

Usage :
    python scripts/append_aumfcp_quarter.py "ASGOP  - Statistiques AUM Compilation - Mars 2026.xlsx"
    python scripts/append_aumfcp_quarter.py <classeur> --feuille "données au 31.03.2026"
    python scripts/append_aumfcp_quarter.py <classeur> --dry-run
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import unicodedata

try:
    import openpyxl
except ImportError:
    print("openpyxl requis : python -m pip install openpyxl", file=sys.stderr)
    raise SystemExit(1)

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CIBLE = os.path.join(RACINE, "data", "fcp", "aumfcp.csv")

# Le fichier est historiquement en cp1252 avec des fins de ligne CRLF. On ne le
# convertit pas : d'autres outils le relisent, et une reecriture complete en
# UTF-8 rendrait le diff illisible sur 1 671 lignes intactes.
ENCODAGE = "cp1252"

ENTETES = [
    "Gestionnaire",
    "Nom de l'OPC",
    "Type d'OPC",
    "Catégorie",
    "Date",
    "Valeur Liquidative",
    " Actif net ",
]

# Forme juridique en tete de libelle, ajoutee par l'ASGOP et absente de la serie.
PREFIXES = re.compile(r"^(FCP|FCPR|FCTC|FCC|FCPE|SICAV|SICAF)\s+")

# Libelles ASGOP a ramener a leur nom historique. Chaque entree correspond a un
# fonds dont le NOM a change sans que le fonds change, verifie en comparant les
# listes de fonds du gestionnaire avant et apres.
RENOMMAGES: dict[tuple[str, str], str] = {
    # AFRICABOURSE a prefixe ses quatre fonds de son acronyme au T1 2026.
    ("AFRICABOURSE ASSET MANAGEMENT", "AAM EPARGNE ACTION"): "EPARGNE ACTION",
    ("AFRICABOURSE ASSET MANAGEMENT", "AAM EPARGNE CROISSANCE"): "EPARGNE CROISSANCE",
    ("AFRICABOURSE ASSET MANAGEMENT", "AAM OBLIGATIS"): "OBLIGATIS",
    # OPTI a supprime les chiffres qui suffixaient ses trois fonds.
    ("OPTI ASSET MANAGEMENT", "OPTI CAPITAL"): "OPTI CAPITAL 3",
    ("OPTI ASSET MANAGEMENT", "OPTI PLACEMENT"): "OPTI PLACEMENT 1",
    ("OPTI ASSET MANAGEMENT", "OPTI REVENU"): "OPTI REVENU 2",
    # Pluriel.
    ("BNI GESTION", "INITIATIVES SOLIDARITE"): "INITIATIVE SOLIDARITE",
}

# Valeur liquidative absente : convention deja en place dans le fichier.
VL_ABSENTE = "N/D"


def sans_accent(s: str) -> str:
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()


def libelle(s) -> str:
    """Libelle nettoye : majuscules, sans forme juridique, espaces normalises."""
    v = re.sub(r"\s+", " ", str(s or "").strip()).upper()
    return PREFIXES.sub("", v).strip()


def cle(s) -> str:
    """Cle de rapprochement : lettres et chiffres seuls, sans accent."""
    return re.sub(r"[^A-Z0-9]", "", sans_accent(libelle(s)))


def nombre_fr(v, decimales: int = 0) -> str:
    """Entier au format du fichier : espace comme separateur de milliers."""
    return f"{round(float(v)):,}".replace(",", " ")


def lire_serie() -> list[dict]:
    with open(CIBLE, encoding=ENCODAGE, newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def trouver_feuille(wb, demandee: str | None) -> str:
    if demandee:
        if demandee not in wb.sheetnames:
            raise SystemExit(f"Feuille « {demandee} » absente. Feuilles : {wb.sheetnames}")
        return demandee
    for nom in wb.sheetnames:
        if re.match(r"^donn[ée]es au \d{2}\.\d{2}\.\d{4}$", nom.strip(), re.I):
            return nom
    raise SystemExit(
        "Aucune feuille « données au JJ.MM.AAAA ». Préciser --feuille.\n"
        f"Feuilles disponibles : {wb.sheetnames}"
    )


def lire_classeur(chemin: str, feuille: str | None) -> tuple[str, list[dict]]:
    wb = openpyxl.load_workbook(chemin, data_only=True, read_only=True)
    nom = trouver_feuille(wb, feuille)
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", nom)
    if not m:
        raise SystemExit(f"Date illisible dans le nom de feuille « {nom} ».")
    date = f"{m.group(1)}/{m.group(2)}/{m.group(3)}"

    ws = wb[nom]
    lignes: list[dict] = []
    for row in ws.iter_rows(min_row=1, values_only=True):
        if not row or len(row) < 8:
            continue
        gest, opc, typ, cat, vl, an = row[1], row[2], row[3], row[4], row[6], row[7]
        # La feuille porte deux lignes d'en-tete ; on ne garde que les lignes
        # qui designent reellement un fonds et portent un actif net.
        if not gest or not opc or str(gest).strip().lower() == "gestionnaire":
            continue
        if an is None or str(an).strip() == "":
            continue
        try:
            float(an)
        except (TypeError, ValueError):
            continue
        lignes.append(
            {
                "gestionnaire": str(gest).strip(),
                "opc": str(opc).strip(),
                "type": re.sub(r"\s+", " ", str(typ or "").strip()),
                "categorie": re.sub(r"\s+", " ", str(cat or "").strip()),
                "vl": vl,
                "an": an,
            }
        )
    return date, lignes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("classeur", help="Compilation AUM ASGOP (.xlsx)")
    ap.add_argument("--feuille", help="Nom exact de la feuille de données")
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Analyse et rapport, sans écrire le CSV.",
    )
    args = ap.parse_args()

    if not os.path.exists(args.classeur):
        print(f"Classeur introuvable : {args.classeur}", file=sys.stderr)
        return 1

    date, source = lire_classeur(args.classeur, args.feuille)
    serie = lire_serie()
    print(f"Classeur : {os.path.basename(args.classeur)}")
    print(f"Trimestre : {date} — {len(source)} fonds dans la feuille")
    print(f"Série : {len(serie)} lignes, {len({r['Date'] for r in serie})} trimestres")

    if any(r["Date"] == date for r in serie):
        print(f"\n{date} figure déjà dans la série. Rien à faire.", file=sys.stderr)
        return 1

    # Index de la serie : par (gestionnaire, fonds) puis par fonds seul, pour
    # retrouver les libelles historiques a reutiliser.
    par_couple: dict[tuple[str, str], dict] = {}
    par_fonds: dict[str, dict] = {}
    for r in serie:
        par_couple[(cle(r["Gestionnaire"]), cle(r["Nom de l'OPC"]))] = r
        par_fonds.setdefault(cle(r["Nom de l'OPC"]), r)

    sorties: list[list[str]] = []
    nouveaux: list[tuple[str, str]] = []
    renommes: list[tuple[str, str]] = []
    relibelles: list[tuple[str, str, str]] = []

    for l in source:
        gest_src = libelle(l["gestionnaire"])
        opc_src = libelle(l["opc"])

        # Renommage declare : on reprend le nom historique.
        cible_renommage = RENOMMAGES.get((gest_src, opc_src))
        opc_cherche = cible_renommage or opc_src

        histo = par_couple.get((cle(gest_src), cle(opc_cherche))) or par_fonds.get(
            cle(opc_cherche)
        )

        if histo is not None:
            # Le fonds est connu : on garde SES libelles, pour que la jointure
            # tienne d'un trimestre a l'autre.
            gestionnaire = histo["Gestionnaire"].strip()
            opc = histo["Nom de l'OPC"].strip()
            if cible_renommage:
                renommes.append((opc_src, opc))
            elif cle(gestionnaire) != cle(gest_src):
                relibelles.append((opc, l["gestionnaire"], gestionnaire))
        else:
            gestionnaire = l["gestionnaire"]
            opc = opc_src
            nouveaux.append((gestionnaire, opc))

        try:
            vl = nombre_fr(l["vl"])
        except (TypeError, ValueError):
            vl = VL_ABSENTE

        sorties.append(
            [
                gestionnaire,
                opc,
                l["type"],
                l["categorie"],
                date,
                vl,
                nombre_fr(l["an"]),
            ]
        )

    # Fonds presents au dernier trimestre connu mais absents de la feuille.
    dernier = max(
        {r["Date"] for r in serie},
        key=lambda d: (d[6:], d[3:5], d[0:2]),
    )
    vus = {cle(s[1]) for s in sorties}
    absents = [
        r for r in serie if r["Date"] == dernier and cle(r["Nom de l'OPC"]) not in vus
    ]

    print(f"\n{len(sorties)} lignes préparées pour {date}")
    print(f"  reconnus  : {len(sorties) - len(nouveaux)}")
    print(f"  nouveaux  : {len(nouveaux)}")
    if renommes:
        print(f"\nRenommages appliqués ({len(renommes)}) — nom historique conservé :")
        for avant, apres in renommes:
            print(f"   {avant:38} -> {apres}")
    if relibelles:
        print(f"\nGestionnaire libellé autrement dans le classeur ({len(relibelles)})")
        print("  — libellé historique conservé, la série reste jointe :")
        for opc, src, hist in relibelles:
            print(f"   {opc:28} {src:26} -> {hist}")
    if nouveaux:
        print(f"\nNouveaux fonds ({len(nouveaux)}) :")
        for g, n in nouveaux:
            print(f"   {g:34} {n}")
    if absents:
        print(f"\nPrésents au {dernier} mais absents de la feuille ({len(absents)}) :")
        for r in absents:
            print(f"   {r['Gestionnaire']:34} {r['Nom de l\'OPC']}")

    # Vocabulaire : un type ou une categorie inedits trahissent souvent une
    # colonne decalee dans le classeur.
    types_connus = {r["Type d'OPC"].strip() for r in serie}
    cats_connues = {r["Catégorie"].strip() for r in serie}
    inedits = {s[2] for s in sorties} - types_connus
    inedites = {s[3] for s in sorties} - cats_connues
    if inedits:
        print(f"\nTypes d'OPC inédits : {sorted(inedits)}")
    if inedites:
        print(f"Catégories inédites : {sorted(inedites)}")

    if args.dry_run:
        print("\n--dry-run : le fichier n'a pas été modifié.")
        return 0

    with open(CIBLE, "a", encoding=ENCODAGE, newline="") as f:
        w = csv.writer(f, delimiter=";", lineterminator="\r\n")
        w.writerows(sorties)

    print(f"\n{len(sorties)} lignes ajoutées à data/fcp/aumfcp.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

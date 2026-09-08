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
from datetime import date as date_, datetime

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
    # Au T2 2026 OPTI ecrit « FCP1 » colle au nom. Le prefixe n'est plus
    # detache par un espace, donc plus retire par PREFIXES : troisieme
    # orthographe en trois trimestres pour les memes trois fonds.
    ("OPTI ASSET MANAGEMENT", "FCP1 OPTI PLACEMENT"): "OPTI PLACEMENT 1",
    ("OPTI ASSET MANAGEMENT", "FCP2 OPTI REVENU"): "OPTI REVENU 2",
    ("OPTI ASSET MANAGEMENT", "FCP3 OPTI CAPITAL"): "OPTI CAPITAL 3",
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


def _ligne_fonds(gest, opc, typ, cat, vl, an) -> dict | None:
    """Normalise une ligne, ou None si elle ne designe pas un fonds servi."""
    if not gest or not opc or str(gest).strip().lower() == "gestionnaire":
        return None
    if an is None or str(an).strip() == "":
        return None
    try:
        float(an)
    except (TypeError, ValueError):
        return None
    return {
        "gestionnaire": str(gest).strip(),
        "opc": str(opc).strip(),
        "type": re.sub(r"\s+", " ", str(typ or "").strip()),
        "categorie": re.sub(r"\s+", " ", str(cat or "").strip()),
        "vl": vl,
        "an": an,
    }


def _feuille_datee(wb, demandee: str | None) -> str | None:
    """Feuille « données au JJ.MM.AAAA », s'il en existe une."""
    if demandee:
        if demandee not in wb.sheetnames:
            raise SystemExit(
                f"Feuille « {demandee} » absente. Feuilles : {wb.sheetnames}"
            )
        return demandee
    for nom in wb.sheetnames:
        if re.match(r"^donn[ée]es au \d{2}\.\d{2}\.\d{4}$", nom.strip(), re.I):
            return nom
    return None


def _feuille_longue(wb) -> tuple[str, dict[str, int]] | None:
    """Feuille au format LONG : une ligne par fonds ET par date.

    L'ASGOP ne cree pas toujours une feuille par trimestre — le classeur de
    juin 2026 n'en a pas — mais tient en parallele un tableau ou la date est
    une colonne. On le reconnait a ses en-tetes plutot qu'a son nom, qui varie
    (« Données Trimestrielles (2) »).
    """
    attendus = {
        "gestionnaire": "gestionnaire",
        "nom de l'opc": "opc",
        "type d'opc": "type",
        "categorie": "categorie",
        "date": "date",
        "valeur liquidative": "vl",
        "actif net": "an",
    }
    for nom in wb.sheetnames:
        ws = wb[nom]
        for entete in ws.iter_rows(min_row=1, max_row=3, values_only=True):
            index: dict[str, int] = {}
            for i, c in enumerate(entete or []):
                libelle = sans_accent(str(c or "").strip().lower())
                for attendu, champ in attendus.items():
                    if libelle == sans_accent(attendu):
                        index[champ] = i
            if len(index) == len(attendus):
                return nom, index
    return None


def lire_classeur(
    chemin: str, feuille: str | None, date_voulue: str | None
) -> tuple[str, list[dict]]:
    wb = openpyxl.load_workbook(chemin, data_only=True, read_only=True)

    # 1. Feuille dediee au trimestre, quand le classeur en porte une.
    nom = _feuille_datee(wb, feuille)
    if nom is not None:
        m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", nom)
        if not m:
            raise SystemExit(f"Date illisible dans le nom de feuille « {nom} ».")
        date = f"{m.group(1)}/{m.group(2)}/{m.group(3)}"
        if date_voulue is None or date == date_voulue:
            lignes = []
            for row in wb[nom].iter_rows(min_row=1, values_only=True):
                if not row or len(row) < 8:
                    continue
                l = _ligne_fonds(row[1], row[2], row[3], row[4], row[6], row[7])
                if l:
                    lignes.append(l)
            return date, lignes

    # 2. Sinon, le tableau au format long, filtre sur la date demandee.
    longue = _feuille_longue(wb)
    if longue is None:
        raise SystemExit(
            "Ni feuille « données au JJ.MM.AAAA », ni tableau au format long.\n"
            f"Feuilles disponibles : {wb.sheetnames}"
        )
    nom, idx = longue

    par_date: dict[str, list[dict]] = {}
    for row in wb[nom].iter_rows(min_row=2, values_only=True):
        if not row or len(row) <= max(idx.values()):
            continue
        brut = row[idx["date"]]
        if isinstance(brut, (datetime, date_)):
            jour = brut.strftime("%d/%m/%Y")
        else:
            texte = str(brut or "").strip()
            m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", texte)
            if m:
                jour = f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
            elif re.match(r"^\d{2}/\d{2}/\d{4}$", texte):
                jour = texte
            else:
                continue
        l = _ligne_fonds(
            row[idx["gestionnaire"]],
            row[idx["opc"]],
            row[idx["type"]],
            row[idx["categorie"]],
            row[idx["vl"]],
            row[idx["an"]],
        )
        if l:
            par_date.setdefault(jour, []).append(l)

    if not par_date:
        raise SystemExit(f"Aucune ligne exploitable dans « {nom} ».")

    if date_voulue:
        if date_voulue not in par_date:
            raise SystemExit(
                f"{date_voulue} absent de « {nom} ». "
                f"Dates disponibles : {', '.join(sorted(par_date))}"
            )
        choisie = date_voulue
    else:
        # Le trimestre le plus recent du tableau.
        choisie = max(par_date, key=lambda d: (d[6:], d[3:5], d[0:2]))

    print(f"Format long lu dans « {nom} » — trimestre retenu : {choisie}")
    return choisie, par_date[choisie]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("classeur", help="Compilation AUM ASGOP (.xlsx)")
    ap.add_argument("--feuille", help="Nom exact de la feuille de données")
    ap.add_argument(
        "--date",
        help="Trimestre à importer, JJ/MM/AAAA. Par défaut, le plus récent du classeur.",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Analyse et rapport, sans écrire le CSV.",
    )
    args = ap.parse_args()

    if not os.path.exists(args.classeur):
        print(f"Classeur introuvable : {args.classeur}", file=sys.stderr)
        return 1

    date, source = lire_classeur(args.classeur, args.feuille, args.date)
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

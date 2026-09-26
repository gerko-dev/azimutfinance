#!/usr/bin/env python3
"""
Confronte la liste des jours feries du code a ce que dit l'historique de cours.

POURQUOI CE SCRIPT EXISTE. La liste qui commandait le calcul des dates de
denouement avait ete recopiee d'une feuille du classeur. Elle etait fausse --
une seule de ses six dates verifiables correspondait a une fermeture reelle --
et elle l'a ete pendant des mois, parce que rien ne permettait de la controler.
Un ordre du 24 septembre 2026 se denouait le 29 au lieu du 28.

COMMENT ON SAIT QU'UN JOUR EST FERME. L'historique Sikafinance REPORTE la
seance precedente les jours sans cotation : le 1er mai 2026 y porte, pour les
quarante-sept valeurs, exactement les cours et volumes du 30 avril. Une journee
qui duplique sa veille a l'identique sur tout le gisement est donc une journee
sans seance -- la probabilite d'une coincidence sur quarante-sept couples
(cours, volume) est nulle.

CE QUE LE SCRIPT NE PEUT PAS FAIRE : se prononcer sur l'avenir. Une fermeture
ne devient observable qu'apres coup, et les fetes mobiles du calendrier lunaire
ne se calculent pas ici. Les dates futures de la liste sont donc signalees
« a venir », sans jugement.

Usage :
    python scripts/verifier_jours_feries.py            # annee en cours et suivante
    python scripts/verifier_jours_feries.py 2024 2026  # plage explicite
"""

from __future__ import annotations

import csv
import datetime
import io
import os
import re
import sys
from collections import defaultdict

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORIQUE = os.path.join(RACINE, "data", "historique_sika")
SOURCE_TS = os.path.join(
    RACINE, "app", "gestion-portefeuille", "operations-marche-types.ts"
)

JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

# En deca, l'echantillon est trop mince pour que la duplication fasse preuve.
MIN_VALEURS = 20


def liste_du_code() -> list[str]:
    """Les dates declarees dans `JOURS_FERIES`, lues dans le source TypeScript."""
    texte = io.open(SOURCE_TS, encoding="utf-8").read()
    debut = texte.index("export const JOURS_FERIES")
    fin = texte.index("];", debut)
    return re.findall(r"\d{4}-\d{2}-\d{2}", texte[debut:fin])


def empreintes() -> dict[str, dict[str, tuple[str, str]]]:
    """Par date, l'empreinte de la seance : (cloture, volume) de chaque valeur."""
    par_date: dict[str, dict[str, tuple[str, str]]] = defaultdict(dict)
    for fichier in sorted(os.listdir(HISTORIQUE)):
        if not fichier.lower().endswith(".csv"):
            continue
        code = fichier.split(".")[0]
        with io.open(
            os.path.join(HISTORIQUE, fichier), encoding="utf-8-sig", newline=""
        ) as f:
            for ligne in csv.DictReader(f, delimiter=";"):
                iso = (ligne.get("date_iso") or "").strip()
                if len(iso) == 10:
                    par_date[iso][code] = (
                        (ligne.get("close") or "").strip(),
                        (ligne.get("volume") or "").strip(),
                    )
    return par_date


def fermetures(par_date, debut: int, fin: int) -> set[str]:
    """Jours OUVRABLES dont la seance recopie la veille a l'identique."""
    dates = sorted(par_date)
    fermes = set()
    for precedent, jour in zip(dates, dates[1:]):
        annee = int(jour[:4])
        if annee < debut or annee > fin:
            continue
        if datetime.date.fromisoformat(jour).weekday() >= 5:
            continue
        communes = set(par_date[precedent]) & set(par_date[jour])
        if len(communes) < MIN_VALEURS:
            continue
        if all(par_date[precedent][c] == par_date[jour][c] for c in communes):
            fermes.add(jour)
    return fermes


def main() -> int:
    if len(sys.argv) == 3:
        debut, fin = int(sys.argv[1]), int(sys.argv[2])
    else:
        courante = datetime.date.today().year
        debut, fin = courante, courante + 1

    if not os.path.isdir(HISTORIQUE):
        print(f"Historique introuvable : {HISTORIQUE}")
        return 2

    par_date = empreintes()
    if not par_date:
        print("Aucun historique de cours lu.")
        return 2
    derniere = max(par_date)
    observees = fermetures(par_date, debut, fin)
    declarees = {d for d in liste_du_code() if debut <= int(d[:4]) <= fin}

    def libelle(d: str) -> str:
        return f"{d} {JOURS[datetime.date.fromisoformat(d).weekday()]}"

    print(f"Historique jusqu'au {derniere}. Annees examinees : {debut}-{fin}.\n")

    # Declaree ferree mais la bourse a cote : la date est fausse.
    fausses = sorted(d for d in declarees if d <= derniere and d not in observees)
    # Fermee mais absente de la liste : le denouement est calcule trop tot.
    manquantes = sorted(observees - declarees)
    # Pas encore observable : ni confirmee ni infirmee.
    futures = sorted(d for d in declarees if d > derniere)

    if fausses:
        print("DATES DECLAREES FERIEES OU LA BOURSE A POURTANT COTE :")
        for d in fausses:
            print(f"   {libelle(d)}")
        print()
    if manquantes:
        print("FERMETURES OBSERVEES ET ABSENTES DE LA LISTE :")
        for d in manquantes:
            print(f"   {libelle(d)}")
        print()
    if futures:
        print("DATES A VENIR, NON ENCORE OBSERVABLES :")
        for d in futures:
            print(f"   {libelle(d)}")
        print()

    if not fausses and not manquantes:
        confirmees = len(declarees) - len(futures)
        print(f"Liste conforme : {confirmees} fermeture(s) confirmee(s) par les cours.")
        return 0

    print(
        "La liste vit dans JOURS_FERIES "
        "(app/gestion-portefeuille/operations-marche-types.ts)."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

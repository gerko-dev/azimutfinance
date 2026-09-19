#!/usr/bin/env python3
"""
Ajoute au classeur « Rapport CI - Analyse.xlsx » une feuille d'anticipation de
l'INDICE BRVM Composite, construite PAR LE BAS depuis la feuille
« Anticipation actions ».

Pourquoi par le bas. Le Composite n'est pas une serie qu'on extrapole : c'est
la somme ponderee de ses composantes. L'anticiper en projetant sa courbe
reviendrait a ignorer le travail deja fait valeur par valeur — cours cible =
BPA 2026e x PER median du secteur — alors que ce travail dit precisement ou
chaque ligne est censee aller.

Ponderation au FLOTTANT, pas a la capitalisation totale : c'est la convention
de l'indice, et l'ecart n'est pas anecdotique sur la cote regionale, ou
plusieurs societes ont un flottant inferieur a 20 % du capital.

La feuille est ECRITE EN FORMULES, pas en valeurs : elle reference
« Anticipation actions » et « Historique ». Rafraichir ces deux feuilles
rafraichit l'anticipation de l'indice, sans relancer ce script.

Usage :
    python scripts/anticipation_brvmc.py
"""

from __future__ import annotations

import csv
import io
import os
import shutil
from datetime import date

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLASSEUR = os.path.join(RACINE, "Rapport CI - Analyse.xlsx")
TITRES = os.path.join(RACINE, "data", "titres.csv")

SOURCE = "Anticipation actions"
HISTO = "Historique"
CIBLE = "Anticipation BRVM Composite"

# Premiere et derniere ligne de donnees de la feuille source.
SRC_DEBUT, SRC_FIN = 5, 51

BLEU = "FF1F3864"
GRIS = "FFF2F2F2"
BORD = Border(*[Side(style="thin", color="FFD9D9D9")] * 4)


def lire_flottants() -> dict[str, float]:
    """Nombre de titres au flottant, par symbole."""
    with io.open(TITRES, encoding="utf-8-sig") as f:
        echantillon = f.read(4096)
        f.seek(0)
        sep = ";" if echantillon.count(";") > echantillon.count(",") else ","
        out: dict[str, float] = {}
        for r in csv.DictReader(f, delimiter=sep):
            code = (r.get("code") or "").strip().upper()
            if not code:
                continue
            try:
                flottant = float((r.get("float") or "0").replace(" ", "").replace(",", "."))
            except ValueError:
                flottant = 0.0
            if flottant > 0:
                out[code] = flottant
    return out


def main() -> int:
    if not os.path.exists(CLASSEUR):
        print(f"Classeur introuvable : {CLASSEUR}")
        return 1

    sauvegarde = os.path.join(
        RACINE, f"Rapport CI - Analyse.backup-{date.today().isoformat()}.xlsx"
    )
    shutil.copy2(CLASSEUR, sauvegarde)
    print(f"Sauvegarde : {os.path.basename(sauvegarde)}")

    flottants = lire_flottants()
    print(f"Flottants lus : {len(flottants)} titres")

    wb = load_workbook(CLASSEUR)
    if SOURCE not in wb.sheetnames:
        print(f"Feuille « {SOURCE} » absente.")
        return 1
    if CIBLE in wb.sheetnames:
        del wb[CIBLE]  # regeneration idempotente
    ws = wb.create_sheet(CIBLE)

    # Symboles de la feuille source, pour retrouver leur flottant.
    src = wb[SOURCE]
    symboles = {
        i: str(src.cell(row=i, column=2).value or "").strip().upper()
        for i in range(SRC_DEBUT, SRC_FIN + 1)
    }

    # Bornes de l'historique : les moyennes mobiles se calculent dessus.
    histo = wb[HISTO]
    derniere = histo.max_row
    while derniere > 1 and histo.cell(row=derniere, column=2).value is None:
        derniere -= 1
    mm50_debut = max(2, derniere - 49)
    mm200_debut = max(2, derniere - 199)
    seances = derniere - 1

    # ── Titre ────────────────────────────────────────────────────────────────
    ws["B1"] = "ANTICIPATION DE L'INDICE BRVM COMPOSITE"
    ws["B1"].font = Font(bold=True, size=13, color=BLEU)
    ws["B2"] = (
        "Reconstruction PAR LE BAS : le niveau anticipé est celui qu'atteindrait l'indice si "
        "chaque valeur rejoignait son cours cible, les autres restant inchangées. Pondération au "
        f"flottant. Moyennes mobiles calculées sur {seances} séances d'historique."
    )
    ws["B2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells("B2:J2")
    ws.row_dimensions[2].height = 42

    # ── Tableau des composantes ──────────────────────────────────────────────
    entetes = [
        ("B", "SYMB."), ("C", "Société"), ("D", "Cours"), ("E", "Cours cible"),
        ("F", "Potentiel"), ("G", "Flottant (titres)"), ("H", "Capi. flottante"),
        ("I", "Poids indice"), ("J", "Contribution"),
    ]
    for col, libelle in entetes:
        c = ws[f"{col}4"]
        c.value = libelle
        c.font = Font(bold=True, color="FFFFFFFF")
        c.fill = PatternFill("solid", fgColor=BLEU)
        c.alignment = Alignment(wrap_text=True, vertical="center")
        c.border = BORD
    ws.row_dimensions[4].height = 28

    premiere, sans_flottant = 5, []
    for k, i in enumerate(range(SRC_DEBUT, SRC_FIN + 1)):
        r = premiere + k
        sym = symboles.get(i, "")
        ws[f"B{r}"] = f"='{SOURCE}'!B{i}"
        ws[f"C{r}"] = f"='{SOURCE}'!C{i}"
        ws[f"D{r}"] = f"='{SOURCE}'!E{i}"
        # Le cours cible est repris TEL QUEL de la feuille source : sa formule
        # (BPA 2026e x PER median du secteur) y est definie une seule fois.
        ws[f"E{r}"] = f"='{SOURCE}'!Y{i}"
        ws[f"F{r}"] = f'=IFERROR(E{r}/D{r}-1,"")'
        flottant = flottants.get(sym)
        if flottant:
            ws[f"G{r}"] = flottant
        else:
            sans_flottant.append(sym)
        ws[f"H{r}"] = f'=IFERROR(D{r}*G{r},"")'
        ws[f"I{r}"] = f'=IFERROR(H{r}/$H${premiere + 47},"")'
        # Une valeur sans cours cible ne contribue PAS : elle est supposée
        # inchangée, ce qui est l'hypothèse prudente. La dire explicitement
        # évite de prendre une absence de projection pour une projection nulle.
        ws[f"J{r}"] = f"=IFERROR(I{r}*F{r},0)"
        for col in "BCDEFGHIJ":
            ws[f"{col}{r}"].border = BORD
        ws[f"D{r}"].number_format = "# ##0"
        ws[f"E{r}"].number_format = "# ##0"
        ws[f"F{r}"].number_format = "0.0%"
        ws[f"G{r}"].number_format = "# ##0"
        ws[f"H{r}"].number_format = "# ##0"
        ws[f"I{r}"].number_format = "0.00%"
        ws[f"J{r}"].number_format = "0.00%"

    total = premiere + 47
    ws[f"C{total}"] = "TOTAL"
    ws[f"H{total}"] = f"=SUM(H{premiere}:H{total - 1})"
    ws[f"I{total}"] = f"=SUM(I{premiere}:I{total - 1})"
    ws[f"J{total}"] = f"=SUM(J{premiere}:J{total - 1})"
    for col in "CHIJ":
        ws[f"{col}{total}"].font = Font(bold=True)
        ws[f"{col}{total}"].fill = PatternFill("solid", fgColor=GRIS)
        ws[f"{col}{total}"].border = BORD
    ws[f"H{total}"].number_format = "# ##0"
    ws[f"I{total}"].number_format = "0.00%"
    ws[f"J{total}"].number_format = "0.00%"

    # ── Synthèse ─────────────────────────────────────────────────────────────
    s = total + 2
    ws[f"B{s}"] = "SYNTHÈSE"
    ws[f"B{s}"].font = Font(bold=True, size=11, color=BLEU)

    lignes = [
        ("Niveau actuel du Composite", f"='{HISTO}'!B{derniere}", "# ##0.00"),
        ("Date de l'observation", f"='{HISTO}'!A{derniere}", "dd/mm/yyyy"),
        ("Part de l'indice couverte par un cours cible",
         f'=IFERROR(SUMIF(E{premiere}:E{total - 1},">0",I{premiere}:I{total - 1}),0)', "0.0%"),
        ("Potentiel agrégé (valeurs non couvertes supposées inchangées)",
         f"=J{total}", "0.00%"),
        ("Niveau anticipé — hypothèse prudente",
         f"=IFERROR(B{s + 1}*(1+B{s + 4}),\"\")", "# ##0.00"),
        ("Potentiel extrapolé (non couvertes alignées sur la moyenne couverte)",
         f'=IFERROR(B{s + 4}/B{s + 3},"")', "0.00%"),
        ("Niveau anticipé — hypothèse extrapolée",
         f"=IFERROR(B{s + 1}*(1+B{s + 6}),\"\")", "# ##0.00"),
        ("Moyenne mobile 50 séances",
         f"=AVERAGE('{HISTO}'!B{mm50_debut}:B{derniere})", "# ##0.00"),
        ("Moyenne mobile 200 séances",
         f"=AVERAGE('{HISTO}'!B{mm200_debut}:B{derniere})", "# ##0.00"),
        ("Signal technique",
         f'=IF(AND(B{s + 1}>B{s + 8},B{s + 8}>B{s + 9}),"haussier",'
         f'IF(AND(B{s + 1}<B{s + 8},B{s + 8}<B{s + 9}),"baissier","indécis"))', "General"),
    ]
    for k, (libelle, formule, fmt) in enumerate(lignes, start=1):
        ws[f"A{s + k}"] = libelle
        ws[f"B{s + k}"] = formule
        ws[f"B{s + k}"].number_format = fmt
        ws[f"A{s + k}"].alignment = Alignment(wrap_text=True, vertical="center")
        ws[f"B{s + k}"].font = Font(bold=True)

    # ── Notes de méthode ─────────────────────────────────────────────────────
    n = s + len(lignes) + 2
    notes = [
        "MÉTHODE — le Composite est la somme pondérée de ses composantes, pas une courbe à "
        "prolonger. On l'anticipe donc PAR LE BAS : chaque valeur est supposée rejoindre son cours "
        "cible, et l'on recompose l'indice. Extrapoler la série elle-même ignorerait le travail "
        "déjà fait valeur par valeur.",

        "PONDÉRATION — au FLOTTANT (nombre de titres échangeables × cours), et non à la "
        "capitalisation totale. C'est la convention de l'indice, et l'écart n'est pas anecdotique "
        "sur la cote régionale, où plusieurs sociétés ont un flottant inférieur à 20 % du capital. "
        "Les flottants viennent de data/titres.csv.",

        "DEUX HYPOTHÈSES, parce qu'une seule serait trompeuse. La PRUDENTE suppose inchangées les "
        "valeurs sans cours cible : elle sous-estime le mouvement, mais ne suppose rien. "
        "L'EXTRAPOLÉE leur applique le potentiel moyen des valeurs couvertes : elle suppose que le "
        "non-couvert se comporte comme le couvert, ce qui n'est vrai que si l'absence de projection "
        "est sans rapport avec la performance — hypothèse commode, jamais vérifiée.",

        "CE QUE CETTE FEUILLE NE FAIT PAS — elle ne dit pas QUAND. Un cours cible n'a pas "
        "d'échéance : il indique un niveau, pas une date. Elle ne tient pas compte des variations "
        "de flottant, des entrées et sorties de cote, ni du diviseur de l'indice, qui absorbe ces "
        "évènements. Sur un horizon court ces effets sont négligeables ; sur un an, ils ne le sont "
        "plus.",

        "LIVE — la feuille est écrite en formules : elle lit « Anticipation actions » et "
        "« Historique ». Rafraîchir ces deux feuilles suffit à mettre l'anticipation à jour. Seuls "
        "les flottants sont figés, et se régénèrent par scripts/anticipation_brvmc.py.",
    ]
    for k, texte in enumerate(notes):
        c = ws.cell(row=n + k * 2, column=2, value=texte)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.merge_cells(start_row=n + k * 2, start_column=2, end_row=n + k * 2, end_column=10)
        ws.row_dimensions[n + k * 2].height = 46

    ws.column_dimensions["A"].width = 46
    for col, w in zip("BCDEFGHIJ", (10, 30, 11, 12, 11, 16, 18, 12, 13)):
        ws.column_dimensions[col].width = w
    ws.sheet_view.showGridLines = False
    ws.freeze_panes = "B5"

    wb.save(CLASSEUR)
    print(f"Feuille « {CIBLE} » écrite ({SRC_FIN - SRC_DEBUT + 1} valeurs).")
    if sans_flottant:
        print(
            f"Sans flottant connu, poids nul : {', '.join(x for x in sans_flottant if x)}"
        )
    print(f"Historique : {seances} séances, MM50 sur B{mm50_debut}:B{derniere}, "
          f"MM200 sur B{mm200_debut}:B{derniere}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

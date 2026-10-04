import "server-only";

import ExcelJS from "exceljs";

import type { ExportSoldes } from "@/app/gestion-portefeuille/soldes-export";

// === Le classeur d'export des soldes ======================================
//
// UN BLOC PAR FONDS, SEPARES D'UNE SEULE LIGNE. Le premier jet reproduisait
// les NUMEROS DE LIGNE du classeur — solde d'OPPORTUNITES en 10, de NSIA FONDS
// DIVERSIFIE en 56 — pour qu'un collage retombe a la meme adresse. Mais le
// gerant colle FONDS PAR FONDS : il selectionne une ligne et la pose ou il
// faut. Les quarante-quatre lignes vides entre deux blocs ne servaient donc a
// rien, sinon a faire defiler.
//
// LES COLONNES, ELLES, GARDENT LEUR PLACE. La premiere banque reste en C comme
// dans la feuille : copier C:Z d'une ligne et la coller en C de l'autre tombe
// juste sans reflechir.
//
// CHAQUE BLOC DIT OU IL VA. « FCP AURORE OPPORTUNITES — ligne 10 » : le nom
// seul obligerait a chercher le bloc dans la feuille, et quinze blocs se
// ressemblent.
//
// UNE DEUXIEME FEUILLE DIT CE QUI N'A PAS SUIVI : les blocs sans fonds, les
// colonnes sans compte, les comptes sans colonne. Un export muet sur ses trous
// est un export qu'on croit complet.

const FMT_MONTANT = "#,##0";

export async function buildSoldesExcel(donnees: ExportSoldes): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AzimutFinance — gestion de portefeuille";
  wb.created = new Date();

  // ── Feuille 1 : les blocs, à la suite ───────────────────────────────────
  const ws = wb.addWorksheet("Point de trésorerie");
  let ligne = 1;
  for (const l of donnees.lignes) {
    const entetes = ws.getRow(ligne);
    const soldes = ws.getRow(ligne + 1);
    // Deux lignes de bloc, une de respiration.
    ligne += 3;

    // Le nom du fonds ET SA LIGNE DANS LE CLASSEUR : le nom seul obligerait à
    // chercher le bloc dans la feuille, et quinze blocs se ressemblent.
    const titre = entetes.getCell(1);
    titre.value = `${l.intitule} — ligne ${l.ligneSolde}`;
    titre.font = { bold: true };
    soldes.getCell(1).value = "SOLDE";
    soldes.getCell(1).font = { bold: true };

    l.entetes.forEach((e, i) => {
      const cEntete = entetes.getCell(l.colonneDebut + i);
      cEntete.value = e;
      cEntete.font = { bold: true, size: 9 };
      cEntete.alignment = { horizontal: "center", wrapText: true };

      const v = l.soldes[i];
      const cSolde = soldes.getCell(l.colonneDebut + i);
      // UNE COLONNE SANS COMPTE RESTE VIDE. Un zéro collé par-dessus un solde
      // saisi l'effacerait, et personne ne s'en apercevrait avant le total.
      if (v != null) {
        cSolde.value = v;
        cSolde.numFmt = FMT_MONTANT;
      }
    });
    entetes.commit();
    soldes.commit();
  }
  // La colonne A porte les intitulés de fonds, les deux suivantes rien : la
  // première banque reste en C, comme dans la feuille.
  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 4;
  for (let c = 3; c <= 30; c++) ws.getColumn(c).width = 16;
  // Les en-têtes de chaque bloc restent lisibles quand on fait défiler les
  // quinze fonds : le volet se fige sur la colonne des intitulés.
  ws.views = [{ state: "frozen", xSplit: 1 }];

  // ── Feuille 2 : ce qui n'a pas suivi ────────────────────────────────────
  const ctrl = wb.addWorksheet("Contrôle");
  ctrl.columns = [
    { header: "Fonds", width: 38 },
    { header: "Ligne", width: 8 },
    { header: "Colonnes servies", width: 18 },
    { header: "Observation", width: 90 },
  ];
  ctrl.getRow(1).font = { bold: true };

  for (const l of donnees.lignes) {
    const servies = l.soldes.filter((s) => s != null).length;
    const manques = l.entetes.filter((_, i) => l.soldes[i] == null);
    const observations: string[] = [];
    if (l.probleme) observations.push(l.probleme);
    if (manques.length > 0) {
      observations.push(
        `Aucun compte au site pour : ${manques.join(", ")} — cellules laissées vides.`,
      );
    }
    if (l.sansColonne.length > 0) {
      observations.push(
        "LE SITE PORTE UN SOLDE QUE LA FEUILLE N'ATTEND PAS : " +
          l.sansColonne
            .map((s) => `${s.libelle} (${Math.round(s.solde).toLocaleString("fr-FR")})`)
            .join(", ") +
          " — ajoute la colonne au classeur, ou corrige le libellé de la fiche.",
      );
    }
    ctrl.addRow([
      l.intitule,
      l.ligneSolde,
      `${servies} / ${l.entetes.length}`,
      observations.join(" · ") || "Tout est tombé en face.",
    ]);
  }
  for (const o of donnees.orphelins) {
    ctrl.addRow(["(bloc non rattaché)", "", "", o]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

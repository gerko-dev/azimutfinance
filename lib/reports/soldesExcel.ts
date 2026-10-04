import "server-only";

import ExcelJS from "exceljs";

import type { ExportSoldes } from "@/app/gestion-portefeuille/soldes-export";

// === Le classeur d'export des soldes ======================================
//
// IL EST CALQUÉ SUR LE CLASSEUR DU GÉRANT, ligne pour ligne et colonne pour
// colonne. Le solde du FCP AURORE OPPORTUNITES tombe en C10 parce que c'est là
// qu'il est dans sa feuille ; celui de NSIA FONDS DIVERSIFIE en C56 pour la
// même raison. Le copier-coller n'a donc rien à viser : on sélectionne la
// plage d'un fonds et on la colle à la même adresse.
//
// RIEN D'AUTRE N'EST ÉCRIT DANS CETTE FEUILLE. Pas de titre, pas de total, pas
// de poste à côté : tout ce qu'on ajouterait serait collé par mégarde
// par-dessus une formule du classeur. Les en-têtes de banque figurent, eux,
// juste au-dessus des soldes — non pour être collés, mais pour vérifier d'un
// coup d'œil que les colonnes tombent en face.
//
// UNE DEUXIÈME FEUILLE DIT CE QUI N'A PAS SUIVI : les blocs sans fonds, les
// colonnes sans compte, les comptes sans colonne. Un export muet sur ses trous
// est un export qu'on croit complet.

const FMT_MONTANT = "#,##0";

export async function buildSoldesExcel(donnees: ExportSoldes): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AzimutFinance — gestion de portefeuille";
  wb.created = new Date();

  // ── Feuille 1 : le calque ───────────────────────────────────────────────
  const ws = wb.addWorksheet("Point de trésorerie");
  for (const l of donnees.lignes) {
    const entetes = ws.getRow(l.ligneSolde - 1);
    const soldes = ws.getRow(l.ligneSolde);

    // Le nom du fonds, à gauche de ses en-têtes : il ne se colle pas, il
    // SITUE. Sans lui, quinze lignes de nombres se ressemblent toutes.
    entetes.getCell(l.colonneDebut - 1).value = l.intitule;
    soldes.getCell(l.colonneDebut - 1).value = "SOLDE";
    soldes.getCell(l.colonneDebut - 1).font = { bold: true };

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
  for (let c = 1; c <= 30; c++) ws.getColumn(c).width = c <= 2 ? 30 : 16;

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

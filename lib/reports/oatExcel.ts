import "server-only";

import ExcelJS from "exceljs";

import type { ExportOat } from "@/app/gestion-portefeuille/oat-export";

// === Le classeur des OAT cessibles ========================================
//
// CINQ COLONNES, DANS L'ORDRE DU TABLEAU QUE LA CONTREPARTIE ENVOIE : Titre,
// Quantité, Facial, Échéance, Prix de cession. Rien de plus dans la première
// feuille — ce qu'on y ajouterait, il faudrait l'effacer avant de transmettre.
//
// CONSOLAS 9 PARTOUT. Une police à chasse fixe aligne les ISIN et les
// quantités colonne par colonne : on repère une faute de frappe dans
// « GW0000001416 » à l'œil, ce qu'une police proportionnelle interdit.
//
// LES NOMBRES SONT DES NOMBRES, et les dates des dates : la contrepartie va
// recalculer dessus. Du texte l'obligerait à retaper la colonne.
//
// UNE DEUXIÈME FEUILLE MONTRE LE CALCUL. Le prix d'un réméré n'est pas une
// cotation : il se déduit du rendement visé, et le gérant doit pouvoir le
// refaire avant de l'envoyer. On y pose les DEUX MONTANTS QUI S'ÉCHANGENT —
// ce que la contrepartie débourse le jour J, courus compris, et ce qu'elle
// reçoit au terme — puis le rendement obtenu, qui doit rendre la cible.
//
// UNE TROISIÈME DIT D'OÙ VIENT CETTE CIBLE : les trois dernières séances
// d'adjudication de chaque État, avec leurs montants et leurs taux. Un
// rendement de référence qu'on ne peut pas remonter jusqu'à sa source est un
// rendement qu'on ne défend pas devant une contrepartie.

const POLICE = { name: "Consolas", size: 9 } as const;
const FMT_QTE = "#,##0";
const FMT_PRIX = "#,##0.00";
const FMT_PCT = "0.00%";
const FMT_PCT3 = "0.000%";
const FMT_DATE = "dd/mm/yyyy";

export async function buildOatExcel(donnees: ExportOat): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AzimutFinance — gestion de portefeuille";
  wb.created = new Date();

  // ── Feuille 1 : le tableau, et rien d'autre ─────────────────────────────
  const ws = wb.addWorksheet("OAT cessibles");
  ws.columns = [
    { key: "titre", width: 18 },
    { key: "quantite", width: 12 },
    { key: "facial", width: 10 },
    { key: "echeance", width: 13 },
    { key: "prix", width: 16 },
  ];

  const entete = ws.addRow(["Titre", "Quantité", "Facial", "Échéance", "Prix de cession"]);
  entete.eachCell((c) => {
    c.font = { ...POLICE, bold: true };
    c.alignment = { horizontal: "center" };
    c.border = { bottom: { style: "thin" } };
  });

  for (const l of donnees.lignes) {
    const r = ws.addRow([
      l.titre,
      l.quantite,
      l.facial,
      l.echeance ? new Date(`${l.echeance}T00:00:00Z`) : null,
      Number(l.prixCession.toFixed(2)),
    ]);
    r.eachCell((c) => (c.font = { ...POLICE }));
    r.getCell(2).numFmt = FMT_QTE;
    r.getCell(3).numFmt = FMT_PCT;
    r.getCell(4).numFmt = FMT_DATE;
    r.getCell(5).numFmt = FMT_PRIX;
    // LE LIBELLÉ EN COMMENTAIRE, PAS EN COLONNE : la contrepartie attend cinq
    // colonnes, et le titre se lit par son ISIN. Mais un ISIN seul ne se
    // relit pas, et l'info-bulle le dit sans encombrer le tableau.
    r.getCell(1).note =
      `${l.libelle}\n` +
      `Déboursé ${l.debourse.toFixed(2)} (prix + ${l.courusJour.toFixed(2)} de courus)\n` +
      `Encaissé au terme ${l.encaisse.toFixed(2)}\n` +
      `Décote ${(l.decote * 100).toFixed(2)} % · rendement ${(l.rendementObtenu * 100).toFixed(2)} % l'an` +
      (l.reserve ? `\n${l.reserve}` : "");
    if (l.reserve) r.getCell(1).font = { ...POLICE, color: { argb: "FFB45309" } };
  }

  // Le total, détaché d'une ligne : il se lit, il ne se colle pas.
  if (donnees.lignes.length > 0) {
    ws.addRow([]);
    const total = ws.addRow([
      `${donnees.lignes.length} OAT`,
      donnees.lignes.reduce((s, l) => s + l.quantite, 0),
      null,
      null,
      Number(
        donnees.lignes.reduce((s, l) => s + l.quantite * l.prixCession, 0).toFixed(2),
      ),
    ]);
    total.eachCell((c) => (c.font = { ...POLICE, bold: true }));
    total.getCell(2).numFmt = FMT_QTE;
    total.getCell(5).numFmt = FMT_PRIX;
  }

  ws.addRow([]);
  for (const texte of [
    `${donnees.fondsNom} — inventaire du ${donnees.dateInventaire ?? "?"} — quantités nettes des titres prêtés, pris en réméré et déjà engagés à la vente`,
    `Prix pied de coupon, pour un réméré de ${donnees.dureeMois} mois (du ${donnees.dateRef} au ${donnees.dateTerme}), rachat au pair`,
    `Rendement visé : celui des ${donnees.references.length > 0 ? "trois dernières adjudications de l'État émetteur" : "dernières adjudications souveraines"}${
      donnees.references.length > 0
        ? " — " +
          donnees.references
            .map((r) => `${r.pays} ${(r.reference.taux * 100).toFixed(2)} %`)
            .join(", ")
        : ""
    }`,
    "Le règlement se fait courus compris : ajouter les intérêts courus du jour au prix ci-dessus (feuille « Calcul »).",
  ]) {
    const r = ws.addRow([texte]);
    r.getCell(1).font = { ...POLICE, italic: true, color: { argb: "FF64748B" } };
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];

  // ── Feuille 2 : d'où sort le prix ───────────────────────────────────────
  const calc = wb.addWorksheet("Calcul");
  calc.columns = [
    { key: "titre", width: 18 },
    { key: "pays", width: 7 },
    { key: "pair", width: 11 },
    { key: "facial", width: 9 },
    { key: "courusJ", width: 13 },
    { key: "prix", width: 14 },
    { key: "debourse", width: 14 },
    { key: "flux", width: 13 },
    { key: "courusT", width: 13 },
    { key: "encaisse", width: 14 },
    { key: "decote", width: 10 },
    { key: "cible", width: 11 },
    { key: "obtenu", width: 11 },
  ];
  const eCalc = calc.addRow([
    "Titre",
    "Pays",
    "Pair",
    "Facial",
    "Courus J",
    "Prix",
    "Déboursé J",
    "Flux période",
    "Courus terme",
    "Encaissé terme",
    "Décote",
    "Cible an.",
    "Obtenu an.",
  ]);
  eCalc.eachCell((c) => {
    c.font = { ...POLICE, bold: true };
    c.alignment = { horizontal: "center", wrapText: true };
    c.border = { bottom: { style: "thin" } };
  });
  for (const l of [...donnees.lignes, ...donnees.ecartees]) {
    const r = calc.addRow([
      l.titre,
      l.pays,
      l.pair,
      l.facial,
      Number(l.courusJour.toFixed(2)),
      Number(l.prixCession.toFixed(2)),
      Number(l.debourse.toFixed(2)),
      Number(l.fluxPeriode.toFixed(2)),
      Number(l.courusTerme.toFixed(2)),
      Number(l.encaisse.toFixed(2)),
      l.decote,
      l.rendementCible,
      l.rendementObtenu,
    ]);
    r.eachCell((c) => (c.font = { ...POLICE }));
    r.getCell(3).numFmt = FMT_QTE;
    r.getCell(4).numFmt = FMT_PCT;
    for (const i of [5, 6, 7, 8, 9, 10]) r.getCell(i).numFmt = FMT_PRIX;
    r.getCell(11).numFmt = FMT_PCT;
    r.getCell(12).numFmt = FMT_PCT;
    r.getCell(13).numFmt = FMT_PCT3;
    if (l.reserve) {
      r.getCell(1).font = { ...POLICE, color: { argb: "FFB45309" } };
      r.getCell(1).note = l.reserve;
    }
  }
  calc.addRow([]);
  for (const texte of [
    `Déboursé au jour J = prix + courus du jour. Encaissé au terme = pair + courus au terme + coupons et amortissements de la période (${donnees.dateRef} → ${donnees.dateTerme}).`,
    "Prix = encaissé ÷ (1 + rendement annuel) ^ (mois ÷ 12) − courus du jour.",
    "Rendement obtenu = (encaissé ÷ déboursé) ^ (12 ÷ mois) − 1. Il doit rendre la cible : c'est le contrôle.",
    "Décote NÉGATIVE = surcote : le titre vaut plus que le pair parce qu'il porte un coupon supérieur au rendement du guichet.",
    "Un titre échéant avant le terme n'a pas de rachat : son capital est dans les flux de la période, et le pair ne s'y ajoute pas.",
  ]) {
    const r = calc.addRow([texte]);
    r.getCell(1).font = { ...POLICE, italic: true, color: { argb: "FF64748B" } };
  }
  calc.views = [{ state: "frozen", ySplit: 1 }];

  // ── Feuille 3 : le rendement de reference, seance par seance ────────────
  //
  // UN TAUX QU'ON NE PEUT PAS REMONTER JUSQU'A SA SOURCE est un taux qu'on ne
  // defend pas devant une contrepartie.
  if (donnees.references.length > 0) {
    const ref = wb.addWorksheet("Adjudications");
    ref.columns = [
      { key: "pays", width: 8 },
      { key: "date", width: 13 },
      { key: "montant", width: 18 },
      { key: "taux", width: 11 },
    ];
    const e = ref.addRow(["Pays", "Séance", "Montant adjugé", "Rendement"]);
    e.eachCell((c) => {
      c.font = { ...POLICE, bold: true };
      c.border = { bottom: { style: "thin" } };
    });
    for (const { pays, reference } of donnees.references) {
      for (const s of reference.seances) {
        const r = ref.addRow([
          pays,
          new Date(`${s.date}T00:00:00Z`),
          Math.round(s.montant),
          s.taux,
        ]);
        r.eachCell((c) => (c.font = { ...POLICE }));
        r.getCell(2).numFmt = FMT_DATE;
        r.getCell(3).numFmt = FMT_QTE;
        r.getCell(4).numFmt = FMT_PCT;
      }
      const moy = ref.addRow([pays, "Moyenne", null, reference.taux]);
      moy.eachCell((c) => (c.font = { ...POLICE, bold: true }));
      moy.getCell(4).numFmt = FMT_PCT;
    }
    ref.addRow([]);
    const note = ref.addRow([
      "Moyenne pondérée par les montants adjugés, sur les trois dernières SÉANCES de chaque État — une séance met souvent plusieurs souches en vente le même jour.",
    ]);
    note.getCell(1).font = { ...POLICE, italic: true, color: { argb: "FF64748B" } };
  }

  // ── Feuille 4 : ce qui n'a pas suivi ────────────────────────────────────
  //
  // Une OAT détenue mais incessible doit SE VOIR : sans cette feuille, le
  // gérant croit l'avoir oubliée, et la cherche dans l'inventaire.
  if (donnees.ecartees.length > 0 || donnees.avertissements.length > 0) {
    const ctrl = wb.addWorksheet("Écartées");
    ctrl.columns = [
      { key: "titre", width: 18 },
      { key: "detenue", width: 12 },
      { key: "pretee", width: 12 },
      { key: "remeree", width: 14 },
      { key: "engagee", width: 14 },
      { key: "mouvements", width: 14 },
      { key: "dispo", width: 12 },
    ];
    const e = ctrl.addRow([
      "Titre",
      "Inventaire",
      "Prêtés",
      "Pris en réméré",
      "Déjà en vente",
      "Mouvements",
      "Cessible",
    ]);
    e.eachCell((c) => {
      c.font = { ...POLICE, bold: true };
      c.border = { bottom: { style: "thin" } };
    });
    for (const l of donnees.ecartees) {
      const r = ctrl.addRow([
        l.titre,
        l.dispo.detenue,
        l.dispo.pretee,
        l.dispo.remeree,
        l.dispo.engagee,
        l.dispo.mouvements,
        l.dispo.disponible,
      ]);
      r.eachCell((c) => {
        c.font = { ...POLICE };
        if (typeof c.value === "number") c.numFmt = FMT_QTE;
      });
    }
    if (donnees.avertissements.length > 0) {
      ctrl.addRow([]);
      for (const a of donnees.avertissements) {
        const r = ctrl.addRow([a]);
        r.getCell(1).font = { ...POLICE, color: { argb: "FFB45309" } };
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

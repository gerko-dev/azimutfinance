import "server-only";

import ExcelJS from "exceljs";

import type { ExportOat } from "@/app/gestion-portefeuille/oat-export";

// === Le classeur des OAT cessibles ========================================
//
// SIX COLONNES : Titre, Quantité, Facial, Échéance, Prix de cession, et le
// RENDEMENT INDUIT. Les cinq premières sont celles du tableau que la
// contrepartie envoie ; la sixième est celle qu'elle calculerait elle-même.
// Le prix se cote au multiple de cinq francs, ce qui écarte le rendement de
// sa cible de quelques points de base : publier l'écart vaut mieux que de le
// laisser découvrir.
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
    { key: "induit", width: 16 },
  ];

  const entete = ws.addRow([
    "Titre",
    "Quantité",
    "Facial",
    "Échéance",
    "Prix de cession",
    "Rendement induit",
  ]);
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
      l.prixCession,
      l.rendementInduit,
    ]);
    r.eachCell((c) => (c.font = { ...POLICE }));
    r.getCell(2).numFmt = FMT_QTE;
    r.getCell(3).numFmt = FMT_PCT;
    r.getCell(4).numFmt = FMT_DATE;
    r.getCell(5).numFmt = FMT_QTE;
    r.getCell(6).numFmt = FMT_PCT3;
    // LE LIBELLÉ EN COMMENTAIRE, PAS EN COLONNE : la contrepartie attend cinq
    // colonnes, et le titre se lit par son ISIN. Mais un ISIN seul ne se
    // relit pas, et l'info-bulle le dit sans encombrer le tableau.
    r.getCell(1).note =
      `${l.libelle}\n` +
      `Résiduel ${l.dureeResiduelle.toFixed(1)} ans · référence ${l.pays} ${
        l.reference.tenor ?? "?"
      } ans à ${(l.rendementCible * 100).toFixed(2)} %\n` +
      `Prix exact ${l.prixExact.toFixed(2)}, coté ${l.prixCession}\n` +
      `Déboursé ${l.debourse.toFixed(2)} (prix + ${l.courusJour.toFixed(2)} de courus)\n` +
      `Encaissé au terme ${l.encaisse.toFixed(2)} · décote ${(l.decote * 100).toFixed(2)} %` +
      (l.reserve ? `\n${l.reserve}` : "");
    if (l.reserve) r.getCell(1).font = { ...POLICE, color: { argb: "FFB45309" } };
  }

  // Le total, détaché d'une ligne : il se lit, il ne se colle pas.
  if (donnees.lignes.length > 0) {
    ws.addRow([]);
    const assiette = donnees.lignes.reduce((s, l) => s + l.quantite * l.prixCession, 0);
    const total = ws.addRow([
      `${donnees.lignes.length} OAT`,
      donnees.lignes.reduce((s, l) => s + l.quantite, 0),
      null,
      null,
      Math.round(assiette),
      // LE RENDEMENT D'ENSEMBLE, pondéré par ce que chaque ligne représente :
      // c'est le taux de l'opération, et non la moyenne de taux de lignes qui
      // ne pèsent pas le même poids.
      assiette > 0
        ? donnees.lignes.reduce(
            (s, l) => s + l.rendementInduit * ((l.quantite * l.prixCession) / assiette),
            0,
          )
        : null,
    ]);
    total.eachCell((c) => (c.font = { ...POLICE, bold: true }));
    total.getCell(2).numFmt = FMT_QTE;
    total.getCell(5).numFmt = FMT_QTE;
    total.getCell(6).numFmt = FMT_PCT3;
  }

  ws.addRow([]);
  for (const texte of [
    `${donnees.fondsNom} — inventaire du ${donnees.dateInventaire ?? "?"} — quantités nettes des titres prêtés, pris en réméré et déjà engagés à la vente`,
    `Prix pied de coupon, pour un réméré de ${donnees.dureeMois} mois (du ${donnees.dateRef} au ${donnees.dateTerme}), rachat au pair`,
    `Rendement visé : moyenne des trois dernières adjudications de l'État émetteur AU TÉNOR DE LA DURÉE RÉSIDUELLE${
      donnees.references.length > 0
        ? " — " +
          donnees.references
            .map(
              (r) =>
                `${r.pays} ${r.reference.tenor ?? "?"} ans ${(r.reference.taux * 100).toFixed(2)} %`,
            )
            .join(", ")
        : ""
    }`,
    `Prix coté au multiple de ${5} F : le rendement induit s'écarte de la cible de quelques points de base, et c'est lui qui se vérifie.`,
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
    { key: "prixExact", width: 13 },
    { key: "prix", width: 12 },
    { key: "debourse", width: 14 },
    { key: "flux", width: 13 },
    { key: "courusT", width: 13 },
    { key: "encaisse", width: 14 },
    { key: "decote", width: 10 },
    { key: "cible", width: 11 },
    { key: "induit", width: 11 },
  ];
  const eCalc = calc.addRow([
    "Titre",
    "Pays",
    "Pair",
    "Facial",
    "Courus J",
    "Prix exact",
    "Prix coté",
    "Déboursé J",
    "Flux période",
    "Courus terme",
    "Encaissé terme",
    "Décote",
    "Cible an.",
    "Induit an.",
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
      Number(l.prixExact.toFixed(2)),
      l.prixCession,
      Number(l.debourse.toFixed(2)),
      Number(l.fluxPeriode.toFixed(2)),
      Number(l.courusTerme.toFixed(2)),
      Number(l.encaisse.toFixed(2)),
      l.decote,
      l.rendementCible,
      l.rendementInduit,
    ]);
    r.eachCell((c) => (c.font = { ...POLICE }));
    r.getCell(3).numFmt = FMT_QTE;
    r.getCell(4).numFmt = FMT_PCT;
    for (const i of [5, 6, 8, 9, 10, 11]) r.getCell(i).numFmt = FMT_PRIX;
    r.getCell(7).numFmt = FMT_QTE;
    r.getCell(12).numFmt = FMT_PCT;
    r.getCell(13).numFmt = FMT_PCT;
    r.getCell(14).numFmt = FMT_PCT3;
    if (l.reserve) {
      r.getCell(1).font = { ...POLICE, color: { argb: "FFB45309" } };
      r.getCell(1).note = l.reserve;
    }
  }
  calc.addRow([]);
  for (const texte of [
    `Déboursé au jour J = prix + courus du jour. Encaissé au terme = pair + courus au terme + coupons et amortissements de la période (${donnees.dateRef} → ${donnees.dateTerme}).`,
    "Prix exact = encaissé ÷ (1 + rendement cible) ^ (mois ÷ 12) − courus du jour. Prix coté = arrondi au multiple de 5 F le plus proche.",
    "Rendement induit = (encaissé ÷ (prix coté + courus du jour)) ^ (12 ÷ mois) − 1. Il s'écarte de la cible du seul fait de l'arrondi.",
    "Cible = moyenne pondérée des trois dernières séances de l'État au ténor couvrant la durée résiduelle (moins de 3 ans → 3 ans, moins de 5 → 5 ans, etc.).",
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

import "server-only";

// === Export des propositions vers le courtier ===
//
// Le classeur produit N'EST PAS reconstruit : on OUVRE template_propositions.xlsx
// et on se contente d'y ecrire les lignes. C'est la seule facon de garantir
// « meme format, meme contenu, meme formatage » — polices Avenir, aplats
// FF002060 (achats) et FFC00000 (ventes), bordures fines, largeurs de colonnes,
// marges d'impression et quadrillage masque restent ceux du fichier d'origine,
// sans qu'aucune de ces valeurs n'ait a etre redite ici. Un classeur genere de
// zero les perdrait tous, et surtout divergerait silencieusement le jour ou le
// gerant retouche son modele.
//
// Disposition du modele, identique sur les deux feuilles : deux blocs COTE A
// COTE, les ACHATS a gauche, les VENTES a droite, separes par une colonne vide.
// La colonne « Sens » est pre-remplie dans le modele ; on la reecrit quand meme,
// puisque le nombre de lignes varie.
//
//   Actions      B Symbole | C Titre | D Sens | E Quantite | F Prix
//                (vide G)  H Symbole | I Titre | J Sens | K Quantite | L Prix
//   Obligations  B Symbole | C Titre | D Sens | E Maturite residuelle
//                | F Coupon | G Quantite | H Prix
//                (vide I)  J..P : les memes, pour les ventes

import path from "node:path";
import ExcelJS from "exceljs";

import type { PlanOperations } from "./operations-types";

/** Le modele vit a la racine du depot, ou le gerant le retouche directement. */
const MODELE = "template_propositions.xlsx";

/** Premiere ligne de donnees : la ligne 2 porte les en-tetes. */
const PREMIERE_LIGNE = 3;

/** Lignes de donnees deja presentes dans le modele, a vider si on en ecrit moins. */
const LIGNES_MODELE = 2;

/**
 * Montant en deca duquel une operation n'est pas transmise au courtier.
 *
 * Regle de gestion, pas d'affichage : une ligne sous ce seuil encombre la
 * soumission sans peser dans le portefeuille. Elle reste visible a l'ecran, ou
 * le gerant arbitre — seul l'export la retient.
 */
const SEUIL_EXPORT = 50_000_000;

/**
 * Formats de nombre appliques aux colonnes de donnees.
 *
 * L'espace insecable est IMPOSE par « #\ ##0 » plutot que laisse au « #,##0 »
 * usuel : ce dernier delegue le separateur a la locale de celui qui ouvre le
 * fichier, et afficherait « 1,234 » chez un courtier en locale anglaise. La
 * barre oblique inverse echappe l'espace, qui devient un litteral.
 */
const MILLIERS = '#\\ ##0';

/** Maturite residuelle : deux decimales, en annees, sans suffixe. */
const MATURITE = "0.00";

/**
 * Marge de negociation appliquee AU SEUL FICHIER COURTIER, et AUX SEULES
 * OBLIGATIONS : on demande a acheter 1,5 % sous le prix retenu, et a vendre
 * 1,5 % au-dessus.
 *
 * Elle ne touche ni le moteur ni l'ecran : le site continue d'afficher le prix
 * de reference, qui reste la valeur sur laquelle l'arbitrage a ete decide. Ce
 * qui part au courtier est une INSTRUCTION de negociation, pas une valorisation.
 *
 * Les ACTIONS en sont exclues : leur prix limite porte deja sa propre marge de
 * negociation (MARGE_PRIX_ACTION, 2,5 % dans le meme sens), arretee cote site.
 * Les empiler reviendrait a negocier deux fois le meme ecart.
 */
const MARGE_COURTIER = 0.015;

/** Nominal de reference d'un titre du Tresor UMOA. */
const PAIR = 10_000;

/**
 * Prix a inscrire dans le fichier, marge de negociation comprise.
 *
 * Le plafond des ventes traduit une regle du gerant : une ligne qui ne vaut pas
 * le pair ne doit JAMAIS etre proposee au pair. Sans lui, un titre a 9 890 F
 * majore de 1,5 % ressortirait a 10 038 F — au-dessus du nominal, ce qu'aucun
 * acheteur ne paiera pour une signature decotee, et ce qui ferait passer pour
 * une prime ce qui reste une decote.
 */
function prixCourtier(prixReel: number, sens: "achat" | "vente"): number {
  if (sens === "achat") return Math.round(prixReel * (1 - MARGE_COURTIER));
  const majore = Math.round(prixReel * (1 + MARGE_COURTIER));
  return prixReel < PAIR ? Math.min(majore, PAIR - 1) : majore;
}

/** Coupon : deux decimales, sans suffixe. */
const COUPON = "0.00";

/**
 * Nature du titre souscrit, pour la colonne « Type » du bloc achat.
 *
 * L'instrument annonce par la seance fait foi quand il est explicite. Il ne
 * l'est pas toujours : le calendrier UMOA-Titres publie souvent « ES »
 * (emission simultanee de bons ET d'obligations) ou rien du tout. On retombe
 * alors sur la duree, seul critere qui separe les deux : au-dela de deux ans,
 * un titre du Tresor est une obligation.
 */
function typeTitre(instrument: string | null, maturiteMois: number): string {
  const i = (instrument || "").trim().toUpperCase();
  if (i === "BAT" || i === "OAT") return i;
  return maturiteMois > 0 && maturiteMois <= 24 ? "BAT" : "OAT";
}

type Bloc = {
  /** Premiere colonne du bloc (1 = A). */
  depart: number;
  /** Valeurs d'une ligne, dans l'ordre des colonnes du bloc. */
  lignes: (string | number | null)[][];
  /** Format de nombre par colonne du bloc ; null = celui du modele. */
  formats: (string | null)[];
};

/**
 * Ecrit deux blocs cote a cote sur une feuille, en reprenant le style des
 * lignes de donnees du modele.
 *
 * Le style ne se devine pas : il se COPIE, cellule par cellule, depuis la
 * premiere ligne de donnees du modele. Ainsi une retouche du modele — une
 * bordure changee, une police differente — se propage sans toucher a ce
 * fichier.
 */
function ecrireBlocs(feuille: ExcelJS.Worksheet, blocs: Bloc[]) {
  const hauteurModele = feuille.getRow(PREMIERE_LIGNE).height;

  // Gabarit de style, releve AVANT toute ecriture.
  const gabarit = new Map<number, Partial<ExcelJS.Style>>();
  const colonnesUtiles: number[] = [];
  for (const bloc of blocs) {
    for (let i = 0; i < bloc.formats.length; i++) colonnesUtiles.push(bloc.depart + i);
  }
  // La colonne de separation a son propre style : on la releve aussi, sinon
  // les lignes ajoutees laisseraient une colonne au format par defaut au
  // milieu du tableau.
  const separateurs: number[] = [];
  for (let i = 0; i < blocs.length - 1; i++) {
    const fin = blocs[i].depart + blocs[i].formats.length;
    if (fin < blocs[i + 1].depart) {
      for (let c = fin; c < blocs[i + 1].depart; c++) separateurs.push(c);
    }
  }
  for (const c of [...colonnesUtiles, ...separateurs]) {
    gabarit.set(c, { ...feuille.getRow(PREMIERE_LIGNE).getCell(c).style });
  }

  const nbLignes = Math.max(...blocs.map((b) => b.lignes.length), 0);
  const total = Math.max(nbLignes, LIGNES_MODELE);

  for (let i = 0; i < total; i++) {
    const ligne = feuille.getRow(PREMIERE_LIGNE + i);
    if (hauteurModele) ligne.height = hauteurModele;

    for (const c of separateurs) {
      const style = gabarit.get(c);
      if (style) ligne.getCell(c).style = { ...style };
    }

    for (const bloc of blocs) {
      const valeurs = bloc.lignes[i] ?? null;
      // La largeur vient des FORMATS, pas des donnees : un bloc sans aucune
      // ligne doit tout de meme etre efface, sinon le « Achat » / « Vente »
      // pre-rempli du modele survit a un export ou ce sens n'a rien produit.
      for (let j = 0; j < bloc.formats.length; j++) {
        const cellule = ligne.getCell(bloc.depart + j);
        const style = gabarit.get(bloc.depart + j);
        if (style) cellule.style = { ...style };
        // Le format de nombre s'applique APRES le style du modele, qu'il
        // complete sans le remplacer : polices, aplats et bordures restent ceux
        // du modele, seule la facon d'ecrire le nombre change.
        const format = bloc.formats[j];
        if (format) cellule.numFmt = format;
        // Au-dela des donnees, on VIDE sans deshabiller : le modele compte deux
        // lignes pretes a l'emploi, et un plan d'une seule ligne laisserait
        // sinon un « Achat » orphelin dans la seconde.
        const v = valeurs ? valeurs[j] : null;
        cellule.value = v === null || v === undefined ? null : v;
      }
    }
    ligne.commit?.();
  }
}

/** Arrondi a 2 decimales, en conservant null. */
const deux = (v: number | null): number | null =>
  v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;

/**
 * Maturite residuelle arrondie A L'ANNEE PLEINE, pour le fichier courtier
 * UNIQUEMENT.
 *
 * Le site continue d'afficher la duree exacte, et c'est bien elle qui porte le
 * prix : une souche reabondee a reellement 4,96 ans a courir, pas 5. Mais ce
 * chiffre-la ne dit rien a un courtier qui raisonne en ligne « 5 ans » ; il
 * l'invite a chercher une souche qui n'existe pas. On arrondit donc a
 * l'affichage, sans jamais remonter l'arrondi dans le calcul.
 */
const anneesRondes = (v: number | null): number | null =>
  v === null || !Number.isFinite(v) ? null : Math.round(v);

/**
 * Construit le classeur de propositions a partir du plan d'operations.
 *
 * Renvoie le classeur serialise, pret a etre servi en telechargement.
 */
export async function construireClasseurPropositions(
  plan: PlanOperations,
): Promise<Buffer> {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.readFile(path.join(process.cwd(), MODELE));

  const feuilleActions = classeur.getWorksheet("Actions");
  const feuilleObligations = classeur.getWorksheet("Obligations");
  if (!feuilleActions || !feuilleObligations) {
    throw new Error(
      `${MODELE} : feuilles « Actions » et « Obligations » attendues, introuvables.`,
    );
  }

  // ── ACTIONS ──────────────────────────────────────────────────────────────
  const formatsActions = [null, null, null, MILLIERS, MILLIERS];
  ecrireBlocs(feuilleActions, [
    {
      depart: 2, // B
      formats: formatsActions,
      lignes: plan.achatsActions
        .filter((o) => o.montant >= SEUIL_EXPORT)
        .map((o) => [o.code, o.libelle, "Achat", o.quantite, o.prixOptimal]),
    },
    {
      depart: 8, // H
      formats: formatsActions,
      lignes: plan.ventesActions
        .filter((o) => o.montant >= SEUIL_EXPORT)
        .map((o) => [o.code, o.libelle, "Vente", o.quantite, o.prixOptimal]),
    },
  ]);

  // ── OBLIGATIONS ──────────────────────────────────────────────────────────
  //
  // A l'achat, la premiere colonne ne porte pas un symbole mais un TYPE. Une
  // souche d'adjudication n'a pas encore d'ISIN — la seance ne l'ouvre qu'apres
  // coup — et un symbole invente serait un symbole faux ; la nature du titre,
  // elle, est connue et c'est ce dont le courtier a besoin pour soumettre.
  // L'en-tete du modele est donc reecrit sur ce seul bloc : le bloc vente garde
  // « Symbole », ses lignes en ayant un.
  const enTeteTypeAchat = feuilleObligations.getRow(2).getCell(2);
  enTeteTypeAchat.value = "Type";

  const formatsObligations = [null, null, null, MATURITE, COUPON, MILLIERS, MILLIERS];
  ecrireBlocs(feuilleObligations, [
    {
      depart: 2, // B
      formats: formatsObligations,
      lignes: plan.souscriptions
        .filter((s) => s.montant >= SEUIL_EXPORT)
        .map((s) => [
          typeTitre(s.instrument, s.maturiteMois),
          `État de ${s.etat}`,
          "Achat",
          anneesRondes(s.residuelMois / 12),
          // Coupon en UNITES POURCENT (6,15 pour 6,15 %), conformement au
          // format « x,xx » demande.
          s.coupon === null ? null : deux(s.coupon * 100),
          s.quantite,
          prixCourtier(s.prixPropose, "achat"),
        ]),
    },
    {
      depart: 10, // J
      formats: formatsObligations,
      lignes: plan.cessionsObligations
        .filter((c) => c.produitNet >= SEUIL_EXPORT)
        .map((c) => [
          c.code,
          c.libelle,
          "Vente",
          anneesRondes(c.maturiteResiduelle),
          deux(c.couponRate * 100),
          c.quantite,
          prixCourtier(c.prixCession, "vente"),
        ]),
    },
  ]);

  const buffer = await classeur.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Nom de fichier propose au telechargement. */
export function nomFichierPropositions(nomFonds: string, dateRef: string | null): string {
  const jour = (dateRef ?? new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const fonds = nomFonds
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `propositions-${fonds || "fonds"}-${jour}.xlsx`;
}

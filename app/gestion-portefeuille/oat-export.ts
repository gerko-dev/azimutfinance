import "server-only";

// === Export des OAT cessibles d'un fonds, au prix du réméré ================
//
// CE QUE LA CONTREPARTIE DEMANDE AVANT DE TRAITER. Un réméré se négocie de gré
// à gré : la banque veut la liste des titres qu'on peut lui céder, avec de quoi
// les valoriser elle-même — le facial, l'échéance, et le prix auquel on les
// propose. C'est exactement ce tableau, et il se recopiait à la main.
//
// LES OAT SEULEMENT. Les BAT sont des titres à moins d'un an qu'on porte
// jusqu'au terme ; les obligations cotées ont leur propre marché. Ce qui se
// cède en réméré, ce sont les OAT.
//
// ── LE PRIX SE DÉDUIT DU RENDEMENT, ET LE RENDEMENT DU MARCHÉ PRIMAIRE ────
//
// Un réméré n'est pas une vente : c'est un prêt gagé sur des titres. La
// contrepartie DÉBOURSE un montant aujourd'hui, encaisse ce que le titre
// rapporte pendant le terme, et REÇOIT au rachat. Entre les deux, elle veut le
// rendement qu'elle obtiendrait ailleurs — et ailleurs, pour une banque de la
// zone, c'est le guichet de l'État : LE RENDEMENT MOYEN DE SES TROIS
// DERNIÈRES ADJUDICATIONS. Un réméré qui paierait moins ne se traite pas ; un
// réméré qui paierait plus est de l'argent laissé sur la table.
//
// ON RAISONNE EN MONTANTS RÉELLEMENT ÉCHANGÉS, pas en prix affiché :
//
//   déboursé au jour J   = prix + intérêts courus à ce jour
//   encaissé au terme    = pair + intérêts courus au terme
//                          + coupons détachés et amortissements de la période
//
// et l'on cherche le prix tel que le rapport des deux soit le rendement visé
// sur la durée :
//
//   encaissé / déboursé = (1 + r_annuel) ^ (mois / 12)
//        ⟹  prix = encaissé / (1 + r_annuel)^(mois/12) − courus du jour
//
// LES COURUS DES DEUX CÔTÉS, ET C'EST LE POINT. Un titre cédé la veille de son
// coupon porte onze mois d'intérêts : les ignorer à l'achat ferait payer la
// contrepartie deux fois, et les ignorer au rachat les lui offrirait. Leur
// VARIATION sur la période — plus les coupons effectivement détachés — est
// exactement ce que le titre rapporte, sans double compte possible.
//
// LE TITRE QUI ÉCHOIT AVANT LE TERME ne se revend pas : il est remboursé. Ses
// flux portent alors le capital, et le pair ne s'y ajoute pas — l'y ajouter
// aurait compté le remboursement deux fois.
//
// LES QUANTITÉS SONT CELLES QU'ON PEUT RÉELLEMENT SORTIR. L'inventaire porte
// des titres qui ne sont pas disponibles : ceux qui sont PRÊTÉS sont dehors,
// ceux PRIS EN RÉMÉRÉ doivent retourner à la contrepartie, et la part non
// servie des ventes déjà passées est promise. Proposer un titre qu'on ne peut
// pas livrer, c'est un échec de dénouement — et une contrepartie perdue.

import { loadBonds, loadIssuances } from "@/lib/dataLoader";
import { calculateAccruedInterest, parseDate } from "@/lib/bondMath";
import type { Bond, BondCountry, IssuanceResult } from "@/lib/bondsUEMOA";

import { loadCustomSecurities } from "./portfolio-data";
import {
  disponibiliteCession,
  positionsDeReference,
  type Disponibilite,
} from "./operations-marche-disponibilite";
import { nominalCourant } from "./operations-data";
import { fluxDuReferentiel } from "./echeancier-referentiel";

const num = (v: unknown, d = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }
  return d;
};

/** Nombre de SÉANCES d'adjudication retenues pour le rendement de référence. */
export const NB_ADJUDICATIONS_REFERENCE = 3;

/** Les deux termes qui se négocient. Rien d'autre ne se pratique. */
export type DureeRemere = 3 | 6;

/** Le rendement servi par un État à ses dernières adjudications. */
export type ReferenceEtat = {
  /** Rendement annuel, en décimal, pondéré par les montants adjugés. */
  taux: number;
  /** Les séances retenues, pour que le chiffre se vérifie. */
  seances: { date: string; montant: number; taux: number }[];
  /** Vrai quand aucune adjudication du pays n'était disponible et qu'on a pris
   *  la moyenne régionale : le prix repose alors sur un emprunt de taux. */
  parDefaut: boolean;
};

/** Une ligne du tableau demandé par la contrepartie. */
export type LigneOat = {
  /** L'ISIN : c'est sous lui que la contrepartie connaît le titre. */
  titre: string;
  libelle: string;
  pays: BondCountry;
  /** Ce qu'on peut réellement céder, prêts et rémérés déduits. */
  quantite: number;
  /** Taux facial, en décimal. */
  facial: number;
  /** Échéance du TITRE, ISO — à ne pas confondre avec le terme du réméré. */
  echeance: string;
  /** Prix PIED DE COUPON proposé, par titre : c'est la colonne du tableau. */
  prixCession: number;

  // ── Ce qui compose le prix, pour qu'il se vérifie ────────────────────────
  /** Le pair : ce que la contrepartie rend au terme. 10 000 F pour une OAT. */
  pair: number;
  /** Intérêts courus au jour de la cession, par titre. */
  courusJour: number;
  /** Intérêts courus au terme du réméré. Nuls si le titre a été remboursé. */
  courusTerme: number;
  /** Coupons détachés et amortissements encaissés pendant le réméré. */
  fluxPeriode: number;
  /** Prix + courus du jour : ce que la contrepartie sort réellement. */
  debourse: number;
  /** Ce qu'elle reçoit au terme, courus compris. */
  encaisse: number;
  /** 1 − prix / pair. Négative quand le titre vaut plus que le pair. */
  decote: number;
  /** Rendement annuel visé — celui du guichet de l'État. */
  rendementCible: number;
  /** Rendement annuel obtenu : le contrôle que le calcul tombe juste. */
  rendementObtenu: number;
  reference: ReferenceEtat;
  /** Ce qui nuance la ligne : échéance avant le terme, taux inconnu… */
  reserve: string | null;
  /** Le détail du calcul de disponibilité, pour la feuille des écartés. */
  dispo: Disponibilite;
};

export type ExportOat = {
  fondsNom: string;
  dateInventaire: string | null;
  dateRef: string;
  /** Terme du réméré, en mois, et sa date. */
  dureeMois: DureeRemere;
  dateTerme: string;
  lignes: LigneOat[];
  /** OAT détenues mais dont rien n'est cessible, et pourquoi. Un export muet
   *  sur ses trous est un export qu'on croit complet. */
  ecartees: LigneOat[];
  /** Les rendements de référence employés, par pays. */
  references: { pays: BondCountry; reference: ReferenceEtat }[];
  avertissements: string[];
};

/** Même date, m mois plus tard. */
function dansNMois(iso: string, mois: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + mois);
  // Fin de mois : le 31 mai + 3 mois tombe au 31 août, mais le 31 août + 6
  // mois n'existe pas — on retient le dernier jour du mois d'arrivée.
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernier));
  return d.toISOString().slice(0, 10);
}

const normId = (s: string | null | undefined): string =>
  (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Le rendement servi par chaque État à ses TROIS DERNIÈRES SÉANCES.
 *
 * PAR SÉANCE, ET NON PAR LIGNE. Une adjudication met souvent deux ou trois
 * souches en vente le même jour : compter trois LIGNES reviendrait à ne
 * regarder qu'une seule journée de marché, et à faire dépendre le prix d'une
 * séance isolée.
 *
 * PONDÉRÉ PAR LES MONTANTS ADJUGÉS, comme partout ailleurs dans ce dépôt : une
 * souche servie pour cinq milliards dit mieux le coût de l'État qu'une souche
 * servie pour deux cents millions.
 */
function referencesParEtat(
  issuances: IssuanceResult[],
  jusqua: string,
): Map<BondCountry, ReferenceEtat> {
  const parPays = new Map<BondCountry, IssuanceResult[]>();
  for (const i of issuances) {
    if (!i.date || i.date > jusqua) continue;
    if (!(i.weightedAvgYield > 0) || !(i.amount > 0)) continue;
    const l = parPays.get(i.country) ?? [];
    l.push(i);
    parPays.set(i.country, l);
  }

  const moyenne = (lignes: IssuanceResult[]): ReferenceEtat | null => {
    const dates = [...new Set(lignes.map((i) => i.date))]
      .sort()
      .slice(-NB_ADJUDICATIONS_REFERENCE);
    if (dates.length === 0) return null;
    const retenues = lignes.filter((i) => dates.includes(i.date));
    const montant = retenues.reduce((s, i) => s + i.amount, 0);
    if (!(montant > 0)) return null;
    const taux = retenues.reduce((s, i) => s + i.weightedAvgYield * i.amount, 0) / montant;
    const seances = dates.map((d) => {
      const duJour = retenues.filter((i) => i.date === d);
      const m = duJour.reduce((s, i) => s + i.amount, 0);
      return {
        date: d,
        montant: m,
        taux: duJour.reduce((s, i) => s + i.weightedAvgYield * i.amount, 0) / m,
      };
    });
    return { taux, seances, parDefaut: false };
  };

  const sortie = new Map<BondCountry, ReferenceEtat>();
  for (const [pays, lignes] of parPays) {
    const r = moyenne(lignes);
    if (r) sortie.set(pays, r);
  }
  return sortie;
}

/** Repli régional : la moyenne des dernières séances de TOUS les États. */
function referenceRegionale(refs: Map<BondCountry, ReferenceEtat>): ReferenceEtat | null {
  const toutes = [...refs.values()].flatMap((r) => r.seances);
  const montant = toutes.reduce((s, x) => s + x.montant, 0);
  if (!(montant > 0)) return null;
  return {
    taux: toutes.reduce((s, x) => s + x.taux * x.montant, 0) / montant,
    seances: [...toutes].sort((a, b) => a.date.localeCompare(b.date)).slice(-NB_ADJUDICATIONS_REFERENCE),
    parDefaut: true,
  };
}

/**
 * Les OAT qu'un fonds peut céder, au prix qui donne à la contrepartie le
 * rendement du guichet souverain sur la durée choisie.
 */
export async function construireExportOat(
  fundId: string,
  fondsNom: string,
  dureeMois: DureeRemere = 3,
): Promise<ExportOat> {
  const [snapshot, customs] = await Promise.all([
    positionsDeReference(fundId),
    loadCustomSecurities(),
  ]);

  const dateInventaire = snapshot?.asOfDate ?? null;
  // LE JOUR DE L'EXPORT, et non la date de l'inventaire : la contrepartie
  // débourse aujourd'hui, et les courus se comptent à aujourd'hui. L'arrêté ne
  // sert qu'aux quantités.
  const dateRef = new Date().toISOString().slice(0, 10);
  const dateTerme = dansNMois(dateRef, dureeMois);
  const avertissements: string[] = [];

  const vide: ExportOat = {
    fondsNom,
    dateInventaire,
    dateRef,
    dureeMois,
    dateTerme,
    lignes: [],
    ecartees: [],
    references: [],
    avertissements,
  };

  if (!snapshot) {
    avertissements.push("Aucun inventaire importé pour ce fonds.");
    return vide;
  }

  const customParId = new Map(customs.map((c) => [c.id, c]));
  const souverainParIsin = new Map<string, Bond>();
  for (const b of loadBonds()) {
    if (b.isin) souverainParIsin.set(b.isin.toUpperCase(), b);
  }

  const refs = referencesParEtat(loadIssuances(), dateRef);
  const regionale = referenceRegionale(refs);
  const employees = new Map<BondCountry, ReferenceEtat>();

  const lignes: LigneOat[] = [];
  const ecartees: LigneOat[] = [];
  let horsOat = 0;
  let sansReference = 0;

  for (const p of snapshot.positions) {
    if (p.section !== "obligation") continue;
    const custom = p.customSecurityId ? customParId.get(p.customSecurityId) : undefined;
    const cle = (custom?.isin || custom?.code || p.matchId || p.rawCode || "")
      .trim()
      .toUpperCase();
    if (!cle) continue;

    const souverain = souverainParIsin.get(cle);
    // LE FILTRE EST LE TYPE DU RÉFÉRENTIEL, pas la forme de l'ISIN : un code
    // pays suivi de chiffres désigne aussi bien un BAT qu'un emprunt d'État
    // coté, et deviner d'après la chaîne aurait mis des BAT dans la liste.
    if (!souverain || souverain.type !== "OAT") {
      if (souverain) horsOat++;
      continue;
    }

    const libelle = souverain.nameShort || custom?.name || p.rawLabel || cle;
    // LE PAIR EST LE NOMINAL DE LA FICHE — 10 000 F pour une OAT. Le coder en
    // dur aurait tenu tant qu'aucune souche n'a d'autre coupure.
    const pair = nominalCourant(undefined, souverain, num(p.pru));
    const facial = souverain.couponRate;

    const reference = refs.get(souverain.country) ?? regionale;
    if (!reference) {
      sansReference++;
      continue;
    }
    if (!reference.parDefaut) employees.set(souverain.country, reference);

    // ── Les deux montants qui s'échangent ────────────────────────────────
    const courusJour = courus(souverain, dateRef, pair);
    const echeanceAvantTerme =
      !!souverain.maturityDate && souverain.maturityDate <= dateTerme;
    const courusTerme = echeanceAvantTerme ? 0 : courus(souverain, dateTerme, pair);

    // Coupons détachés et amortissements de la période. Le remboursement final
    // en fait partie quand il tombe dans la fenêtre — c'est alors lui, et non
    // le rachat, qui rend le capital.
    const fluxPeriode = fluxDuReferentiel(
      [normId(cle), normId(souverain.isin)],
      suivant(dateRef),
      dateTerme,
    ).reduce((s, f) => s + f.parTitre, 0);

    // LE PAIR NE S'AJOUTE PAS QUAND LE TITRE A DÉJÀ ÉTÉ REMBOURSÉ : son
    // capital est déjà dans les flux de la période.
    const encaisse = (echeanceAvantTerme ? 0 : pair + courusTerme) + fluxPeriode;
    const facteur = Math.pow(1 + reference.taux, dureeMois / 12);
    const debourse = encaisse / facteur;
    const prixCession = debourse - courusJour;

    const decote = pair > 0 ? 1 - prixCession / pair : 0;
    const rendementObtenu =
      debourse > 0 ? Math.pow(encaisse / debourse, 12 / dureeMois) - 1 : 0;

    const reserve = echeanceAvantTerme
      ? `Échéance du titre le ${souverain.maturityDate}, avant le terme du réméré (${dateTerme}) : il sera remboursé entre-temps, il n'y a pas de rachat à faire.`
      : reference.parDefaut
        ? "Aucune adjudication récente de cet État : rendement de référence emprunté à la moyenne régionale."
        : prixCession <= 0
          ? "Prix négatif ou nul : vérifie le taux facial et l'échéancier au référentiel."
          : facial > 0
            ? null
            : "Taux facial inconnu au référentiel : aucun intérêt couru n'entre dans le calcul.";

    const dispo = await disponibiliteCession(fundId, souverain.isin || cle, libelle);

    const ligne: LigneOat = {
      titre: souverain.isin || cle,
      libelle,
      pays: souverain.country,
      quantite: Math.max(0, dispo.disponible),
      facial,
      echeance: souverain.maturityDate,
      prixCession,
      pair,
      courusJour,
      courusTerme,
      fluxPeriode,
      debourse,
      encaisse,
      decote,
      rendementCible: reference.taux,
      rendementObtenu,
      reference,
      reserve,
      dispo,
    };

    if (ligne.quantite > 0) lignes.push(ligne);
    else ecartees.push(ligne);
  }

  // Les plus grosses lignes d'abord : c'est l'ordre dans lequel une
  // contrepartie lit une liste, et celui du tableau que le gérant remplissait
  // à la main.
  lignes.sort((a, b) => b.quantite - a.quantite);
  ecartees.sort((a, b) => b.dispo.detenue - a.dispo.detenue);

  if (horsOat > 0) {
    avertissements.push(
      `${horsOat} ligne(s) souveraine(s) écartée(s) : ce ne sont pas des OAT (BAT, OTAR).`,
    );
  }
  if (sansReference > 0) {
    avertissements.push(
      `${sansReference} ligne(s) sans aucun rendement de référence, ni national ni régional : aucun prix n'a pu être posé.`,
    );
  }
  const avecReserve = lignes.filter((l) => l.reserve !== null);
  if (avecReserve.length > 0) {
    avertissements.push(
      `${avecReserve.length} ligne(s) à vérifier avant de transmettre : ${avecReserve
        .map((l) => l.titre)
        .join(", ")}.`,
    );
  }

  return {
    ...vide,
    lignes,
    ecartees,
    references: [...employees.entries()]
      .map(([pays, reference]) => ({ pays, reference }))
      .sort((a, b) => a.pays.localeCompare(b.pays)),
  };
}

/**
 * Intérêts courus par titre à une date, sur le nominal de la fiche.
 *
 * `calculateAccruedInterest` travaille sur le nominal du RÉFÉRENTIEL ; on
 * ramène au pair retenu ici, qui peut en différer si la fiche de position
 * porte une autre coupure.
 */
function courus(bond: Bond, date: string, pair: number): number {
  if (!(bond.couponRate > 0)) return 0;
  try {
    const { accruedInterest } = calculateAccruedInterest(bond, parseDate(date));
    if (!Number.isFinite(accruedInterest) || accruedInterest < 0) return 0;
    const n = bond.nominalValue > 0 ? bond.nominalValue : pair;
    return (accruedInterest * pair) / n;
  } catch {
    return 0;
  }
}

/** Le lendemain : les flux du jour même ont déjà été réglés. */
function suivant(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Nom du fichier : le fonds, le terme et l'arrêté, pour qu'il se classe seul. */
export function nomFichierOat(
  fondsNom: string,
  mois: DureeRemere,
  date: string | null,
): string {
  const propre = fondsNom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `OAT-remere-${mois}mois-${propre}-${date ?? "sans-date"}.xlsx`;
}

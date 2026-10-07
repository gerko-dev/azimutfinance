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
// ── LE PRIX NE SE DÉDUIT PAS D'UNE COURBE, IL SE DÉDUIT DE L'ACCORD ───────
//
// Un réméré n'est pas une vente : c'est un prêt gagé sur des titres. La
// contrepartie avance de l'argent aujourd'hui, encaisse ce que le titre
// rapporte pendant le terme, et REVEND AU PAIR à l'échéance du réméré. Son
// rendement est donc négocié d'avance — 1,5 % sur la période — et c'est LUI
// qui détermine le prix, pas l'inverse.
//
// Trois choses composent ce rendement, et le prix est ce qui les fait tomber
// juste :
//
//   les INTÉRÊTS COURUS sur la durée du réméré — taux facial × nominal × m/12
//   l'AMORTISSEMENT éventuel tombant dans la fenêtre, qu'elle encaisse
//   la DÉCOTE DE CESSION — l'écart entre le prix payé et le pair rendu
//
//   (pair − P + intérêts + amortissement) / P = 1,5 %
//        ⟹  P = (pair + intérêts + amortissement) / 1,015
//
// PLUS LE TITRE RAPPORTE PENDANT LA PÉRIODE, PLUS LA DÉCOTE EST FAIBLE : une
// OAT à 6,5 % laisse 1,6 % de coupon couru sur trois mois, et la contrepartie
// n'a presque plus besoin de décote pour atteindre son 1,5 %. C'est la
// mécanique du réméré, et c'est ce que le prix doit refléter.
//
// LES QUANTITÉS SONT CELLES QU'ON PEUT RÉELLEMENT SORTIR. L'inventaire porte
// des titres qui ne sont pas disponibles : ceux qui sont PRÊTÉS sont dehors,
// ceux PRIS EN RÉMÉRÉ doivent retourner à la contrepartie, et la part non
// servie des ventes déjà passées est promise. Proposer un titre qu'on ne peut
// pas livrer, c'est un échec de dénouement — et une contrepartie perdue.

import { loadBonds } from "@/lib/dataLoader";
import type { Bond } from "@/lib/bondsUEMOA";

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

/**
 * RENDEMENT NÉGOCIÉ DE LA CONTREPARTIE, sur la durée du réméré.
 *
 * Ce n'est pas un taux annuel : c'est ce que la banque veut gagner entre la
 * cession et le rachat, que le terme soit à trois mois ou à six. L'annualiser
 * reviendrait à lui offrir deux fois moins sur un réméré court, ce qu'aucune
 * contrepartie n'accepte — la place traite au forfait de période.
 */
export const RENDEMENT_CONTREPARTIE = 0.015;

/** Les deux termes qui se négocient. Rien d'autre ne se pratique. */
export type DureeRemere = 3 | 6;

/** Une ligne du tableau demandé par la contrepartie. */
export type LigneOat = {
  /** L'ISIN : c'est sous lui que la contrepartie connaît le titre. */
  titre: string;
  libelle: string;
  /** Ce qu'on peut réellement céder, prêts et rémérés déduits. */
  quantite: number;
  /** Taux facial, en décimal. */
  facial: number;
  /** Échéance du TITRE, ISO — à ne pas confondre avec le terme du réméré. */
  echeance: string;
  /** Prix auquel on propose le titre, par titre. */
  prixCession: number;

  // ── Ce qui compose le prix, pour qu'il se vérifie ────────────────────────
  /** Le pair : ce que la contrepartie rendra au terme. 10 000 F pour une OAT. */
  pair: number;
  /** Intérêts courus sur la durée du réméré, par titre. */
  interetsCourus: number;
  /** Amortissements tombant dans la fenêtre, hors remboursement final. */
  amortissement: number;
  /** 1 − prix / pair. */
  decote: number;
  /** Le rendement obtenu — égal à la cible, sauf réserve. */
  rendement: number;
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
  rendementCible: number;
  lignes: LigneOat[];
  /** OAT détenues mais dont rien n'est cessible, et pourquoi. Un export muet
   *  sur ses trous est un export qu'on croit complet. */
  ecartees: LigneOat[];
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
 * Les OAT qu'un fonds peut céder, au prix qui donne à la contrepartie le
 * rendement convenu sur la durée choisie.
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
  // LA DATE DU JOUR, et non celle de l'inventaire : un réméré se négocie
  // aujourd'hui, et ses trois mois courent à partir d'aujourd'hui. L'arrêté ne
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
    rendementCible: RENDEMENT_CONTREPARTIE,
    lignes: [],
    ecartees: [],
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

  const lignes: LigneOat[] = [];
  const ecartees: LigneOat[] = [];
  let horsOat = 0;

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

    // ── Ce que le titre rapporte à la contrepartie pendant le réméré ──────
    //
    // LES INTÉRÊTS COURUS, prorata temporis sur la durée convenue : c'est
    // ainsi que la place les compte, et c'est vérifiable de tête — un facial
    // de 6,25 % sur trois mois, c'est 156,25 F sur 10 000.
    const interetsCourus = facial > 0 ? (pair * facial * dureeMois) / 12 : 0;

    // L'AMORTISSEMENT ÉVENTUEL, lu à l'échéancier du référentiel. Le
    // remboursement FINAL en est exclu : s'il tombe dans la fenêtre, il n'y a
    // pas de réméré à faire — le titre sera remboursé avant son terme, et la
    // ligne part avec sa réserve.
    const echeanceAvantTerme = !!souverain.maturityDate && souverain.maturityDate <= dateTerme;
    const flux = fluxDuReferentiel([normId(cle), normId(souverain.isin)], dateRef, dateTerme);
    const amortissement = echeanceAvantTerme
      ? 0
      : flux
          .filter((f) => f.capital && f.date !== souverain.maturityDate)
          .reduce((s, f) => s + f.parTitre, 0);

    // ── Le prix : celui qui donne son rendement à la contrepartie ─────────
    const prixCession = (pair + interetsCourus + amortissement) / (1 + RENDEMENT_CONTREPARTIE);
    const decote = pair > 0 ? 1 - prixCession / pair : 0;
    const rendement =
      prixCession > 0
        ? (pair - prixCession + interetsCourus + amortissement) / prixCession
        : 0;

    const reserve = echeanceAvantTerme
      ? `Échéance du titre le ${souverain.maturityDate}, avant le terme du réméré (${dateTerme}) : il sera remboursé entre-temps.`
      : facial > 0
        ? null
        : "Taux facial inconnu au référentiel : aucun intérêt couru n'entre dans le prix.";

    const dispo = await disponibiliteCession(fundId, souverain.isin || cle, libelle);

    const ligne: LigneOat = {
      titre: souverain.isin || cle,
      libelle,
      quantite: Math.max(0, dispo.disponible),
      facial,
      echeance: souverain.maturityDate,
      prixCession,
      pair,
      interetsCourus,
      amortissement,
      decote,
      rendement,
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
  const avecReserve = lignes.filter((l) => l.reserve !== null);
  if (avecReserve.length > 0) {
    avertissements.push(
      `${avecReserve.length} ligne(s) à vérifier avant de transmettre : ${avecReserve
        .map((l) => l.titre)
        .join(", ")}.`,
    );
  }

  return { ...vide, lignes, ecartees };
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

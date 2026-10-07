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
// MAIS PAS N'IMPORTE LESQUELLES : CELLES DU MÊME TÉNOR. Un État n'emprunte pas
// au même taux à trois ans et à dix. Comparer une OAT qui court encore neuf
// ans au rendement d'une séance à trois ans, c'est lui prêter le coût d'un
// autre emprunt — et sur une courbe pentue, l'écart se compte en points.
//
// LE TÉNOR SE PREND AU-DESSUS DE LA DURÉE RÉSIDUELLE, échelon par échelon :
// moins de trois ans se réfère au trois ans, moins de cinq au cinq ans, et
// ainsi de suite jusqu'au plus long que l'État a émis. On ne descend jamais
// sous le trois ans : c'est le premier barreau de l'échelle souveraine, les
// durées plus courtes relevant du guichet des bons.
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
// LE PRIX SE COTE AU MULTIPLE DE CINQ. Personne ne traite à 9 994,48 : la
// place cote au pas de cinq francs, et un prix au centime se fait arrondir par
// la contrepartie — dans le sens qui l'arrange. On arrondit donc nous-mêmes,
// AU PLUS PROCHE, et l'on publie le RENDEMENT INDUIT : celui que le prix
// arrondi produit réellement, qui s'écarte de la cible de quelques points de
// base. C'est ce chiffre-là que la contrepartie vérifiera, pas le taux visé.
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

/** Le rendement servi par un État à ses dernières adjudications d'un ténor. */
export type ReferenceEtat = {
  /** Rendement annuel, en décimal, pondéré par les montants adjugés. */
  taux: number;
  /** Ténor des séances retenues, en années. Null quand on n'a pas pu le
   *  cibler et qu'on a pris toutes les adjudications du pays. */
  tenor: number | null;
  /** Les séances retenues, pour que le chiffre se vérifie. */
  seances: { date: string; montant: number; taux: number }[];
  /** Ce qui s'est écarté de la règle, en clair. Null quand le ténor demandé
   *  existait et que le pays avait ses trois séances. */
  repli: string | null;
};

/** PREMIER BARREAU DE L'ÉCHELLE SOUVERAINE. En dessous, c'est le guichet des
 *  bons — un autre marché, d'autres acheteurs, d'autres taux. */
const TENOR_PLANCHER = 3;

/** PAS DE COTATION. La place traite au multiple de cinq francs ; un prix au
 *  centime se fait arrondir par la contrepartie, dans le sens qui l'arrange. */
export const PAS_COTATION = 5;

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
  /** Durée résiduelle du titre, en années : elle commande le ténor de
   *  référence. */
  dureeResiduelle: number;
  /** Prix PIED DE COUPON proposé, par titre, ARRONDI au multiple de cinq :
   *  c'est la colonne du tableau, et ce qui se traite. */
  prixCession: number;
  /** Le prix avant arrondi, pour que l'écart se voie. */
  prixExact: number;

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
  /** Rendement annuel visé — celui du guichet de l'État, au ténor du titre. */
  rendementCible: number;
  /** RENDEMENT INDUIT : celui que le prix arrondi donne réellement à la
   *  contrepartie. Il s'écarte de la cible de quelques points de base, et
   *  c'est ce chiffre-là qu'elle vérifiera. */
  rendementInduit: number;
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

/** Les adjudications exploitables, par pays, ténor arrondi à l'année. */
type Gisement = Map<BondCountry, { tenor: number; ligne: IssuanceResult }[]>;

function gisementAdjudications(issuances: IssuanceResult[], jusqua: string): Gisement {
  const g: Gisement = new Map();
  for (const i of issuances) {
    if (!i.date || i.date > jusqua) continue;
    if (!(i.weightedAvgYield > 0) || !(i.amount > 0)) continue;
    if (!(i.maturity > 0)) continue;
    const l = g.get(i.country) ?? [];
    // LE TÉNOR À L'ANNÉE : le guichet annonce 36, 60 ou 84 mois, mais une
    // souche réabondée sort à 58 ou 61. Les classer au mois ferait autant de
    // ténors que de séances, et aucun n'aurait ses trois adjudications.
    l.push({ tenor: Math.round(i.maturity), ligne: i });
    g.set(i.country, l);
  }
  return g;
}

/**
 * La moyenne pondérée des TROIS DERNIÈRES SÉANCES d'un jeu d'adjudications.
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
function moyenneDesSeances(
  lignes: IssuanceResult[],
): { taux: number; seances: ReferenceEtat["seances"] } | null {
  const dates = [...new Set(lignes.map((i) => i.date))]
    .sort()
    .slice(-NB_ADJUDICATIONS_REFERENCE);
  if (dates.length === 0) return null;
  const retenues = lignes.filter((i) => dates.includes(i.date));
  const montant = retenues.reduce((s, i) => s + i.amount, 0);
  if (!(montant > 0)) return null;
  const seances = dates.map((d) => {
    const duJour = retenues.filter((i) => i.date === d);
    const m = duJour.reduce((s, i) => s + i.amount, 0);
    return {
      date: d,
      montant: m,
      taux: duJour.reduce((s, i) => s + i.weightedAvgYield * i.amount, 0) / m,
    };
  });
  return {
    taux: retenues.reduce((s, i) => s + i.weightedAvgYield * i.amount, 0) / montant,
    seances,
  };
}

/**
 * Le rendement de référence d'un titre : son État, son ténor.
 *
 * TROIS REPLIS, ET CHACUN SE DIT. Le ténor demandé peut n'avoir jamais été
 * adjugé par ce pays — on prend alors le plus proche ; le pays peut n'avoir
 * aucune adjudication exploitable — on prend la zone. Un prix bâti sur un
 * emprunt de taux reste un prix, mais il doit s'annoncer comme tel.
 */
function referencePourTitre(
  gisement: Gisement,
  pays: BondCountry,
  dureeResiduelle: number,
): ReferenceEtat | null {
  const duPays = gisement.get(pays) ?? [];

  // L'ÉCHELLE : les ténors que cet État a réellement émis, au-dessus du
  // plancher. On monte au premier qui couvre la durée résiduelle.
  const echelle = [...new Set(duPays.map((x) => x.tenor))]
    .filter((t) => t >= TENOR_PLANCHER)
    .sort((a, b) => a - b);
  const vise = Math.max(dureeResiduelle, TENOR_PLANCHER);

  if (echelle.length > 0) {
    const exact = echelle.find((t) => t >= vise);
    // Au-delà du plus long ténor émis, c'est lui qui sert : une OAT à vingt
    // ans n'a pas de référence plus longue que le dix ans du guichet.
    const tenor = exact ?? echelle[echelle.length - 1];
    const m = moyenneDesSeances(duPays.filter((x) => x.tenor === tenor).map((x) => x.ligne));
    if (m) {
      return {
        ...m,
        tenor,
        repli:
          exact === undefined
            ? `Durée résiduelle de ${dureeResiduelle.toFixed(1)} ans au-delà du plus long ténor adjugé (${tenor} ans) : c'est lui qui sert de référence.`
            : null,
      };
    }
  }

  // Le pays a des adjudications, mais aucune au-dessus du plancher : on prend
  // tout ce qu'il a, et on le dit.
  const tout = moyenneDesSeances(duPays.map((x) => x.ligne));
  if (tout) {
    return {
      ...tout,
      tenor: null,
      repli: `Aucune adjudication de cet État à ${TENOR_PLANCHER} ans ou plus : moyenne de toutes ses séances récentes.`,
    };
  }
  return null;
}

/**
 * Repli régional : le même ténor, mais chez tous les États de l'Union.
 */
function referenceRegionale(
  gisement: Gisement,
  dureeResiduelle: number,
): ReferenceEtat | null {
  const toutes = [...gisement.values()].flat();
  const echelle = [...new Set(toutes.map((x) => x.tenor))]
    .filter((t) => t >= TENOR_PLANCHER)
    .sort((a, b) => a - b);
  const vise = Math.max(dureeResiduelle, TENOR_PLANCHER);
  const tenor = echelle.find((t) => t >= vise) ?? echelle[echelle.length - 1] ?? null;
  const lignes = (tenor === null ? toutes : toutes.filter((x) => x.tenor === tenor)).map(
    (x) => x.ligne,
  );
  const m = moyenneDesSeances(lignes);
  if (!m) return null;
  return {
    ...m,
    tenor,
    repli:
      "Aucune adjudication récente de cet État : rendement emprunté à la moyenne régionale du même ténor.",
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

  const gisement = gisementAdjudications(loadIssuances(), dateRef);
  // LES RÉFÉRENCES EMPLOYÉES, par pays ET par ténor : deux OAT du même État à
  // trois et à dix ans ne se réfèrent pas à la même séance, et la feuille qui
  // les justifie doit porter les deux.
  const employees = new Map<string, { pays: BondCountry; reference: ReferenceEtat }>();

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

    // LA DURÉE RÉSIDUELLE commande le ténor de référence : un État n'emprunte
    // pas au même taux à trois ans et à dix.
    const dureeResiduelle = anneesJusqua(dateRef, souverain.maturityDate);
    const reference =
      referencePourTitre(gisement, souverain.country, dureeResiduelle) ??
      referenceRegionale(gisement, dureeResiduelle);
    if (!reference) {
      sansReference++;
      continue;
    }
    employees.set(`${souverain.country}|${reference.tenor ?? "?"}`, {
      pays: souverain.country,
      reference,
    });

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
    const prixExact = encaisse / facteur - courusJour;
    // AU PLUS PROCHE, et non vers le bas : arrondir systématiquement à la
    // baisse offrirait jusqu'à cinq francs par titre à la contrepartie — deux
    // millions sur une ligne de quatre cent mille titres. L'écart de rendement
    // qui en résulte se publie, c'est tout l'objet du rendement induit.
    const prixCession = Math.round(prixExact / PAS_COTATION) * PAS_COTATION;

    // LE DÉBOURSÉ SE RECALCULE SUR LE PRIX ARRONDI : c'est lui qui se règle, et
    // c'est de lui que découle le rendement que la contrepartie touchera.
    const debourse = prixCession + courusJour;
    const decote = pair > 0 ? 1 - prixCession / pair : 0;
    const rendementInduit =
      debourse > 0 ? Math.pow(encaisse / debourse, 12 / dureeMois) - 1 : 0;

    const reserve = echeanceAvantTerme
      ? `Échéance du titre le ${souverain.maturityDate}, avant le terme du réméré (${dateTerme}) : il sera remboursé entre-temps, il n'y a pas de rachat à faire.`
      : reference.repli
        ? reference.repli
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
      dureeResiduelle,
      prixCession,
      prixExact,
      pair,
      courusJour,
      courusTerme,
      fluxPeriode,
      debourse,
      encaisse,
      decote,
      rendementCible: reference.taux,
      rendementInduit,
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
    references: [...employees.values()].sort(
      (a, b) =>
        a.pays.localeCompare(b.pays) || (a.reference.tenor ?? 0) - (b.reference.tenor ?? 0),
    ),
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

/** Années entre deux dates, zéro si l'échéance est passée ou inconnue. */
function anneesJusqua(debut: string, echeance: string): number {
  if (!echeance) return 0;
  const ms = new Date(`${echeance}T00:00:00Z`).getTime() - new Date(`${debut}T00:00:00Z`).getTime();
  return Number.isFinite(ms) ? Math.max(0, ms / (365.25 * 86_400_000)) : 0;
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

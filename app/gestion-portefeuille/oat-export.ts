import "server-only";

// === Export des OAT cessibles d'un fonds ==================================
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
// LE PRIX EST CELUI DES OPÉRATIONS À RÉALISER, à la virgule près : la cascade
// prix théorique → cote → inventaire → nominal est IMPORTÉE du module des
// opérations, elle n'est pas réécrite. Deux prix de cession qui divergent
// selon l'écran d'où ils sortent, c'est la seule chose qu'une contrepartie
// n'excusera pas.
//
// LES QUANTITÉS SONT CELLES QU'ON PEUT RÉELLEMENT SORTIR. L'inventaire porte
// des titres qui ne sont pas disponibles : ceux qui sont PRÊTÉS sont dehors,
// ceux PRIS EN RÉMÉRÉ doivent retourner à la contrepartie, et la part non
// servie des ventes déjà passées est promise. Proposer un titre qu'on ne peut
// pas livrer, c'est un échec de dénouement — et une contrepartie perdue.

import { loadBonds, loadIssuances, loadListedBonds, loadUmoaEmissions } from "@/lib/dataLoader";
import type { Bond } from "@/lib/bondsUEMOA";
import type { ListedBond } from "@/lib/listedBondsTypes";

import { loadCustomSecurities } from "./portfolio-data";
import {
  disponibiliteCession,
  positionsDeReference,
  type Disponibilite,
} from "./operations-marche-disponibilite";
import {
  dernierCoursObligation,
  nominalCourant,
  prixTheorique,
  prixTheoriqueSouverain,
} from "./operations-data";

const num = (v: unknown, d = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }
  return d;
};

/** Une ligne du tableau demandé par la contrepartie. */
export type LigneOat = {
  /** L'ISIN : c'est sous lui que la contrepartie connaît le titre. */
  titre: string;
  libelle: string;
  /** Ce qu'on peut réellement céder, prêts et rémérés déduits. */
  quantite: number;
  /** Taux facial, en décimal. */
  facial: number;
  /** Échéance, ISO. */
  echeance: string;
  prixCession: number;
  /** D'où vient le prix — la contrepartie a le droit de le savoir. */
  sourcePrix: "theorique" | "cote" | "inventaire" | "nominal";
  /** Rendement de la courbe souveraine ayant servi au prix théorique. */
  ytm: number | null;
  nominal: number;
  /** Le détail du calcul de disponibilité, pour la feuille des écartés. */
  dispo: Disponibilite;
};

export type ExportOat = {
  fondsNom: string;
  dateInventaire: string | null;
  dateRef: string;
  lignes: LigneOat[];
  /** OAT détenues mais dont rien n'est cessible, et pourquoi. Un export muet
   *  sur ses trous est un export qu'on croit complet. */
  ecartees: LigneOat[];
  avertissements: string[];
};

/**
 * Les OAT qu'un fonds peut céder, prêtes à être envoyées à une contrepartie.
 */
export async function construireExportOat(
  fundId: string,
  fondsNom: string,
): Promise<ExportOat> {
  const [snapshot, customs] = await Promise.all([
    positionsDeReference(fundId),
    loadCustomSecurities(),
  ]);

  const dateInventaire = snapshot?.asOfDate ?? null;
  const dateRef = dateInventaire ?? new Date().toISOString().slice(0, 10);
  const avertissements: string[] = [];

  if (!snapshot) {
    return {
      fondsNom,
      dateInventaire: null,
      dateRef,
      lignes: [],
      ecartees: [],
      avertissements: ["Aucun inventaire importé pour ce fonds."],
    };
  }

  const customParId = new Map(customs.map((c) => [c.id, c]));

  const souverainParIsin = new Map<string, Bond>();
  for (const b of loadBonds()) {
    if (b.isin) souverainParIsin.set(b.isin.toUpperCase(), b);
  }
  const bondParIsin = new Map<string, ListedBond>();
  const bondParCode = new Map<string, ListedBond>();
  for (const b of loadListedBonds()) {
    if (b.isin) bondParIsin.set(b.isin.toUpperCase(), b);
    if (b.code) bondParCode.set(b.code.toUpperCase(), b);
  }
  const adjudications = loadIssuances();
  const emissionsPassees = loadUmoaEmissions().filter((e) => e.date && e.date <= dateRef);

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

    const bond = bondParIsin.get(cle) ?? bondParCode.get(cle);
    const quantiteDetenue = num(p.quantity);
    const valorisation = num(p.valuation);
    const nominal = nominalCourant(bond, souverain, num(p.pru));

    // LA MÊME CASCADE QUE LES OPÉRATIONS À RÉALISER : théorique d'abord — il
    // est recalculé sur la courbe souveraine du jour —, la cote en repli, puis
    // l'inventaire, puis le nominal.
    const theo =
      prixTheorique(bond, dateRef, emissionsPassees) ??
      prixTheoriqueSouverain(souverain, dateRef, adjudications);
    const cote = bond?.isin ? dernierCoursObligation(bond.isin, dateRef) : null;
    const prixInventaire = quantiteDetenue > 0 ? valorisation / quantiteDetenue : 0;
    const prixCession =
      theo?.prix ?? cote?.prix ?? (prixInventaire > 0 ? prixInventaire : nominal);

    const libelle = souverain.nameShort || custom?.name || p.rawLabel || cle;
    const dispo = await disponibiliteCession(fundId, souverain.isin || cle, libelle);

    const ligne: LigneOat = {
      titre: souverain.isin || cle,
      libelle,
      quantite: Math.max(0, dispo.disponible),
      facial: souverain.couponRate,
      echeance: souverain.maturityDate,
      prixCession,
      sourcePrix: theo ? "theorique" : cote ? "cote" : prixInventaire > 0 ? "inventaire" : "nominal",
      ytm: theo?.ytm ?? null,
      nominal,
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
  const sansTheorique = lignes.filter((l) => l.sourcePrix !== "theorique");
  if (sansTheorique.length > 0) {
    avertissements.push(
      `${sansTheorique.length} prix hors courbe : ${sansTheorique
        .map((l) => `${l.titre} (${l.sourcePrix})`)
        .join(", ")}. Vérifie-les avant de les communiquer.`,
    );
  }

  return { fondsNom, dateInventaire, dateRef, lignes, ecartees, avertissements };
}

/** Nom du fichier : le fonds et l'arrêté, pour qu'il se classe tout seul. */
export function nomFichierOat(fondsNom: string, date: string | null): string {
  const propre = fondsNom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `OAT-cessibles-${propre}-${date ?? "sans-date"}.xlsx`;
}

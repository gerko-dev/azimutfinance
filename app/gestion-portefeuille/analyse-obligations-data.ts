// === Lecture du compartiment obligataire BRVM pour l'analyse de place ===
//
// SERVEUR UNIQUEMENT. Les 35 000 relevés de cours ne partent jamais au
// navigateur : on n'en garde que le dernier de chaque ligne, et le rendement
// qu'il produit.

import { loadListedBondPrices, loadListedBonds } from "@/lib/dataLoader";
import {
  calculateDuration,
  getBondCashflows,
  getBondYTMFromLatest,
  type ListedBond,
  type ListedBondPrice,
} from "@/lib/listedBondsTypes";

import { trancheDe, type FluxAnnuel, type LigneObligation } from "./analyse-obligations-types";

/** Au-delà, l'échéancier ne dit plus rien d'utile à un gérant. */
const HORIZON_ANNEES = 20;

/** Convention BRVM : toute obligation cotée est émise par coupures de 10 000 F. */
const NOMINAL_PAR_TITRE = 10_000;

/**
 * Bornes de plausibilité d'un rendement actuariel, en décimal.
 *
 * UN RENDEMENT NOMINAL NÉGATIF N'EXISTE PAS SUR CE MARCHÉ, et aucune signature
 * cotée à la BRVM ne se traite à trente pour cent. Quand le calcul en produit
 * un, ce n'est pas un signal de marché : c'est que le COURS et l'ÉCHÉANCIER NE
 * PARLENT PAS DE LA MÊME CHOSE.
 *
 * Le cas se lit dans les données. Les onze lignes concernées sont toutes des
 * emprunts AMORTISSABLES déjà bien entamés — FORBT.O1 cote 1 389 F, EOM.O4
 * 2 310 F, TPNE.O3 1 946 F, pour un nominal d'origine de 10 000 — et sur une
 * maturité résiduelle de quelques mois, le moindre écart entre le nominal
 * résiduel que suppose le cours et celui que reconstruit l'échéancier explose
 * une fois annualisé : FORBT.O1 ressortait à moins 81 %.
 *
 * On ÉCARTE donc ces rendements plutôt que de les corriger : les redresser
 * demanderait de décider laquelle des deux sources a tort, ce qu'on ne peut pas
 * savoir ici. L'écran dit ensuite sur quelle part de l'encours la moyenne
 * porte, ce qui laisse le lecteur juge.
 */
const YTM_MIN = 0;
const YTM_MAX = 0.3;

/**
 * Dernier cours de chaque ligne, indexé par ISIN.
 *
 * QUATRE LIGNES DU RÉFÉRENTIEL PARTAGENT L'ISIN « NC » — non communiqué. Les
 * indexer ensemble leur servirait à toutes le cours de la dernière d'entre
 * elles ; on les écarte donc du rapprochement, quitte à les laisser sans
 * rendement. Un rendement faux coûte plus cher qu'un rendement absent.
 */
function derniersCours(prix: ListedBondPrice[]): Map<string, ListedBondPrice> {
  const index = new Map<string, ListedBondPrice>();
  for (const p of prix) {
    if (!p.isin || p.isin === "NC") continue;
    const deja = index.get(p.isin);
    if (!deja || p.date > deja.date) index.set(p.isin, p);
  }
  return index;
}

/**
 * Tombées futures d'une ligne, agrégées par année civile et ramenées au
 * gisement entier.
 *
 * `getBondCashflows` raisonne PAR TITRE, sur un nominal d'origine de 10 000 F :
 * c'est la convention de toute la chaîne obligataire du site. Pour le
 * compartiment, on multiplie par le nombre de coupures émises — et non par
 * l'encours courant, qui a déjà été amputé des amortissements passés que ces
 * flux futurs, eux, ne comptent plus.
 */
function fluxParAnnee(bond: ListedBond, anneeMax: number): FluxAnnuel[] {
  if (!(bond.totalIssued > 0)) return [];
  const coupures = bond.totalIssued / NOMINAL_PAR_TITRE;
  const parAnnee = new Map<number, FluxAnnuel>();
  for (const cf of getBondCashflows(bond)) {
    const annee = Number(cf.date.slice(0, 4));
    if (!Number.isFinite(annee) || annee > anneeMax) continue;
    const ligne = parAnnee.get(annee) ?? { annee, coupon: 0, principal: 0 };
    const montant = cf.amount * coupures;
    if (cf.type === "coupon") ligne.coupon += montant;
    else ligne.principal += montant;
    parAnnee.set(annee, ligne);
  }
  return [...parAnnee.values()].sort((a, b) => a.annee - b.annee);
}

let _cache: { lignes: LigneObligation[]; dateCours: string } | null = null;

/**
 * Le compartiment obligataire, une ligne par emprunt coté.
 *
 * LES LIGNES ÉCHUES SONT ÉCARTÉES. Le référentiel les conserve — historiques
 * de prix, événements passés et portefeuilles antérieurs y renvoient — mais
 * une analyse de place décrit ce qui se négocie aujourd'hui, et un emprunt
 * remboursé n'a plus ni encours, ni rendement, ni duration.
 */
export function chargerObligations(): { lignes: LigneObligation[]; dateCours: string } {
  if (_cache !== null) return _cache;

  const bonds = loadListedBonds().filter((b) => b.yearsToMaturity > 0);
  const cours = derniersCours(loadListedBondPrices());
  const aujourdhui = new Date();
  const anneeMax = aujourdhui.getUTCFullYear() + HORIZON_ANNEES;

  let dateCours = "";
  const lignes: LigneObligation[] = bonds.map((b) => {
    const dernier = cours.get(b.isin) ?? null;
    if (dernier && dernier.date > dateCours) dateCours = dernier.date;

    // Sans cours de marché, `getBondYTMFromLatest` rend le coupon facial. Ce
    // repli est raisonnable pour une fiche — il vaut mieux qu'un blanc — mais
    // pas pour une moyenne de place : il y ferait passer une absence de
    // cotation pour un rendement au pair, et rapprocherait mécaniquement le
    // YTM moyen du coupon moyen. On ne retient donc le rendement que lorsqu'un
    // prix l'a réellement produit.
    const brut = dernier && dernier.cleanPrice > 0 ? getBondYTMFromLatest(b, dernier) : null;
    const ytm =
      brut !== null && Number.isFinite(brut) && brut >= YTM_MIN && brut <= YTM_MAX ? brut : null;
    // La duration se calcule SUR le rendement : écarté celui-ci, elle n'a plus
    // de support. La garder en la calculant sur un taux qu'on vient de juger
    // faux ferait entrer par la fenêtre ce qu'on a sorti par la porte.
    const duration =
      ytm !== null ? calculateDuration(b, aujourdhui, ytm).modified : null;

    return {
      isin: b.isin,
      code: b.code,
      nom: b.name,
      emetteur: b.issuer,
      typeEmetteur: b.issuerType || "Non classé",
      pays: b.country || "Non renseigné",
      encours: b.outstanding,
      emis: b.totalIssued,
      coupon: b.couponRate * 100,
      frequence: b.couponFrequency,
      dateEmission: b.issueDate,
      dateEcheance: b.maturityDate,
      maturite: b.yearsToMaturity,
      tranche: trancheDe(b.yearsToMaturity),
      amortissement: b.amortizationType || "IF",
      notation: b.rating || "",
      vert: b.greenBond,
      remboursableAnticipe: b.callable,
      cours: dernier ? dernier.cleanPrice : null,
      dateCours: dernier ? dernier.date : "",
      ytm: ytm === null ? null : ytm * 100,
      duration: duration === null || !Number.isFinite(duration) ? null : duration,
      flux: fluxParAnnee(b, anneeMax),
    };
  });

  _cache = { lignes, dateCours };
  return _cache;
}

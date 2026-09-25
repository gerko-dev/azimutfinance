// === Lecture des adjudications UMOA-Titres pour l'analyse de place ===
//
// SERVEUR UNIQUEMENT : `loadUmoaEmissions` lit le disque. Ce module ne calcule
// rien — il lit, corrige les unités douteuses, compacte, et laisse le panneau
// pivoter. Les règles de calcul sont dans `marche-monetaire-types.ts`, qui est
// pur et donc importable par le composant client.

import { loadUmoaEmissions } from "@/lib/dataLoader";
import { classifyOperation } from "@/lib/listedBondsTypes";
import { trancheMaturite, type LigneCompacte } from "./marche-monetaire-types";

const pct = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : arrondi(v * 100, 4);

const arrondi = (v: number, d: number): number => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

const prix = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : arrondi(v, 2);

/**
 * Maturité annoncée, en mois.
 *
 * On prend la maturité PUBLIÉE et non celle que donnent les dates : une ligne
 * réouverte a une durée de vie résiduelle plus courte (34 mois) que la tranche
 * sur laquelle elle s'adjuge (le 3 ans). C'est la tranche qui structure le
 * marché et dont parlent les opérateurs.
 *
 * SAUF QUAND LE CHAMP SE CONTREDIT. Un bon du Trésor ne dépasse pas deux ans :
 * au-delà de 24 mois, la valeur publiée n'est pas une maturité. Le CSV en donne
 * quatre exemples pour la seule année 2026, et ils ne relèvent pas du même
 * défaut — 91 et 364 sont des JOURS, tandis que le « 36 » du Niger du 8 mai
 * (échéance au 6 mai 2027) est une simple erreur de saisie. Diviser par 30 les
 * traiterait tous comme des jours et ferait de ce bon d'un an un bon d'un mois,
 * déplaçant 37 milliards de la mauvaise colonne.
 *
 * Dans ce cas, et dans celui d'un champ vide, on lit les DATES : elles donnent
 * les trois mois de l'un et les douze mois des trois autres, sans avoir à
 * deviner l'unité. On ne les prend pas par défaut parce qu'une ligne réouverte
 * a une durée résiduelle plus courte que sa tranche d'adjudication.
 */
function maturiteMois(e: {
  type: "OAT" | "BAT";
  maturityMonths: number;
  maturity: number;
}): number {
  const m = e.maturityMonths;
  if (m > 0 && !(e.type === "BAT" && m > 24)) return m;
  return e.maturity * 12;
}

const INDICE_NATURE = { cash_auction: 0, swap: 1, buyback: 2 } as const;

let _cache: LigneCompacte[] | null = null;

/**
 * Historique complet des adjudications, compacté pour le transport.
 *
 * Mémoïsé au niveau du module comme le sont les chargeurs de CSV : la source
 * ne change pas dans la vie d'un processus, et refaire le mapping de 3 200
 * lignes à chaque requête ne rendrait rien de plus.
 */
export function chargerAdjudications(): LigneCompacte[] {
  if (_cache !== null) return _cache;

  _cache = loadUmoaEmissions()
    .filter((e) => e.country && e.date)
    .map((e): LigneCompacte => [
      e.country,
      trancheMaturite(maturiteMois(e)),
      e.type === "OAT" ? 1 : 0,
      INDICE_NATURE[classifyOperation(e.precisions)],
      e.date,
      arrondi(e.amountIssued, 1),
      arrondi(e.amountSubmitted, 1),
      arrondi(e.amount, 1),
      pct(e.couponRate),
      prix(e.marginalPrice),
      pct(e.marginalYield),
      prix(e.weightedAvgPrice),
      pct(e.weightedAvgRate),
      pct(e.weightedAvgYield),
    ])
    .sort((a, b) => a[4].localeCompare(b[4]));

  return _cache;
}

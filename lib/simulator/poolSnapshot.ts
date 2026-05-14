import "server-only";

import { loadStocks } from "@/lib/dataLoader";

/**
 * Une entrée du pool d'actions disponibles pour la Course à l'introduction.
 * - `code`        : ticker BRVM (ex: SNTS)
 * - `total_units` : nombre d'actions effectivement cotées (champ `float` du
 *                   CSV titres.csv — distinct du nombre total d'actions de
 *                   l'entreprise)
 * - `ref_price`   : cours de référence à la date du snapshot (= dernier cours
 *                   de clôture BRVM connu avant l'ouverture de la saison),
 *                   arrondi au multiple de 5 FCFA le plus proche (pas de tick BRVM)
 */
export type PoolEntry = {
  code: string;
  total_units: number;
  ref_price: number;
};

/**
 * Arrondi au multiple de 5 le plus proche (tick BRVM standard).
 */
function roundToTick(price: number): number {
  return Math.round(price / 5) * 5;
}

/**
 * Lit titres.csv et construit le pool initial pour une saison.
 * Filtre :
 *   - float (= actions cotées) > 0
 *   - price > 0 (cours de clôture connu)
 *
 * Source de vérité : le CSV `titres.csv` doit avoir été rafraichi par le
 * workflow GitHub `scrape-sika.yml` avant l'ouverture de la saison.
 */
export function computeInitialPool(): PoolEntry[] {
  const rows = loadStocks();
  const out: PoolEntry[] = [];
  for (const r of rows) {
    const code = (r.code || "").trim().toUpperCase();
    if (!code) continue;
    const floatStr = (r.float || "").trim();
    const priceStr = (r.price || "").trim();
    if (!floatStr || floatStr === "NC" || floatStr === "-") continue;
    if (!priceStr || priceStr === "NC" || priceStr === "-") continue;
    const floatValue = parseNumStrict(floatStr);
    const price = parseNumStrict(priceStr);
    if (!isFinite(floatValue) || floatValue <= 0) continue;
    if (!isFinite(price) || price <= 0) continue;
    out.push({
      code,
      total_units: Math.floor(floatValue),
      ref_price: roundToTick(price),
    });
  }
  return out;
}

/**
 * Valeur totale du pool en FCFA (= somme units × ref_price).
 */
export function totalPoolValue(pool: PoolEntry[]): number {
  let sum = 0;
  for (const e of pool) sum += e.total_units * e.ref_price;
  return sum;
}

/**
 * Total des unités du pool (informatif).
 */
export function totalPoolUnits(pool: PoolEntry[]): number {
  let sum = 0;
  for (const e of pool) sum += e.total_units;
  return sum;
}

// Parsing local pour ne pas dépendre de la mémoïsation du dataLoader
// (ce qu'on a déjà via loadStocks).
function parseNumStrict(s: string): number {
  if (!s) return NaN;
  const t = s.trim();
  if (t === "" || t === "NC" || t === "-") return NaN;
  // Scientifique française (Excel) : 1,23E+11
  if (/^-?\d+,\d+[eE][+-]?\d+$/.test(t)) {
    return Number(t.replace(",", "."));
  }
  const cleaned = t.replace(/\s/g, "").replace(/,/g, ".");
  return Number(cleaned);
}

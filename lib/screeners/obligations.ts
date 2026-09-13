import "server-only";

import { loadListedBonds } from "@/lib/dataLoader";
import { getBondYTMFromLatest } from "@/lib/listedBondsTypes";
import type { ListedBondPrice } from "@/lib/listedBondsTypes";
import { getBrvmBondsSnapshot } from "@/lib/brvm/liveBonds";

export type BondScreenerRow = {
  isin: string;
  code: string;
  name: string;
  issuer: string;
  issuerType: string;
  country: string;
  sector: string;
  couponRate: number;
  couponFrequency: number;
  maturityDate: string;
  yearsToMaturity: number;
  amortizationType: string;
  rating: string;
  callable: boolean;
  greenBond: boolean;
  outstanding: number;
  /** Cours propre de la derniere seance, null si le titre n'a pas cote. */
  cleanPrice: number | null;
  /** Rendement a l'echeance, null quand il n'y a pas de cours exploitable. */
  ytm: number | null;
};

export type BondsScreenerPayload = {
  rows: BondScreenerRow[];
  issuerTypes: string[];
  countries: string[];
  ratings: string[];
  amortizationTypes: string[];
  /** Date du releve de cours, pour que la page dise de quand elle parle. */
  priceDate: string;
};

/**
 * Donnees du screener obligations.
 *
 * Les titres echus sont exclus : `yearsToMaturity <= 0` signifie qu'ils ne sont
 * plus negociables, et les garder fausserait tout classement par rendement.
 *
 * Les cours viennent du scraping BRVM, seule source a jour — le CSV de prix est
 * un instantane fige. Un cours a 0 signale « aucune transaction du jour » : on
 * le traite comme une absence de prix plutot que comme un prix nul, sans quoi
 * le rendement calcule serait aberrant et remonterait en tete du tri.
 */
export async function buildBondsScreenerPayload(): Promise<BondsScreenerPayload> {
  const bonds = loadListedBonds().filter((b) => b.yearsToMaturity > 0);
  const snapshot = await getBrvmBondsSnapshot();
  const priceDate = snapshot.fetchedAt.slice(0, 10);

  const codeToIsin = new Map<string, string>();
  for (const b of bonds) {
    if (b.code) codeToIsin.set(b.code.toUpperCase(), b.isin);
  }

  const priceByIsin = new Map<string, ListedBondPrice>();
  for (const q of snapshot.quotes) {
    const isin = codeToIsin.get(q.code);
    if (!isin) continue;
    if (!Number.isFinite(q.currentPrice) || q.currentPrice <= 0) continue;
    priceByIsin.set(isin, {
      isin,
      date: priceDate,
      cleanPrice: q.currentPrice,
      dirtyPrice: q.currentPrice + (q.couponCouru || 0),
      volume: 0,
      valeurTransigee: 0,
    });
  }

  const rows: BondScreenerRow[] = bonds.map((b) => {
    const price = priceByIsin.get(b.isin) ?? null;
    const ytmRaw = price ? getBondYTMFromLatest(b, price) : null;
    return {
      isin: b.isin,
      code: b.code,
      name: b.name,
      issuer: b.issuer,
      issuerType: b.issuerType,
      country: b.country,
      sector: b.sector,
      couponRate: b.couponRate,
      couponFrequency: b.couponFrequency,
      maturityDate: b.maturityDate,
      yearsToMaturity: b.yearsToMaturity,
      amortizationType: b.amortizationType,
      rating: b.rating,
      callable: b.callable,
      greenBond: b.greenBond,
      outstanding: b.outstanding,
      cleanPrice: price ? price.cleanPrice : null,
      ytm: Number.isFinite(ytmRaw) && ytmRaw !== 0 ? (ytmRaw as number) : null,
    };
  });

  const uniq = (xs: string[]) =>
    Array.from(new Set(xs.filter((x) => x && x.trim() !== ""))).sort((a, b) =>
      a.localeCompare(b, "fr"),
    );

  return {
    rows,
    issuerTypes: uniq(rows.map((r) => r.issuerType)),
    countries: uniq(rows.map((r) => r.country)),
    ratings: uniq(rows.map((r) => r.rating)),
    amortizationTypes: uniq(rows.map((r) => r.amortizationType)),
    priceDate,
  };
}

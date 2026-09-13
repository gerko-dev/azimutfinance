import "server-only";

import {
  loadListedBonds,
  loadListedBondPrices,
  loadUmoaEmissions,
} from "@/lib/dataLoader";
import { getBondYTMFromLatest } from "@/lib/listedBondsTypes";
import type { ListedBondPrice } from "@/lib/listedBondsTypes";
import { getBrvmBondsSnapshot } from "@/lib/brvm/liveBonds";

/** Deux univers distincts, volontairement separes jusque dans le filtre. */
export type BondSegment = "cotee" | "souverain";

export type BondScreenerRow = {
  isin: string;
  code: string;
  name: string;
  issuer: string;
  issuerType: string;
  country: string;
  sector: string;
  segment: BondSegment;
  /** "OAT" / "BAT" pour les souverains, "" pour les cotees. */
  instrument: string;
  couponRate: number | null;
  couponFrequency: number;
  maturityDate: string;
  yearsToMaturity: number;
  amortizationType: string;
  rating: string;
  callable: boolean;
  greenBond: boolean;
  outstanding: number;
  cleanPrice: number | null;
  /** Date du cours retenu — elle n'est pas la meme pour tous. */
  priceDate: string;
  ytm: number | null;
  /** D'ou vient le rendement : marche (cotees) ou adjudication (souverains). */
  ytmSource: "marche" | "adjudication" | null;
};

export type BondsScreenerPayload = {
  rows: BondScreenerRow[];
  issuerTypes: string[];
  countries: string[];
  ratings: string[];
  amortizationTypes: string[];
  /** Date du dernier relevé de cours BRVM exploitable. */
  priceDate: string;
  /** Vrai quand le scraping BRVM n'a rien rendu et qu'on lit le CSV. */
  pricesFromFallback: boolean;
};

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Donnees du screener obligations.
 *
 * DEUX UNIVERS, UN SEUL ECRAN. Les obligations cotees BRVM et les souverains
 * UMOA-Titres (OAT / BAT) sont deux domaines que le reste du code garde
 * separes a juste titre — ils n'ont ni le meme cycle de vie ni la meme source
 * de prix. Mais un investisseur qui cherche « du 6,5 % a 5 ans » ne veut pas
 * choisir son univers avant de chercher. Ils cohabitent donc ici, chaque ligne
 * disant d'ou elle vient, et un filtre permettant de n'en garder qu'un.
 *
 * ORIGINE DU RENDEMENT — elle differe et la colonne le dit. Pour une cotee,
 * c'est un YTM calcule sur le dernier cours de marche. Pour un souverain non
 * cote, il n'y a pas de marche secondaire : c'est le rendement moyen pondere
 * de la derniere adjudication. Les presenter sans distinction laisserait croire
 * a une comparaison de meme nature.
 *
 * COURS — le scraping BRVM est la source a jour, mais il rend parfois une liste
 * vide (site indisponible, reseau filtre). Dans ce cas on retombe sur le CSV
 * `obligations-cotees-prix.csv`. Un cours vieux de quelques jours vaut mieux
 * qu'une colonne vide qui rend le tri par rendement inoperant — a condition de
 * dire de quand il date, ce que fait `priceDate`.
 */
export async function buildBondsScreenerPayload(): Promise<BondsScreenerPayload> {
  const bonds = loadListedBonds().filter((b) => b.yearsToMaturity > 0);

  // --- Cours : live d'abord, CSV en repli ---------------------------------
  const snapshot = await getBrvmBondsSnapshot();
  const liveDate = snapshot.fetchedAt.slice(0, 10);

  const codeToIsin = new Map<string, string>();
  for (const b of bonds) {
    if (b.code) codeToIsin.set(b.code.toUpperCase(), b.isin);
  }

  const priceByIsin = new Map<string, ListedBondPrice>();
  for (const q of snapshot.quotes) {
    const isin = codeToIsin.get(q.code);
    if (!isin) continue;
    // Un cours a 0 signifie « aucune transaction du jour » : c'est une absence
    // de prix, pas un prix nul. Le garder ferait remonter un rendement
    // aberrant en tete du tri par rendement.
    if (!Number.isFinite(q.currentPrice) || q.currentPrice <= 0) continue;
    priceByIsin.set(isin, {
      isin,
      date: liveDate,
      cleanPrice: q.currentPrice,
      dirtyPrice: q.currentPrice + (q.couponCouru || 0),
      volume: 0,
      valeurTransigee: 0,
    });
  }

  const pricesFromFallback = priceByIsin.size === 0;
  let priceDate = liveDate;
  if (pricesFromFallback) {
    // Dernier cours connu par ISIN dans le CSV.
    for (const p of loadListedBondPrices()) {
      if (!Number.isFinite(p.cleanPrice) || p.cleanPrice <= 0) continue;
      const prev = priceByIsin.get(p.isin);
      if (!prev || p.date > prev.date) priceByIsin.set(p.isin, p);
    }
    priceDate = Array.from(priceByIsin.values()).reduce(
      (acc, p) => (p.date > acc ? p.date : acc),
      "",
    );
  }

  const rowsCotees: BondScreenerRow[] = bonds.map((b) => {
    const price = priceByIsin.get(b.isin) ?? null;
    const ytmRaw = price ? getBondYTMFromLatest(b, price) : null;
    const ytm =
      ytmRaw !== null && Number.isFinite(ytmRaw) && ytmRaw !== 0 ? ytmRaw : null;
    return {
      isin: b.isin,
      code: b.code,
      name: b.name,
      issuer: b.issuer,
      issuerType: b.issuerType,
      country: b.country,
      sector: b.sector,
      segment: "cotee" as const,
      instrument: "",
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
      priceDate: price ? price.date : "",
      ytm,
      ytmSource: ytm !== null ? ("marche" as const) : null,
    };
  });

  // --- Souverains UMOA-Titres : une ligne par ISIN, derniere adjudication ---
  const now = Date.now();
  const derniereParIsin = new Map<
    string,
    ReturnType<typeof loadUmoaEmissions>[number]
  >();
  for (const e of loadUmoaEmissions()) {
    if (!e.isin || e.isin === "--") continue;
    if (!e.maturityDate) continue;
    const prev = derniereParIsin.get(e.isin);
    if (!prev || e.date > prev.date) derniereParIsin.set(e.isin, e);
  }

  const rowsSouverains: BondScreenerRow[] = [];
  for (const e of derniereParIsin.values()) {
    const ech = new Date(`${e.maturityDate}T00:00:00Z`).getTime();
    if (!Number.isFinite(ech)) continue;
    const yearsToMaturity = (ech - now) / MS_PER_YEAR;
    if (yearsToMaturity <= 0) continue;

    const rendement = e.weightedAvgYield || e.weightedAvgRate || e.marginalYield;
    const prix = e.weightedAvgPrice ?? e.marginalPrice ?? null;

    rowsSouverains.push({
      isin: e.isin,
      code: `${e.type} ${e.country}`,
      name: `${e.type} ${e.countryName} ${
        e.couponRate ? `${(e.couponRate * 100).toFixed(2).replace(".", ",")} %` : "zéro coupon"
      } — ${e.maturityDate}`,
      issuer: `État ${e.countryName}`,
      issuerType: e.type === "BAT" ? "Bon du Trésor (BAT)" : "Obligation du Trésor (OAT)",
      country: e.country,
      sector: "Souverain",
      segment: "souverain" as const,
      instrument: e.type,
      couponRate: e.couponRate,
      couponFrequency: 1,
      maturityDate: e.maturityDate,
      yearsToMaturity,
      amortizationType: e.amortizationType ?? "",
      rating: "",
      callable: false,
      greenBond: false,
      outstanding: e.amount || 0,
      cleanPrice: prix,
      priceDate: e.date,
      ytm: rendement && Number.isFinite(rendement) ? rendement : null,
      ytmSource: rendement ? ("adjudication" as const) : null,
    });
  }

  const rows = [...rowsCotees, ...rowsSouverains];

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
    pricesFromFallback,
  };
}

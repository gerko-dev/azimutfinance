import "server-only";

// === DONNÉES DU RAPPORT HEBDOMADAIRE MARCHÉ DES TITRES PUBLICS (MTP / UMOA-Titres) ===
// Assemble, pour chacun des 8 États de l'UEMOA, l'activité d'adjudication de la
// semaine + le contexte 12 mois glissants (rendements, couverture, maturités,
// série mensuelle), puis déclenche la génération des commentaires IA
// (Claude + recherche web). Format pensé pour le PDF A4 portrait, même structure
// que l'hebdo matières premières.

import { loadUmoaEmissions, loadUmoaEmissionsAVenir } from "@/lib/dataLoader";
import type { EmissionUMOA } from "@/lib/listedBondsTypes";
import { umoaCoverageRatio } from "@/lib/listedBondsTypes";
import {
  generateMoneyMarketCommentary,
  type MoneyMarketCommentary,
} from "./moneyMarketCommentary";

// Les 8 États membres de l'UEMOA. Le thème de chaque pays reprend DEUX couleurs
// de son drapeau (`color` = teinte primaire qui porte la courbe de taux ;
// `color2` = teinte secondaire, bout du dégradé sur les barres). Les paires sont
// choisies pour rester différenciables entre pays malgré le tronc commun
// vert/jaune/rouge/orange des drapeaux ouest-africains.
export const COUNTRY_META: Record<
  string,
  { name: string; capital: string; color: string; color2: string }
> = {
  CI: { name: "Côte d'Ivoire", capital: "Abidjan", color: "#F77F00", color2: "#009E60" }, // orange + vert
  SN: { name: "Sénégal", capital: "Dakar", color: "#00853F", color2: "#FDEF42" }, // vert + jaune
  BJ: { name: "Bénin", capital: "Cotonou", color: "#E8112D", color2: "#008751" }, // rouge + vert
  TG: { name: "Togo", capital: "Lomé", color: "#006A4E", color2: "#FFCE00" }, // vert + jaune
  BF: { name: "Burkina Faso", capital: "Ouagadougou", color: "#EF2B2D", color2: "#009E49" }, // rouge + vert
  ML: { name: "Mali", capital: "Bamako", color: "#14B53A", color2: "#FCD116" }, // vert + jaune
  NE: { name: "Niger", capital: "Niamey", color: "#E05206", color2: "#0DB02B" }, // orange + vert
  GW: { name: "Guinée-Bissau", capital: "Bissau", color: "#CE1126", color2: "#FCD116" }, // rouge + jaune
};

const MATURITY_BUCKETS = [
  { label: "≤ 6 mois", min: 0, max: 0.5 },
  { label: "6 mois – 1 an", min: 0.5, max: 1 },
  { label: "1 – 3 ans", min: 1, max: 3 },
  { label: "3 – 5 ans", min: 3, max: 5 },
  { label: "5 – 7 ans", min: 5, max: 7 },
  { label: "7 – 10 ans", min: 7, max: 10 },
  { label: "> 10 ans", min: 10, max: Infinity },
];

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const MOIS_ABBR = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

export type AuctionLite = {
  date: string;
  type: "OAT" | "BAT";
  isin: string;
  maturityYears: number;
  maturityDate: string;
  couponRate: number | null;
  amountSubmitted: number; // millions FCFA
  amount: number; // montant retenu, millions FCFA
  amountIssued: number; // montant mis en adjudication
  weightedAvgYield: number; // décimal
};

export type MaturityBucket = {
  label: string;
  count: number;
  amount: number; // millions FCFA
  yieldRate: number; // décimal
};

export type MonthlyPoint = {
  month: string; // YYYY-MM
  label: string; // « mai 25 »
  amountMds: number; // milliards FCFA
  yieldPct: number; // %
  count: number;
};

export type UpcomingLite = {
  date: string;
  instrument: string;
  amount: number; // millions FCFA
  maturityMonths: number;
  precisions: string;
};

export type CalendarItem = UpcomingLite & {
  code: string;
  name: string;
  color: string;
};

export type CountryWeekly = {
  code: string;
  name: string;
  capital: string;
  color: string;
  color2: string;
  // Positionnement régional (12 mois)
  rank: number;
  totalCountries: number;
  sharePct: number;
  // Agrégats 12 mois glissants
  count12m: number;
  amount12m: number; // millions FCFA
  submitted12m: number;
  issued12m: number;
  coverage12m: number | null; // soumis / mis en adjudication
  yield12m: number | null; // décimal
  batCount: number;
  batAmount: number;
  batYield: number | null;
  oatCount: number;
  oatAmount: number;
  oatYield: number | null;
  avgMaturity: number;
  minMaturity: number;
  maxMaturity: number;
  uniqIsins: number;
  /** Tendance de taux : rendement pondéré 90 derniers jours − 90 précédents (points de base). */
  yieldTrendBps: number | null;
  // Activité de la semaine
  weekCount: number;
  weekAmount: number;
  weekSubmitted: number;
  weekCoverage: number | null;
  weekYield: number | null; // décimal
  weekAuctions: AuctionLite[];
  // Séries & distributions
  monthly: MonthlyPoint[]; // 24 derniers mois actifs
  maturityRows: MaturityBucket[];
  upcoming: UpcomingLite[];
  // Commentaire IA de la semaine (null si indisponible)
  commentary: string | null;
};

export type MoneyMarketWeeklyData = {
  generatedAt: string;
  asOf: string;
  weekStart: string;
  weekLabel: string;
  countries: CountryWeekly[]; // triés par montant 12 mois décroissant
  // Agrégats régionaux de la semaine
  weekTotalCount: number;
  weekTotalAmount: number; // millions FCFA
  weekTotalSubmitted: number;
  weekCoverage: number | null;
  weekYield: number | null; // décimal
  // Contexte 12 mois
  total12mAmount: number; // millions FCFA
  total12mCount: number;
  uemoaYield12m: number | null;
  // Calendrier de la semaine à venir (toutes signatures confondues)
  calendar: CalendarItem[];
  globalCommentary: string | null;
  commentaryModel: string | null;
  commentaryAvailable: boolean;
  commentaryStatus: "ok" | "no_key" | "error";
  sources: string[];
};

function shiftMonthsISO(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}
function shiftDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
/** Lundi (00:00) de la semaine ISO contenant `iso`. */
function mondayOfWeekISO(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const back = (d.getUTCDay() + 6) % 7; // jours écoulés depuis lundi (lun=0…dim=6)
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
function frDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return iso;
  return `${d} ${MOIS_FR[m - 1]} ${y}`;
}
function frDateShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MOIS_FR[Number(m) - 1]}`;
}
function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MOIS_ABBR[Number(m) - 1]} ${y.slice(2)}`;
}

function weightedYield(items: EmissionUMOA[]): number | null {
  const total = items.reduce((s, e) => s + e.amount, 0);
  if (total <= 0) return null;
  return items.reduce((s, e) => s + e.weightedAvgYield * e.amount, 0) / total;
}

function buildMonthly(items: EmissionUMOA[]): MonthlyPoint[] {
  const acc = new Map<string, { amount: number; weighted: number; count: number }>();
  for (const e of items) {
    const month = e.date.slice(0, 7);
    if (!month) continue;
    const s = acc.get(month) ?? { amount: 0, weighted: 0, count: 0 };
    s.amount += e.amount;
    s.weighted += e.weightedAvgYield * e.amount;
    s.count += 1;
    acc.set(month, s);
  }
  return Array.from(acc.entries())
    .map(([month, s]) => ({
      month,
      label: monthLabel(month),
      amountMds: s.amount / 1000,
      yieldPct: s.amount > 0 ? (s.weighted / s.amount) * 100 : 0,
      count: s.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function toAuctionLite(e: EmissionUMOA): AuctionLite {
  return {
    date: e.date,
    type: e.type,
    isin: e.isin,
    maturityYears: e.maturity,
    maturityDate: e.maturityDate,
    couponRate: e.couponRate,
    amountSubmitted: e.amountSubmitted,
    amount: e.amount,
    amountIssued: e.amountIssued,
    weightedAvgYield: e.weightedAvgYield,
  };
}

export async function getMoneyMarketWeeklyData(): Promise<MoneyMarketWeeklyData> {
  // On raisonne en DATE D'ADJUDICATION (date de l'opération), et non en date de
  // valeur : c'est la date à laquelle l'émetteur s'est présenté au guichet. Le
  // champ `date` d'EmissionUMOA porte la date de valeur ; on le réaligne ici sur
  // `tradeDate` pour toute la chaîne (arrêté, fenêtres, séries mensuelles).
  const all = loadUmoaEmissions()
    .filter((e) => COUNTRY_META[e.country])
    .map((e) => (e.tradeDate ? { ...e, date: e.tradeDate } : e));
  const asOf = all.reduce((m, e) => (e.date > m ? e.date : m), "");
  // Semaine = du lundi à l'arrêté (dernière adjudication), plutôt qu'une fenêtre
  // glissante de 6 jours qui mordait sur le week-end précédent (« du 16 au 22 »).
  const weekStart = asOf ? mondayOfWeekISO(asOf) : "";
  const cutoff12 = asOf ? shiftMonthsISO(asOf, 12) : "";
  const cutoff3 = asOf ? shiftMonthsISO(asOf, 3) : "";
  const cutoff6 = asOf ? shiftMonthsISO(asOf, 6) : "";
  const weekLabel =
    asOf && weekStart ? `du ${frDateShort(weekStart)} au ${frDate(asOf)}` : "";

  const recentUEMOA = all.filter((e) => e.date >= cutoff12 && e.date <= asOf);
  const total12mAmount = recentUEMOA.reduce((s, e) => s + e.amount, 0);
  const total12mCount = recentUEMOA.length;

  // Classement 12 mois par montant retenu.
  const amountByCountry = new Map<string, number>();
  for (const e of recentUEMOA) {
    amountByCountry.set(e.country, (amountByCountry.get(e.country) ?? 0) + e.amount);
  }
  const ranking = Object.keys(COUNTRY_META)
    .map((code) => ({ code, amount: amountByCountry.get(code) ?? 0 }))
    .sort((a, b) => b.amount - a.amount);
  const rankByCode = new Map(ranking.map((r, i) => [r.code, i + 1]));
  const totalCountries = ranking.length;

  // Émissions à venir (calendrier).
  const upcomingAll = loadUmoaEmissionsAVenir()
    .filter((e) => COUNTRY_META[e.country] && (!asOf || e.dateOperation >= asOf))
    .sort((a, b) => a.dateOperation.localeCompare(b.dateOperation));

  const countries: CountryWeekly[] = ranking.map(({ code }) => {
    const meta = COUNTRY_META[code];
    const emissions = all
      .filter((e) => e.country === code)
      .sort((a, b) => b.date.localeCompare(a.date));
    const recent = emissions.filter((e) => e.date >= cutoff12 && e.date <= asOf);
    const weekItems = emissions.filter((e) => e.date >= weekStart && e.date <= asOf);

    const amount12m = recent.reduce((s, e) => s + e.amount, 0);
    const submitted12m = recent.reduce((s, e) => s + e.amountSubmitted, 0);
    const issued12m = recent.reduce((s, e) => s + e.amountIssued, 0);
    const bat = recent.filter((e) => e.type === "BAT");
    const oat = recent.filter((e) => e.type === "OAT");

    const maturities = recent.map((e) => e.maturity).filter((m) => m > 0);
    const avgMaturity =
      recent.length > 0 ? recent.reduce((s, e) => s + e.maturity, 0) / recent.length : 0;

    // Tendance de taux : 90 derniers jours vs 90 précédents.
    const last90 = recent.filter((e) => e.date >= cutoff3);
    const prev90 = recent.filter((e) => e.date >= cutoff6 && e.date < cutoff3);
    const yLast = weightedYield(last90);
    const yPrev = weightedYield(prev90);
    const yieldTrendBps =
      yLast != null && yPrev != null ? (yLast - yPrev) * 10000 : null;

    const weekAmount = weekItems.reduce((s, e) => s + e.amount, 0);
    const weekSubmitted = weekItems.reduce((s, e) => s + e.amountSubmitted, 0);

    const maturityRows: MaturityBucket[] = MATURITY_BUCKETS.map((b) => {
      const items = recent.filter((e) => e.maturity > b.min && e.maturity <= b.max);
      return {
        label: b.label,
        count: items.length,
        amount: items.reduce((s, e) => s + e.amount, 0),
        yieldRate: weightedYield(items) ?? 0,
      };
    });

    const monthly = buildMonthly(
      emissions.filter((e) => e.date >= shiftMonthsISO(asOf, 24)),
    );

    const upcoming: UpcomingLite[] = upcomingAll
      .filter((e) => e.country === code)
      .slice(0, 4)
      .map((e) => ({
        date: e.dateOperation,
        instrument: e.instrument || (e.titreES ? "ES" : ""),
        amount: e.amount,
        maturityMonths: e.maturityMonths,
        precisions: e.precisions,
      }));

    return {
      code,
      name: meta.name,
      capital: meta.capital,
      color: meta.color,
      color2: meta.color2,
      rank: rankByCode.get(code) ?? totalCountries,
      totalCountries,
      sharePct: total12mAmount > 0 ? (amount12m / total12mAmount) * 100 : 0,
      count12m: recent.length,
      amount12m,
      submitted12m,
      issued12m,
      coverage12m: umoaCoverageRatio(recent),
      yield12m: weightedYield(recent),
      batCount: bat.length,
      batAmount: bat.reduce((s, e) => s + e.amount, 0),
      batYield: weightedYield(bat),
      oatCount: oat.length,
      oatAmount: oat.reduce((s, e) => s + e.amount, 0),
      oatYield: weightedYield(oat),
      avgMaturity,
      minMaturity: maturities.length ? Math.min(...maturities) : 0,
      maxMaturity: maturities.length ? Math.max(...maturities) : 0,
      uniqIsins: new Set(recent.map((e) => e.isin).filter(Boolean)).size,
      yieldTrendBps,
      weekCount: weekItems.length,
      weekAmount,
      weekSubmitted,
      weekCoverage: umoaCoverageRatio(weekItems),
      weekYield: weightedYield(weekItems),
      weekAuctions: weekItems
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(toAuctionLite),
      monthly,
      maturityRows,
      upcoming,
      commentary: null,
    };
  });

  // Agrégats régionaux de la semaine.
  const weekUEMOA = all.filter((e) => e.date >= weekStart && e.date <= asOf);
  const weekTotalAmount = weekUEMOA.reduce((s, e) => s + e.amount, 0);
  const weekTotalSubmitted = weekUEMOA.reduce((s, e) => s + e.amountSubmitted, 0);

  // Calendrier semaine à venir : 7 jours suivant l'arrêté.
  const calEnd = asOf ? shiftDaysISO(asOf, -7) : ""; // asOf + 7 jours
  const calendar: CalendarItem[] = upcomingAll
    .filter((e) => !calEnd || e.dateOperation <= calEnd)
    .slice(0, 12)
    .map((e) => ({
      code: e.country,
      name: COUNTRY_META[e.country].name,
      color: COUNTRY_META[e.country].color,
      date: e.dateOperation,
      instrument: e.instrument || (e.titreES ? "ES" : ""),
      amount: e.amount,
      maturityMonths: e.maturityMonths,
      precisions: e.precisions,
    }));

  // Commentaires IA (un seul appel pour tout le rapport).
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  let commentary: MoneyMarketCommentary | null = null;
  try {
    commentary = await generateMoneyMarketCommentary({
      weekLabel,
      asOf,
      weekTotalAmountMds: weekTotalAmount / 1000,
      weekTotalCount: weekUEMOA.length,
      countries: countries.map((c) => ({
        code: c.code,
        name: c.name,
        weekCount: c.weekCount,
        weekAmountMds: c.weekAmount / 1000,
        weekYieldPct: c.weekYield != null ? c.weekYield * 100 : null,
        yield12mPct: c.yield12m != null ? c.yield12m * 100 : 0,
        rank: c.rank,
        sharePct: c.sharePct,
      })),
    });
  } catch (e) {
    console.error("[moneyMarketWeekly] génération commentaires échouée", e);
  }

  if (commentary) {
    for (const c of countries) {
      c.commentary = commentary.perCountry[c.code]?.trim() || null;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    asOf,
    weekStart,
    weekLabel,
    countries,
    weekTotalCount: weekUEMOA.length,
    weekTotalAmount,
    weekTotalSubmitted,
    weekCoverage: umoaCoverageRatio(weekUEMOA),
    weekYield: weightedYield(weekUEMOA),
    total12mAmount,
    total12mCount,
    uemoaYield12m: weightedYield(recentUEMOA),
    calendar,
    globalCommentary: commentary?.global || null,
    commentaryModel: commentary?.model ?? null,
    commentaryAvailable: commentary !== null,
    commentaryStatus: commentary ? "ok" : hasKey ? "error" : "no_key",
    sources: commentary?.sources ?? [],
  };
}

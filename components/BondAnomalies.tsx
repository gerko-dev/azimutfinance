"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ListedBond, ListedBondPrice } from "@/lib/listedBondsTypes";
import { getBondYTMFromLatest } from "@/lib/listedBondsTypes";
import { bondHref } from "@/lib/listedBondsTypes";

type EnrichedBond = ListedBond & {
  ytm: number;
  /** Date du cours ayant servi au YTM. null = aucun cours observe. */
  priceDate: string | null;
};

type Anomaly = {
  bond: EnrichedBond;
  reason: string;
  severity: "watch_high" | "watch_low";
  /** Ecart absolu en bps par rapport a la mediane des pairs (positif = decote). */
  deviationBps: number;
  peersCount: number;
  zScore: number;
  /** Dispersion de la cohorte, en bps. Sert a juger si l'ecart est mesurable. */
  peerSpreadBps: number;
  priceDate: string;
};

type Props = {
  bonds: ListedBond[];
  prices: ListedBondPrice[];
  /** Limite l'affichage. null = illimité. Défaut: null. */
  limit?: number | null;
};

/** Taille minimale de cohorte. A trois pairs, l'ecart type n'a pas de sens :
 *  un z de 1,6 y est du bruit, pas un signal. */
const MIN_PAIRS = 5;

/** Plancher de dispersion, en fraction (0,0020 = 20 bps). En deca, la cohorte
 *  est trop homogene pour qu'un ecart soit mesurable : diviser par un ecart
 *  type quasi nul produisait des z-scores de 40, mecaniquement absurdes. */
const SD_PLANCHER = 0.002;

const Z_SEUIL = 1.5;

/**
 * Detection statistique : pour chaque obligation notee ET cotee, compare son
 * YTM a celui de ses pairs (meme pays, meme notation, duree ±1 an).
 *
 * Trois garde-fous, appris des faux positifs de la version precedente :
 *  - on n'evalue que des titres dont le YTM vient d'un COURS OBSERVE. Sans
 *    cours, getBondYTMFromLatest retourne le taux de coupon : comparer des
 *    coupons entre eux ne revele aucune anomalie de valorisation, seulement
 *    des conditions d'emission differentes ;
 *  - variance d'ECHANTILLON (n−1), et non de population : sur des cohortes de
 *    5 a 20 lignes, diviser par n sous-estime la dispersion et gonfle le z ;
 *  - plancher de dispersion : sous 20 bps d'ecart type, on ne signale rien.
 *
 * Ce n'est pas un signal d'achat ou de vente — un point d'analyse a creuser.
 */
function detectAnomalies(
  bonds: ListedBond[],
  prices: ListedBondPrice[],
): Anomaly[] {
  const latestByIsin = new Map<string, ListedBondPrice>();
  for (const p of prices) {
    const cur = latestByIsin.get(p.isin);
    if (!cur || p.date > cur.date) latestByIsin.set(p.isin, p);
  }

  const enriched: EnrichedBond[] = bonds.map((b) => {
    const lp = latestByIsin.get(b.isin);
    const cote = !!lp && lp.cleanPrice > 0;
    return {
      ...b,
      ytm: getBondYTMFromLatest(b, lp ?? null),
      priceDate: cote ? lp!.date : null,
    };
  });

  // Univers evaluable : note ET cote.
  const univers = enriched.filter(
    (b) => b.rating && b.rating.trim() !== "" && b.priceDate !== null && b.ytm > 0,
  );

  const anoms: Anomaly[] = [];

  univers.forEach((b) => {
    const peers = univers.filter(
      (p) =>
        p.country === b.country &&
        p.rating === b.rating &&
        Math.abs(p.yearsToMaturity - b.yearsToMaturity) < 1 &&
        p.isin !== b.isin,
    );

    if (peers.length < MIN_PAIRS) return;

    const ys = peers.map((p) => p.ytm);
    const moyenne = ys.reduce((s, y) => s + y, 0) / ys.length;
    // Variance d'echantillon : n−1 au denominateur.
    const variance =
      ys.reduce((s, y) => s + (y - moyenne) ** 2, 0) / (ys.length - 1);
    const ecartType = Math.sqrt(variance);

    if (ecartType < SD_PLANCHER) return;

    const ecart = b.ytm - moyenne;
    const z = ecart / ecartType;
    if (Math.abs(z) <= Z_SEUIL) return;

    const deviationBps = Math.round(ecart * 10000);
    const peerSpreadBps = Math.round(ecartType * 10000);

    anoms.push({
      bond: b,
      reason:
        `${(b.ytm * 100).toFixed(2)}% contre ${(moyenne * 100).toFixed(2)}% ` +
        `pour ${peers.length} pairs ${b.country}/${b.rating} ` +
        `(dispersion ${peerSpreadBps} pb, z = ${z.toFixed(1)})`,
      severity: z > 0 ? "watch_high" : "watch_low",
      deviationBps,
      peersCount: peers.length,
      zScore: z,
      peerSpreadBps,
      priceDate: b.priceDate as string,
    });
  });

  return anoms.sort(
    (a, b) => Math.abs(b.deviationBps) - Math.abs(a.deviationBps),
  );
}

type Severity = "all" | "watch_high" | "watch_low";

export default function BondAnomalies({ bonds, prices, limit = null }: Props) {
  const allAnomalies = useMemo(
    () => detectAnomalies(bonds, prices),
    [bonds, prices]
  );

  /** Reference de fraicheur : la date de cours la plus recente du jeu, et non
   *  la date du jour. Deterministe, donc identique au rendu serveur et client
   *  — comparer a new Date() ferait diverger l'hydratation a minuit. */
  const dateReference = useMemo(() => {
    let max = "";
    for (const p of prices) if (p.date > max) max = p.date;
    return max;
  }, [prices]);

  // KPIs calcules sur le set complet — restent stables quand on filtre.
  const kpis = useMemo(() => {
    const high = allAnomalies.filter((a) => a.severity === "watch_high").length;
    const low = allAnomalies.filter((a) => a.severity === "watch_low").length;
    const countries = new Set(allAnomalies.map((a) => a.bond.country)).size;
    const maxSpread =
      allAnomalies.length === 0
        ? 0
        : Math.max(...allAnomalies.map((a) => Math.abs(a.deviationBps)));
    return { total: allAnomalies.length, high, low, countries, maxSpread };
  }, [allAnomalies]);

  // Listes pour les selects (uniques, triees) — derivees des anomalies
  // detectees plutot que de tous les bonds, sinon on propose des filtres
  // qui n'auraient aucun effet.
  const availableCountries = useMemo(
    () =>
      Array.from(new Set(allAnomalies.map((a) => a.bond.country))).sort(),
    [allAnomalies]
  );
  const availableTypes = useMemo(
    () =>
      Array.from(new Set(allAnomalies.map((a) => a.bond.issuerType))).sort(),
    [allAnomalies]
  );

  const [filterSeverity, setFilterSeverity] = useState<Severity>("all");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const filteredAnomalies = useMemo(() => {
    const filtered = allAnomalies.filter((a) => {
      if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
      if (filterCountry !== "all" && a.bond.country !== filterCountry) return false;
      if (filterType !== "all" && a.bond.issuerType !== filterType) return false;
      return true;
    });
    return limit != null ? filtered.slice(0, limit) : filtered;
  }, [allAnomalies, filterSeverity, filterCountry, filterType, limit]);

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4">
        <AnomalyKpi
          label="Total anomalies"
          value={kpis.total.toString()}
          accent="bg-indigo-500"
        />
        <AnomalyKpi
          label="Décotes 📈"
          value={kpis.high.toString()}
          sub="rendement supérieur"
          accent="bg-blue-500"
        />
        <AnomalyKpi
          label="Surcotes 📉"
          value={kpis.low.toString()}
          sub="rendement inférieur"
          accent="bg-rose-500"
        />
        <AnomalyKpi
          label="Spread max"
          value={kpis.total ? `${kpis.maxSpread} bps` : "—"}
          sub={`${kpis.countries} pays touchés`}
          accent="bg-amber-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3 mb-4 p-3 bg-slate-50 rounded-md">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
            Sévérité
          </label>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as Severity)}
            className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">Toutes ({kpis.total})</option>
            <option value="watch_high">Décotes 📈 ({kpis.high})</option>
            <option value="watch_low">Surcotes 📉 ({kpis.low})</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
            Pays
          </label>
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">Tous pays</option>
            {availableCountries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
            Type
          </label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">Tous types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-3">
        <b className="text-slate-900">{filteredAnomalies.length}</b> résultat
        {filteredAnomalies.length > 1 ? "s" : ""}
        {filteredAnomalies.length !== kpis.total &&
          ` sur ${kpis.total} anomalie${kpis.total > 1 ? "s" : ""}`}
      </div>

      {filteredAnomalies.length === 0 ? (
        <div className="p-6 md:p-8 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-md">
          {kpis.total === 0
            ? "Aucune anomalie détectée. Les YTM de toutes les obligations notées sont cohérents avec leurs pairs (z-score < 1,5σ)."
            : "Aucune anomalie ne correspond à ces filtres."}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAnomalies.map((a, i) => (
            <Link
              key={i}
              href={bondHref(a.bond)}
              className={`block p-3 rounded-md border text-sm hover:shadow-sm transition ${
                a.severity === "watch_high"
                  ? "bg-blue-50 border-blue-200 hover:border-blue-300"
                  : "bg-rose-50 border-rose-200 hover:border-rose-300"
              }`}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {a.bond.name}
                    {a.bond.code && (
                      <span className="ml-2 text-xs text-slate-500 font-normal">
                        ({a.bond.code})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{a.reason}</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Cours du {formatDateCourte(a.priceDate)}
                    {perime(a.priceDate, dateReference) && (
                      <span className="ml-1.5 text-amber-700">
                        · plus de 15 jours, écart peut-être obsolète
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right whitespace-nowrap">
                  {/* L'ecart en points de base est le chiffre qu'on lit ;
                      le z-score n'est qu'un critere de selection. */}
                  <div
                    className={`text-base font-semibold tabular-nums ${
                      a.severity === "watch_high"
                        ? "text-blue-800"
                        : "text-rose-800"
                    }`}
                  >
                    {a.deviationBps > 0 ? "+" : ""}
                    {a.deviationBps} pb
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {a.bond.isin}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function AnomalyKpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="relative bg-white rounded-md border border-slate-200 p-3 overflow-hidden">
      <span
        className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`}
        aria-hidden
      />
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5 ml-1">
        {label}
      </div>
      <div className="text-base md:text-lg font-semibold text-slate-900 tabular-nums ml-1">
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-slate-400 mt-0.5 ml-1">{sub}</div>
      )}
    </div>
  );
}

/** JJ/MM/AA a partir d'une date ISO. */
function formatDateCourte(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : iso;
}

/** Un ecart calcule sur un cours vieux de plus de deux semaines n'est plus
 *  actionnable : sur ce marche le cours est reporte tant qu'aucun echange
 *  n'a lieu, donc l'anomalie peut avoir disparu sans que rien ne le montre. */
function perime(iso: string, reference: string): boolean {
  if (!reference) return false;
  const a = new Date(iso + "T00:00:00Z").getTime();
  const b = new Date(reference + "T00:00:00Z").getTime();
  if (isNaN(a) || isNaN(b)) return false;
  return (b - a) / 86400000 > 15;
}

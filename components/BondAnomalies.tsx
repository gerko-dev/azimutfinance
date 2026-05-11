"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ListedBond, ListedBondPrice } from "@/lib/listedBondsTypes";
import { getBondYTMFromLatest } from "@/lib/listedBondsTypes";

type EnrichedBond = ListedBond & {
  ytm: number;
};

type Anomaly = {
  bond: EnrichedBond;
  reason: string;
  severity: "watch_high" | "watch_low";
  /** Écart absolu en bps par rapport à la moyenne des pairs (positif = décoté). */
  deviationBps: number;
  peersCount: number;
};

type Props = {
  bonds: ListedBond[];
  prices: ListedBondPrice[];
  /** Limite l'affichage. null = illimité. Défaut: null. */
  limit?: number | null;
};

/**
 * Détection statistique : pour chaque obligation rated, compare son YTM aux
 * pairs (même pays + même rating + durée ±1 an, min 3 pairs). Z-score > 1,5σ
 * = anomalie. Pas un signal d'achat / vente — un point d'analyse à creuser.
 */
function detectAnomalies(
  bonds: ListedBond[],
  prices: ListedBondPrice[]
): Anomaly[] {
  const latestByIsin = new Map<string, ListedBondPrice>();
  for (const p of prices) {
    const cur = latestByIsin.get(p.isin);
    if (!cur || p.date > cur.date) latestByIsin.set(p.isin, p);
  }
  const enriched: EnrichedBond[] = bonds.map((b) => ({
    ...b,
    ytm: getBondYTMFromLatest(b, latestByIsin.get(b.isin) ?? null),
  }));

  const anoms: Anomaly[] = [];

  enriched.forEach((b) => {
    if (!b.rating) return;

    const peers = enriched.filter(
      (p) =>
        p.country === b.country &&
        p.rating === b.rating &&
        Math.abs(p.yearsToMaturity - b.yearsToMaturity) < 1 &&
        p.isin !== b.isin &&
        p.ytm > 0
    );

    if (peers.length < 3) return;

    const peerYtms = peers.map((p) => p.ytm);
    const peerAvg = peerYtms.reduce((s, y) => s + y, 0) / peerYtms.length;
    const peerVariance =
      peerYtms.reduce((s, y) => s + Math.pow(y - peerAvg, 2), 0) /
      peerYtms.length;
    const peerStdDev = Math.sqrt(peerVariance);

    const deviation = b.ytm - peerAvg;
    const zScore = peerStdDev > 0 ? deviation / peerStdDev : 0;
    const deviationBps = Math.round(deviation * 10000);

    if (zScore > 1.5) {
      anoms.push({
        bond: b,
        reason: `YTM ${(b.ytm * 100).toFixed(2)}% vs ${(peerAvg * 100).toFixed(
          2
        )}% moyen (${peers.length} pairs ${b.country}/${b.rating}) · +${deviationBps} bps`,
        severity: "watch_high",
        deviationBps,
        peersCount: peers.length,
      });
    } else if (zScore < -1.5) {
      anoms.push({
        bond: b,
        reason: `YTM ${(b.ytm * 100).toFixed(2)}% vs ${(peerAvg * 100).toFixed(
          2
        )}% moyen (${peers.length} pairs ${b.country}/${b.rating}) · ${deviationBps} bps`,
        severity: "watch_low",
        deviationBps,
        peersCount: peers.length,
      });
    }
  });

  return anoms.sort(
    (a, b) => Math.abs(b.deviationBps) - Math.abs(a.deviationBps)
  );
}

type Severity = "all" | "watch_high" | "watch_low";

export default function BondAnomalies({ bonds, prices, limit = null }: Props) {
  const allAnomalies = useMemo(
    () => detectAnomalies(bonds, prices),
    [bonds, prices]
  );

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
              href={`/obligation/${a.bond.isin}`}
              className={`block p-3 rounded-md border text-sm hover:shadow-sm transition ${
                a.severity === "watch_high"
                  ? "bg-blue-50 border-blue-200 hover:border-blue-300"
                  : "bg-rose-50 border-rose-200 hover:border-rose-300"
              }`}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {a.severity === "watch_high" ? "📈" : "📉"} {a.bond.name}
                    {a.bond.code && (
                      <span className="ml-2 text-xs text-slate-500 font-normal">
                        ({a.bond.code})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{a.reason}</div>
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap font-mono">
                  {a.bond.isin}
                </span>
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

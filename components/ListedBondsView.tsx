"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  Line,
  ComposedChart,
} from "recharts";
import type {
  ListedBond,
  ListedBondPrice,
  ListedBondEvent,
  MarketStats,
} from "@/lib/listedBondsTypes";
import { getBondYTM } from "@/lib/listedBondsTypes";

// === HELPERS DE FORMATAGE ===
function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatBigFCFA(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2) + " T FCFA";
  if (value >= 1e9) return (value / 1e9).toFixed(1) + " Mds FCFA";
  if (value >= 1e6) return (value / 1e6).toFixed(0) + " M FCFA";
  return formatFCFA(value) + " FCFA";
}

function formatDate(date: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function countryBadge(country: string): { label: string; bg: string; text: string } {
  const styles: Record<string, { label: string; bg: string; text: string }> = {
    CI: { label: "CI", bg: "bg-orange-50", text: "text-orange-700" },
    SN: { label: "SN", bg: "bg-green-50", text: "text-green-700" },
    BF: { label: "BF", bg: "bg-red-50", text: "text-red-700" },
    ML: { label: "ML", bg: "bg-yellow-50", text: "text-yellow-700" },
    BJ: { label: "BJ", bg: "bg-emerald-50", text: "text-emerald-700" },
    TG: { label: "TG", bg: "bg-amber-50", text: "text-amber-700" },
    NE: { label: "NE", bg: "bg-lime-50", text: "text-lime-700" },
    GW: { label: "GW", bg: "bg-teal-50", text: "text-teal-700" },
    UEMOA: { label: "UEMOA", bg: "bg-blue-50", text: "text-blue-700" },
    CEDEAO: { label: "CEDEAO", bg: "bg-indigo-50", text: "text-indigo-700" },
  };
  return styles[country] || { label: country, bg: "bg-slate-100", text: "text-slate-700" };
}

type Props = {
  bonds: ListedBond[];
  prices: ListedBondPrice[];
  events: ListedBondEvent[];
  stats: MarketStats;
};

type SortKey = "name" | "couponRate" | "maturity" | "ytm" | "outstanding";
type SortOrder = "asc" | "desc";

export default function ListedBondsView({ bonds, prices, events, stats }: Props) {
  // === ETATS DE FILTRAGE (TABLEAU) ===
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterDuration, setFilterDuration] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("maturity");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // === FILTRES SPECIFIQUES A LA COURBE DES TAUX ===
  const [curveFilterCountry, setCurveFilterCountry] = useState<string>("all");
  const [curveFilterType, setCurveFilterType] = useState<string>("all");
  const [curveAverageBasis, setCurveAverageBasis] = useState<string>("all-etat");

  // === OBLIGATIONS ENRICHIES (avec YTM actuariel) ===
  const enrichedBonds = useMemo(() => {
    return bonds.map((bond) => {
      const ytm = getBondYTM(bond, prices);
      return { ...bond, ytm };
    });
  }, [bonds, prices]);

  // === TYPES DISPONIBLES (tires dynamiquement du CSV) ===
  const availableTypes = useMemo(() => {
    const types = new Set(bonds.map((b) => b.issuerType));
    return Array.from(types).sort();
  }, [bonds]);

  // === PAYS DISPONIBLES (pour les filtres courbe) ===
  const availableCountriesForCurve = useMemo(() => {
    const countries = new Set(bonds.map((b) => b.country));
    return Array.from(countries).sort();
  }, [bonds]);

  // === FILTRAGE DU TABLEAU ===
  const filteredBonds = useMemo(() => {
    return enrichedBonds.filter((b) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          b.isin.toLowerCase().includes(q) ||
          b.name.toLowerCase().includes(q) ||
          b.code.toLowerCase().includes(q) ||
          b.issuer.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterType !== "all" && b.issuerType !== filterType) return false;
      if (filterCountry !== "all" && b.country !== filterCountry) return false;
      if (filterDuration !== "all") {
        const y = b.yearsToMaturity;
        if (filterDuration === "0-2" && (y < 0 || y > 2)) return false;
        if (filterDuration === "2-5" && (y <= 2 || y > 5)) return false;
        if (filterDuration === "5-10" && (y <= 5 || y > 10)) return false;
        if (filterDuration === "10+" && y <= 10) return false;
      }
      return true;
    });
  }, [enrichedBonds, search, filterType, filterCountry, filterDuration]);

  // === TRI ===
  const sortedBonds = useMemo(() => {
    const sorted = [...filteredBonds];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "couponRate":
          cmp = a.couponRate - b.couponRate;
          break;
        case "maturity":
          cmp = new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime();
          break;
        case "ytm":
          cmp = a.ytm - b.ytm;
          break;
        case "outstanding":
          cmp = a.outstanding - b.outstanding;
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredBonds, sortKey, sortOrder]);

  // === DONNEES POUR LA COURBE DES TAUX (filtres specifiques) ===
  const yieldCurveData = useMemo(() => {
    return enrichedBonds
      .filter((b) => b.yearsToMaturity > 0 && b.ytm > 0)
      .filter((b) => curveFilterCountry === "all" || b.country === curveFilterCountry)
      .filter((b) => curveFilterType === "all" || b.issuerType === curveFilterType)
      .map((b) => ({
        x: b.yearsToMaturity,
        y: b.ytm * 100,
        name: b.name,
        isin: b.isin,
        type: b.issuerType,
        country: b.country,
      }));
  }, [enrichedBonds, curveFilterCountry, curveFilterType]);

  // === COURBE MOYENNE (base configurable) ===
  const averageCurveInfo = useMemo(() => {
    let basis = enrichedBonds.filter((b) => b.yearsToMaturity > 0 && b.ytm > 0);
    let label = "";

    switch (curveAverageBasis) {
      case "all":
        label = `Marché global (${basis.length} oblig.)`;
        break;
      case "all-etat":
        basis = basis.filter((b) => b.issuerType === "Obligation d'Etat");
        label = `États UEMOA (${basis.length} oblig.)`;
        break;
      case "view":
        basis = basis.filter(
          (b) =>
            (curveFilterCountry === "all" || b.country === curveFilterCountry) &&
            (curveFilterType === "all" || b.issuerType === curveFilterType)
        );
        label = `Sélection en cours (${basis.length} oblig.)`;
        break;
      default:
        if (curveAverageBasis.startsWith("country:")) {
          const c = curveAverageBasis.substring(8);
          basis = basis.filter((b) => b.country === c);
          label = `Pays ${c} (${basis.length} oblig.)`;
        } else if (curveAverageBasis.startsWith("type:")) {
          const t = curveAverageBasis.substring(5);
          basis = basis.filter((b) => b.issuerType === t);
          label = `Type "${t}" (${basis.length} oblig.)`;
        }
    }

    if (basis.length < 3) {
      return { points: [], label: `${label} · trop peu de données` };
    }

    const n = basis.length;
    const sumX = basis.reduce((s, b) => s + b.yearsToMaturity, 0);
    const sumY = basis.reduce((s, b) => s + b.ytm * 100, 0);
    const sumXY = basis.reduce((s, b) => s + b.yearsToMaturity * b.ytm * 100, 0);
    const sumXX = basis.reduce((s, b) => s + b.yearsToMaturity * b.yearsToMaturity, 0);

    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return { points: [], label: `${label} · calcul impossible` };

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const minX = Math.min(...basis.map((b) => b.yearsToMaturity));
    const maxX = Math.max(...basis.map((b) => b.yearsToMaturity));

    return {
      points: [
        { x: minX, y: slope * minX + intercept },
        { x: maxX, y: slope * maxX + intercept },
      ],
      label,
    };
  }, [enrichedBonds, curveAverageBasis, curveFilterCountry, curveFilterType]);

  const averageCurve = averageCurveInfo.points;

  // === PROCHAINS EVENEMENTS ===
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return events
      .filter((e) => new Date(e.date) >= now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 8);
  }, [events]);

  // === DETECTION D'ANOMALIES (rigoureuse : pays + rating + duree) ===
  const anomalies = useMemo(() => {
    const anoms: {
      bond: (typeof enrichedBonds)[0];
      reason: string;
      severity: "watch_high" | "watch_low";
      peersCount: number;
    }[] = [];

    enrichedBonds.forEach((b) => {
      if (!b.rating) return;

      const peers = enrichedBonds.filter(
        (p) =>
          p.country === b.country &&
          p.rating === b.rating &&
          Math.abs(p.yearsToMaturity - b.yearsToMaturity) < 2 &&
          p.isin !== b.isin &&
          p.ytm > 0
      );

      if (peers.length < 3) return;

      const peerYtms = peers.map((p) => p.ytm);
      const peerAvg = peerYtms.reduce((s, y) => s + y, 0) / peerYtms.length;
      const peerVariance =
        peerYtms.reduce((s, y) => s + Math.pow(y - peerAvg, 2), 0) / peerYtms.length;
      const peerStdDev = Math.sqrt(peerVariance);

      const deviation = b.ytm - peerAvg;
      const zScore = peerStdDev > 0 ? deviation / peerStdDev : 0;

      if (zScore > 1.5) {
        anoms.push({
          bond: b,
          reason: `YTM ${(b.ytm * 100).toFixed(2)}% vs ${(peerAvg * 100).toFixed(2)}% moyen (${peers.length} pairs ${b.country}/${b.rating}) · +${Math.round(deviation * 10000)} bps`,
          severity: "watch_high",
          peersCount: peers.length,
        });
      } else if (zScore < -1.5) {
        anoms.push({
          bond: b,
          reason: `YTM ${(b.ytm * 100).toFixed(2)}% vs ${(peerAvg * 100).toFixed(2)}% moyen (${peers.length} pairs ${b.country}/${b.rating}) · ${Math.round(deviation * 10000)} bps`,
          severity: "watch_low",
          peersCount: peers.length,
        });
      }
    });

    return anoms.sort((a, b) => Math.abs(b.bond.ytm) - Math.abs(a.bond.ytm)).slice(0, 5);
  }, [enrichedBonds]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span className="text-slate-300">↕</span>;
    return sortOrder === "asc" ? <span>↑</span> : <span>↓</span>;
  }

  const typeColors: Record<string, string> = {
    "Obligation d'Etat": "#2563eb",
    "Obligation privée": "#16a34a",
    "Obligation régionale": "#9333ea",
    "Sukuk Etat": "#ea580c",
    Autre: "#64748b",
  };

  return (
    <>
      {/* ====== HERO SECTION ====== */}
      <div className="bg-gradient-to-br from-blue-50 via-white to-blue-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-500 mb-2">
            <Link href="/" className="hover:text-slate-900">
              Marchés
            </Link>
            <span className="mx-2">›</span>
            <span>Obligations cotées</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-semibold mb-2">
            Obligations cotées BRVM
          </h1>
          <p className="text-sm md:text-base text-slate-600 max-w-3xl">
            Investissez dans la dette des entreprises et États UEMOA cotés sur la BRVM. Courbe
            de taux actuarielle, screener, veille des écarts et calendrier des coupons.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-6">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Obligations cotées</div>
              <div className="text-2xl md:text-3xl font-semibold text-blue-900">
                {stats.totalBonds}
              </div>
              <div className="text-xs text-slate-400 mt-1">sur la BRVM</div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Encours total</div>
              <div className="text-2xl md:text-3xl font-semibold">
                {formatBigFCFA(stats.totalOutstanding)}
              </div>
              <div className="text-xs text-slate-400 mt-1">tous émetteurs</div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Coupon moyen</div>
              <div className="text-2xl md:text-3xl font-semibold text-green-700">
                {(stats.weightedYield * 100).toFixed(2)}%
              </div>
              <div className="text-xs text-slate-400 mt-1">pondéré par encours</div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Durée moyenne</div>
              <div className="text-2xl md:text-3xl font-semibold">
                {stats.averageDuration.toFixed(1)}
              </div>
              <div className="text-xs text-slate-400 mt-1">années pondérées</div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* ====== COURBE DES TAUX ====== */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <div className="flex justify-between items-start flex-wrap gap-2 mb-3">
            <div>
              <h2 className="text-lg md:text-xl font-semibold">📊 Courbe des taux BRVM</h2>
              <p className="text-xs md:text-sm text-slate-600 mt-1">
                YTM actuariel (convention Act/365). La ligne pointillée est la droite de
                régression calculée sur la base sélectionnée.
              </p>
            </div>
            <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
              EXCLUSIVITÉ AZIMUT
            </span>
          </div>

          {/* Controles de la courbe */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3 mb-4 p-3 bg-slate-50 rounded-md">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
                Afficher les points · Pays
              </label>
              <select
                value={curveFilterCountry}
                onChange={(e) => setCurveFilterCountry(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Tous pays</option>
                {availableCountriesForCurve.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
                Afficher les points · Type
              </label>
              <select
                value={curveFilterType}
                onChange={(e) => setCurveFilterType(e.target.value)}
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

            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
                Calibrer la moyenne sur
              </label>
              <select
                value={curveAverageBasis}
                onChange={(e) => setCurveAverageBasis(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all-etat">États UEMOA (défaut)</option>
                <option value="all">Marché global</option>
                <option value="view">Sélection affichée</option>
                <optgroup label="Par pays">
                  {availableCountriesForCurve.map((c) => (
                    <option key={`country:${c}`} value={`country:${c}`}>
                      Pays {c}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Par type">
                  {availableTypes.map((t) => (
                    <option key={`type:${t}`} value={`type:${t}`}>
                      Type {t}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Compteurs */}
          <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-3">
            <span>
              <b className="text-slate-900">{yieldCurveData.length}</b> obligation
              {yieldCurveData.length > 1 ? "s" : ""} affichée
              {yieldCurveData.length > 1 ? "s" : ""}
            </span>
            <span>·</span>
            <span>
              Moyenne : <b className="text-slate-900">{averageCurveInfo.label}</b>
            </span>
          </div>

          <div className="h-72 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Durée"
                  unit=" ans"
                  stroke="#94a3b8"
                  fontSize={11}
                  domain={["dataMin", "dataMax"]}
                  label={{
                    value: "Durée résiduelle (années)",
                    position: "bottom",
                    offset: 15,
                    style: { fontSize: 12, fill: "#64748b" },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="YTM"
                  unit="%"
                  stroke="#94a3b8"
                  fontSize={11}
                  label={{
                    value: "YTM (%)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12, fill: "#64748b" },
                  }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    if (!d.name) return null;
                    return (
                      <div className="bg-white border border-slate-200 rounded-md shadow-md p-3 text-xs">
                        <div className="font-medium mb-1">{d.name}</div>
                        <div className="text-slate-500">{d.isin}</div>
                        <div className="mt-1 flex gap-3">
                          <span>
                            Durée : <b>{d.x.toFixed(1)} ans</b>
                          </span>
                          <span>
                            YTM : <b>{d.y.toFixed(2)}%</b>
                          </span>
                        </div>
                        <div className="text-slate-400 mt-1">
                          {d.type} · {d.country}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "11px" }} />

                {averageCurve.length >= 2 && (
                  <Line
                    type="linear"
                    dataKey="y"
                    data={averageCurve}
                    stroke="#64748b"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    legendType="plainline"
                    name={`Moyenne · ${averageCurveInfo.label}`}
                    isAnimationActive={false}
                  />
                )}

                {Object.keys(typeColors).map((type) => {
                  const data = yieldCurveData.filter((d) => d.type === type);
                  if (data.length === 0) return null;
                  return (
                    <Scatter key={type} name={type} data={data} fill={typeColors[type]}>
                      {data.map((_, i) => (
                        <Cell key={i} fill={typeColors[type]} />
                      ))}
                    </Scatter>
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ====== A SURVEILLER ====== */}
        {anomalies.length > 0 && (
          <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <div className="flex items-start gap-2 mb-4 flex-wrap">
              <h2 className="text-lg md:text-xl font-semibold">🔎 À surveiller</h2>
              <span className="text-[10px] md:text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                PREMIUM
              </span>
            </div>
            <p className="text-xs md:text-sm text-slate-600 mb-4">
              Obligations dont le YTM s&apos;écarte statistiquement de leurs pairs (même pays,
              même notation, durée similaire). Z-score &gt; 1,5σ. Une analyse approfondie est
              recommandée avant toute décision.
            </p>
            <div className="space-y-2">
              {anomalies.map((a, i) => (
                <div
                  key={i}
                  className={`block p-3 rounded-md border text-sm ${
                    a.severity === "watch_high"
                      ? "bg-blue-50 border-blue-200"
                      : "bg-slate-50 border-slate-200"
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
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <strong>Méthodologie :</strong> pour chaque obligation, calcul de la moyenne et
              de l&apos;écart-type des YTM de ses pairs (même pays × même notation × durée ±2
              ans). Un Z-score &gt; 1,5σ ou &lt; −1,5σ est signalé. Minimum 3 pairs requis.
              Ceci n&apos;est pas un conseil en investissement.
            </div>
          </section>
        )}

        {/* ====== EVENEMENTS ====== */}
        {upcomingEvents.length > 0 && (
          <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-semibold mb-4">📅 Prochains événements</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {upcomingEvents.map((e, i) => {
                const bond = bonds.find((b) => b.isin === e.isin);
                const eventIcons: Record<string, string> = {
                  coupon: "💰",
                  remboursement: "🏁",
                  call: "📞",
                  adjudication: "🔨",
                };
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-slate-50">
                    <div className="text-xl">{eventIcons[e.eventType] || "📌"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {bond?.name || e.isin}
                      </div>
                      <div className="text-xs text-slate-600">{e.description}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {formatDate(e.date)} · {formatFCFA(e.amount)} FCFA
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ====== TABLEAU ====== */}
        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100">
            <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
              <h2 className="text-lg md:text-xl font-semibold">
                Liste des obligations cotées
              </h2>
              <span className="text-xs text-slate-500">
                {sortedBonds.length} résultat{sortedBonds.length > 1 ? "s" : ""} sur{" "}
                {bonds.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="Rechercher (nom, ISIN, code, émetteur...)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
              />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Tous les types</option>
                {availableTypes.map((t) => {
                  const count = bonds.filter((b) => b.issuerType === t).length;
                  return (
                    <option key={t} value={t}>
                      {t} ({count})
                    </option>
                  );
                })}
              </select>
              <select
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Tous les pays</option>
                {Object.keys(stats.byCountry)
                  .sort()
                  .map((c) => (
                    <option key={c} value={c}>
                      {c} ({stats.byCountry[c]})
                    </option>
                  ))}
              </select>
              <select
                value={filterDuration}
                onChange={(e) => setFilterDuration(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Toutes durées</option>
                <option value="0-2">0-2 ans</option>
                <option value="2-5">2-5 ans</option>
                <option value="5-10">5-10 ans</option>
                <option value="10+">Plus de 10 ans</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 md:px-4 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("name")}
                      className="flex items-center gap-1 hover:text-slate-900"
                    >
                      Obligation {sortIcon("name")}
                    </button>
                  </th>
                  <th className="text-left px-3 md:px-4 py-3 font-medium hidden md:table-cell">
                    Émetteur
                  </th>
                  <th className="text-center px-2 py-3 font-medium">Pays</th>
                  <th className="text-right px-3 md:px-4 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("couponRate")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Coupon {sortIcon("couponRate")}
                    </button>
                  </th>
                  <th className="text-right px-3 md:px-4 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("ytm")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      YTM {sortIcon("ytm")}
                    </button>
                  </th>
                  <th className="text-right px-3 md:px-4 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("maturity")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Échéance {sortIcon("maturity")}
                    </button>
                  </th>
                  <th className="text-right px-3 md:px-4 py-3 font-medium hidden md:table-cell">
                    Rating
                  </th>
                  <th className="text-right px-3 md:px-4 py-3 font-medium hidden lg:table-cell">
                    <button
                      onClick={() => toggleSort("outstanding")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Encours {sortIcon("outstanding")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedBonds.map((b) => {
                  const badge = countryBadge(b.country);
                  return (
                    <tr
                      key={b.isin}
                      className="border-b border-slate-100 hover:bg-blue-50/30 transition"
                    >
                      <td className="px-3 md:px-4 py-3">
                        <div className="flex items-center gap-2">
                          {b.greenBond && (
                            <span title="Obligation verte" className="text-green-600">
                              🌱
                            </span>
                          )}
                          <div>
                            <div className="font-medium">
                              {b.name}
                              {b.code && (
                                <span className="ml-2 text-xs text-slate-500 font-normal">
                                  ({b.code})
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-mono">{b.isin}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 md:px-4 py-3 hidden md:table-cell">
                        <div className="text-sm">{b.issuer}</div>
                        <div className="text-xs text-slate-500">
                          {b.issuerType} · {b.sector}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <span
                          className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${badge.bg} ${badge.text}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 md:px-4 py-3 text-right">
                        {(b.couponRate * 100).toFixed(2)}%
                      </td>
                      <td className="px-3 md:px-4 py-3 text-right font-medium">
                        <span
                          className={
                            b.ytm > b.couponRate
                              ? "text-green-700"
                              : b.ytm < b.couponRate
                              ? "text-red-700"
                              : ""
                          }
                        >
                          {(b.ytm * 100).toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-3 md:px-4 py-3 text-right">
                        <div className="text-sm">{formatDate(b.maturityDate)}</div>
                        <div className="text-xs text-slate-500">
                          {b.yearsToMaturity.toFixed(1)} ans
                        </div>
                      </td>
                      <td className="px-3 md:px-4 py-3 text-right hidden md:table-cell">
                        {b.rating ? (
                          <span className="text-xs px-2 py-0.5 bg-slate-100 rounded">
                            {b.rating}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 md:px-4 py-3 text-right hidden lg:table-cell text-xs text-slate-600">
                        {formatBigFCFA(b.outstanding)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {sortedBonds.length === 0 && (
              <div className="p-10 text-center text-slate-500">
                Aucune obligation ne correspond à vos critères
              </div>
            )}
          </div>
        </section>

        {/* ====== PEDAGOGIE ====== */}
        <section className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100 p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-3">
            🎓 Comprendre les obligations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="font-medium mb-1">Qu&apos;est-ce qu&apos;une obligation ?</div>
              <p className="text-slate-600 text-xs md:text-sm">
                Un titre de créance : vous prêtez à un État ou entreprise qui vous paie un
                intérêt (coupon) périodique et vous rembourse à l&apos;échéance.
              </p>
            </div>
            <div>
              <div className="font-medium mb-1">Coupon vs YTM ?</div>
              <p className="text-slate-600 text-xs md:text-sm">
                Le coupon est fixe (% sur le nominal). Le YTM est le rendement actuariel
                effectif qui tient compte du prix d&apos;achat et du timing des flux.
              </p>
            </div>
            <div>
              <div className="font-medium mb-1">Risques ?</div>
              <p className="text-slate-600 text-xs md:text-sm">
                Défaut de l&apos;émetteur, remontée des taux (baisse du prix), inflation
                (érode le rendement réel).
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
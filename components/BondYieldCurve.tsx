"use client";

import { useMemo, useState, memo } from "react";
import {
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
  Line,
  ScatterChart,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import type { ListedBond, ListedBondPrice } from "@/lib/listedBondsTypes";
import { getBondYTMFromLatest } from "@/lib/listedBondsTypes";

// Plafond YTM pour exclure les points aberrants (calculs faussés par cours
// décotés extrêmes ou maturités résiduelles très courtes). 15 % couvre
// largement les signatures les plus risquées de la zone UEMOA.
const YTM_MAX = 0.15;

const TYPE_COLORS: Record<string, string> = {
  "Obligation d'Etat": "#2563eb",
  "Obligation privée": "#16a34a",
  "Obligation régionale": "#9333ea",
  "Sukuk Etat": "#ea580c",
  Autre: "#64748b",
};

type EnrichedForCurve = {
  ytm: number;
  yearsToMaturity: number;
  country: string;
  issuerType: string;
  name: string;
  isin: string;
  code: string;
};

function enrichForCurve(
  bonds: ListedBond[],
  prices: ListedBondPrice[]
): EnrichedForCurve[] {
  const latestByIsin = new Map<string, ListedBondPrice>();
  for (const p of prices) {
    const cur = latestByIsin.get(p.isin);
    if (!cur || p.date > cur.date) latestByIsin.set(p.isin, p);
  }
  return bonds.map((b) => ({
    ytm: getBondYTMFromLatest(b, latestByIsin.get(b.isin) ?? null),
    yearsToMaturity: b.yearsToMaturity,
    country: b.country,
    issuerType: b.issuerType,
    name: b.name,
    isin: b.isin,
    code: b.code ?? "",
  }));
}

type Props = {
  bonds: ListedBond[];
  prices: ListedBondPrice[];
  /** Affiche le badge "EXCLUSIVITÉ AZIMUT". Défaut: true. */
  showBadge?: boolean;
};

export default memo(function BondYieldCurve({
  bonds,
  prices,
  showBadge = true,
}: Props) {
  const enrichedBonds = useMemo(() => enrichForCurve(bonds, prices), [bonds, prices]);

  const availableTypes = useMemo(() => {
    return Array.from(new Set(bonds.map((b) => b.issuerType))).sort();
  }, [bonds]);

  const availableCountriesForCurve = useMemo(() => {
    const countries = new Set(enrichedBonds.map((b) => b.country));
    return Array.from(countries).sort();
  }, [enrichedBonds]);

  const [curveFilterCountry, setCurveFilterCountry] = useState<string>("all");
  const [curveFilterType, setCurveFilterType] = useState<string>("all");
  const [curveAverageBasis, setCurveAverageBasis] = useState<string>("all-etat");

  const yieldCurveData = useMemo(() => {
    return enrichedBonds
      .filter((b) => b.yearsToMaturity > 0 && b.ytm > 0 && b.ytm <= YTM_MAX)
      .filter((b) => curveFilterCountry === "all" || b.country === curveFilterCountry)
      .filter((b) => curveFilterType === "all" || b.issuerType === curveFilterType)
      .map((b) => ({
        x: b.yearsToMaturity,
        y: b.ytm * 100,
        name: b.name,
        isin: b.isin,
        code: b.code,
        type: b.issuerType,
        country: b.country,
      }));
  }, [enrichedBonds, curveFilterCountry, curveFilterType]);

  const averageCurveInfo = useMemo(() => {
    let basis = enrichedBonds.filter(
      (b) => b.yearsToMaturity > 0 && b.ytm > 0 && b.ytm <= YTM_MAX
    );
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
      return {
        points: [] as { x: number; y: number }[],
        label: `${label} · trop peu de données`,
      };
    }

    const n = basis.length;
    const sumX = basis.reduce((s, b) => s + b.yearsToMaturity, 0);
    const sumY = basis.reduce((s, b) => s + b.ytm * 100, 0);
    const sumXY = basis.reduce(
      (s, b) => s + b.yearsToMaturity * b.ytm * 100,
      0
    );
    const sumXX = basis.reduce(
      (s, b) => s + b.yearsToMaturity * b.yearsToMaturity,
      0
    );

    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) {
      return {
        points: [] as { x: number; y: number }[],
        label: `${label} · calcul impossible`,
      };
    }

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

  // KPIs derives de la selection courante (yieldCurveData), pas du dataset
  // brut : ils suivent les filtres pays/type comme le chart.
  const kpis = useMemo(() => {
    const ys = yieldCurveData
      .map((d) => d.y)
      .slice()
      .sort((a, b) => a - b);
    const median =
      ys.length === 0
        ? 0
        : ys.length % 2 === 1
        ? ys[(ys.length - 1) / 2]
        : (ys[ys.length / 2 - 1] + ys[ys.length / 2]) / 2;
    const min = ys.length ? ys[0] : 0;
    const max = ys.length ? ys[ys.length - 1] : 0;
    return { count: yieldCurveData.length, median, min, max };
  }, [yieldCurveData]);

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="flex justify-between items-start flex-wrap gap-2 mb-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold">📊 Courbe des taux BRVM</h2>
          <p className="text-xs md:text-sm text-slate-600 mt-1">
            YTM actuariel par maturité résiduelle. La ligne pointillée est la droite de
            régression calculée sur la base sélectionnée.
          </p>
        </div>
        {showBadge && (
          <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
            EXCLUSIVITÉ AZIMUT
          </span>
        )}
      </div>

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
              {availableCountriesForCurve.map((c) => {
                // CEDEAO et UEMOA sont des emetteurs regionaux (BIDC, BOAD,
                // CRRH-UEMOA…), pas des pays — on retire le prefixe "Pays".
                const isRegional = c === "CEDEAO" || c === "UEMOA";
                return (
                  <option key={`country:${c}`} value={`country:${c}`}>
                    {isRegional ? c : `Pays ${c}`}
                  </option>
                );
              })}
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3 mb-4">
        <CurveKpi
          label="Obligations affichées"
          value={kpis.count.toString()}
          accent="bg-violet-500"
        />
        <CurveKpi
          label="YTM médian"
          value={kpis.count ? `${kpis.median.toFixed(2)}%` : "—"}
          accent="bg-blue-500"
        />
        <CurveKpi
          label="YTM min – max"
          value={
            kpis.count
              ? `${kpis.min.toFixed(2)}% – ${kpis.max.toFixed(2)}%`
              : "—"
          }
          accent="bg-emerald-500"
        />
      </div>
      <div className="text-xs text-slate-500 mb-3">
        Moyenne : <b className="text-slate-900">{averageCurveInfo.label}</b>
      </div>

      <div className="h-72 md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              dataKey="x"
              name="Durée"
              unit=" ans"
              stroke="#94a3b8"
              fontSize={11}
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => Number(value).toFixed(1)}
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
              domain={["auto", "auto"]}
              label={{
                value: "YTM (%)",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "#64748b" },
              }}
            />
            <Tooltip
              cursor={false}
              trigger="hover"
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                // Recharts inclut parfois la Line de régression dans le payload
                // (sans `name`/`isin`) — on cible explicitement le point Scatter.
                const scatterEntry = payload.find(
                  (p) => p.payload && p.payload.isin
                );
                if (!scatterEntry) return null;
                const d = scatterEntry.payload;
                return (
                  <div className="bg-white border border-slate-200 rounded-md shadow-md p-3 text-xs">
                    <div className="font-medium mb-1">{d.name || d.code}</div>
                    <div className="text-slate-500">{d.code}</div>
                    <div className="mt-1 flex gap-3">
                      <span>
                        Durée : <b>{Number(d.x).toFixed(1)} ans</b>
                      </span>
                      <span>
                        YTM : <b>{Number(d.y).toFixed(2)}%</b>
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

            {Object.keys(TYPE_COLORS).map((type) => {
              const data = yieldCurveData.filter((d) => d.type === type);
              if (data.length === 0) return null;
              return (
                <Scatter key={type} name={type} data={data} fill={TYPE_COLORS[type]}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={TYPE_COLORS[type]} />
                  ))}
                </Scatter>
              );
            })}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
});

// Mini-carte KPI pour la bande de stats au-dessus du chart. Barre latérale
// colorée + valeur tabular-nums pour rester aligné avec le style du hero.
function CurveKpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
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
    </div>
  );
}

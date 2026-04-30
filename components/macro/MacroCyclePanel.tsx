"use client";

import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { COUNTRY_BY_CODE, type MacroCountryCode } from "@/lib/macroTypes";
import { COUNTRY_COLORS } from "./macroColors";
import {
  PHASE_META,
  type CyclePeerPoint,
  type CycleSnapshot,
} from "@/lib/macroCycleTypes";

const TONE_BADGE: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  alert: "bg-rose-50 text-rose-700 border-rose-200",
  expansive: "bg-blue-50 text-blue-700 border-blue-200",
  restrictive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  indispo: "bg-slate-50 text-slate-400 border-slate-200",
};

function fmtPct(v: number, decimals = 1): string {
  if (!isFinite(v)) return "—";
  return `${v.toFixed(decimals).replace(".", ",")} %`;
}

export default function MacroCyclePanel({
  snapshot,
  peers,
  selected,
}: {
  snapshot: CycleSnapshot;
  peers: CyclePeerPoint[];
  selected: MacroCountryCode;
}) {
  const meta = PHASE_META[snapshot.phase];
  const confidencePct = Math.round(snapshot.confidence * 100);

  // Donnees pour le scatter : x = croissance, y = inflation
  const scatterData = peers.map((p) => ({
    x: p.growth,
    y: p.inflation,
    code: p.countryCode,
    name: COUNTRY_BY_CODE[p.countryCode]?.shortName ?? p.countryCode,
    period: p.period,
    isSelected: p.countryCode === selected,
  }));

  const tickPctFormatter = (v: number) => `${v.toFixed(0)} %`;

  return (
    <section id="cycle" className="scroll-mt-24">
      <div className="mb-3">
        <h2 className="text-base md:text-lg font-semibold">Déducteur de cycle économique</h2>
        <p className="text-[11px] md:text-xs text-slate-500 mt-0.5">
          Synthèse type Article IV : positionnement (croissance vs tendance, inflation vs cible),
          orientation budgétaire, position externe, dynamique du crédit, conditions monétaires.
        </p>
      </div>

      {/* === VERDICT BANNER === */}
      <div
        className={`rounded-lg border ${meta.border} ${meta.bg} p-4 md:p-5 mb-4`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Phase actuelle
              </span>
              {snapshot.period && (
                <span className="text-[10px] text-slate-500">· {snapshot.period}</span>
              )}
            </div>
            <div className={`text-2xl md:text-3xl font-semibold ${meta.color}`}>
              {meta.label}
            </div>
            <p className="text-xs md:text-sm text-slate-700 mt-1.5">{meta.description}</p>
            <p className="text-[11px] md:text-xs text-slate-600 mt-2 italic">
              {snapshot.reading}
            </p>
          </div>
          {snapshot.phase !== "indetermine" && (
            <div className="text-right shrink-0">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                Confiance
              </div>
              <div className={`text-xl font-semibold tabular-nums ${meta.color}`}>
                {confidencePct} %
              </div>
              <div className="text-[10px] text-slate-500">
                indicateurs convergents
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === GRID : QUADRANT (8 cols) + QUALIFIERS (4 cols) === */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* QUADRANT */}
        <div className="lg:col-span-8 bg-white rounded-lg border border-slate-200 p-3 md:p-4">
          <div className="mb-2">
            <h3 className="text-sm font-semibold">Quadrant croissance × inflation</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Position du pays parmi les 8 États UEMOA. Lignes de référence :
              croissance moyenne UEMOA et critère d&apos;inflation ≤ 3 %.
            </p>
          </div>

          <div style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 16, right: 24, bottom: 36, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Croissance"
                  unit=" %"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={tickPctFormatter}
                  domain={["auto", "auto"]}
                  label={{
                    value: "Croissance PIB réel (%)",
                    position: "insideBottom",
                    offset: -16,
                    fontSize: 11,
                    fill: "#475569",
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Inflation"
                  unit=" %"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={tickPctFormatter}
                  domain={["auto", "auto"]}
                  label={{
                    value: "Inflation (%)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 8,
                    fontSize: 11,
                    fill: "#475569",
                  }}
                />
                <ZAxis range={[80, 80]} />
                <ReferenceLine
                  y={3}
                  stroke="#f59e0b"
                  strokeDasharray="3 3"
                  label={{ value: "Cible inflation 3 %", fontSize: 10, fill: "#b45309", position: "right" }}
                />
                {snapshot.growthTrend !== null && (
                  <ReferenceLine
                    x={snapshot.growthTrend}
                    stroke="#0d9488"
                    strokeDasharray="3 3"
                    label={{
                      value: `Tendance ${snapshot.growthTrend.toFixed(1).replace(".", ",")} %`,
                      fontSize: 10,
                      fill: "#0f766e",
                      position: "top",
                    }}
                  />
                )}
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  cursor={{ strokeDasharray: "3 3" }}
                  formatter={(value, name) => {
                    if (typeof value === "number") {
                      return [fmtPct(value, 1), String(name)];
                    }
                    return [String(value), String(name)];
                  }}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as { name?: string; period?: string } | undefined;
                    return p ? `${p.name} — ${p.period}` : "";
                  }}
                />
                <Scatter data={scatterData}>
                  {scatterData.map((p, i) => (
                    <Cell
                      key={i}
                      fill={p.isSelected ? COUNTRY_COLORS[p.code] ?? "#0f172a" : "#cbd5e1"}
                      stroke={p.isSelected ? "#0f172a" : "#94a3b8"}
                      strokeWidth={p.isSelected ? 2 : 1}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Légende custom */}
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-600">
            <span className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full border-2"
                style={{
                  backgroundColor: COUNTRY_COLORS[selected] ?? "#0f172a",
                  borderColor: "#0f172a",
                }}
              />
              {COUNTRY_BY_CODE[selected]?.shortName ?? selected}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-slate-300 border border-slate-400" />
              Autres pays UEMOA
            </span>
          </div>

          {/* Quadrant guide */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-500">
            <div className="flex items-start gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 mt-0.5 shrink-0" />
              <span>
                <strong className="text-amber-700">Surchauffe</strong> (haut/droite) : croissance et
                inflation élevées
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400 mt-0.5 shrink-0" />
              <span>
                <strong className="text-rose-700">Stagflation</strong> (haut/gauche) : faible
                croissance, inflation forte
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mt-0.5 shrink-0" />
              <span>
                <strong className="text-emerald-700">Expansion</strong> (bas/droite) : croissance
                soutenue, inflation contenue
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400 mt-0.5 shrink-0" />
              <span>
                <strong className="text-blue-700">Faiblesse / reprise</strong> (bas/gauche) :
                croissance et inflation faibles
              </span>
            </div>
          </div>
        </div>

        {/* QUALIFIERS */}
        <div className="lg:col-span-4 space-y-2">
          <div className="text-xs font-medium text-slate-700 mb-1">
            Indicateurs cycliques contextuels
          </div>
          {snapshot.qualifiers.map((q) => (
            <div
              key={q.key}
              className="bg-white border border-slate-200 rounded-lg p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] text-slate-500">{q.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    TONE_BADGE[q.tone] ?? TONE_BADGE.neutral
                  }`}
                >
                  {q.tone === "expansive"
                    ? "Expansif"
                    : q.tone === "restrictive"
                      ? "Restrictif"
                      : q.tone === "indispo"
                        ? "—"
                        : "Neutre"}
                </span>
              </div>
              <div className="text-base font-semibold tabular-nums text-slate-900">
                {q.value}
              </div>
              <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                {q.caption}
              </div>
            </div>
          ))}
          {snapshot.qualifiers.length === 0 && (
            <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded p-3">
              Aucun indicateur contextuel disponible.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

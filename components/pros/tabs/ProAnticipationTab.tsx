"use client";

import { useState } from "react";
import type { PriceTarget, PriceTargetMethod } from "@/lib/priceTarget";

type Props = {
  ticker: string;
  target: PriceTarget | null;
};

function formatFCFA(v: number): string {
  return Math.round(v).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatPct(decimal: number): string {
  const pct = decimal * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1).replace(".", ",")}%`;
}

function pctColor(decimal: number | null): string {
  if (decimal === null) return "text-slate-500";
  if (decimal > 0.05) return "text-emerald-400";
  if (decimal < -0.05) return "text-red-400";
  return "text-slate-300";
}

export default function ProAnticipationTab({ ticker, target }: Props) {
  const [expandedMethod, setExpandedMethod] = useState<string | null>(null);

  if (!target) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-10 text-center text-slate-400">
          <h3 className="text-base font-medium text-slate-200 mb-2">
            Anticipation de cours indisponible
          </h3>
          <p className="text-sm">
            Les données fondamentales et historiques de {ticker} ne permettent
            pas d&apos;estimer un cours cible fiable.
          </p>
        </div>
      </div>
    );
  }

  const {
    currentPrice,
    centralValue,
    lower,
    upper,
    stdDev,
    upsidePct,
    methods,
  } = target;

  const validMethods = methods.filter((m) => m.value !== null && m.value > 0);
  const unavailableMethods = methods.filter((m) => m.value === null);
  const wSum = validMethods.reduce((s, m) => s + m.weight, 0);

  // Echelle commune pour le graphique horizontal
  const allValues = [
    currentPrice,
    lower,
    upper,
    ...validMethods.map((m) => m.value as number),
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal;
  const pad = range * 0.1 || maxVal * 0.05;
  const scaleMin = Math.max(0, minVal - pad);
  const scaleMax = maxVal + pad;
  const scaleRange = scaleMax - scaleMin;
  const pos = (v: number) => ((v - scaleMin) / scaleRange) * 100;

  return (
    <div className="space-y-4">
      {/* === BANDEAU PRINCIPAL : Cours actuel | Cible | Intervalle | Upside === */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
          <div>
            <h3 className="text-base font-medium text-slate-100">
              Cours cible 12 mois
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Moyenne pondérée de {validMethods.length} méthode
              {validMethods.length > 1 ? "s" : ""} sur 8 · intervalle ±1σ
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Cours actuel" value={`${formatFCFA(currentPrice)} FCFA`} />
          <Stat
            label="Cible centrale"
            value={`${formatFCFA(centralValue)} FCFA`}
            accent="text-blue-300"
          />
          <Stat
            label="Intervalle ±1σ"
            value={`${formatFCFA(lower)} – ${formatFCFA(upper)}`}
            sub={`σ = ${formatFCFA(stdDev)} FCFA`}
          />
          <Stat
            label="Upside potentiel"
            value={upsidePct !== null ? formatPct(upsidePct) : "—"}
            accent={
              upsidePct === null
                ? "text-slate-300"
                : upsidePct > 0
                ? "text-emerald-400"
                : upsidePct < 0
                ? "text-red-400"
                : "text-slate-300"
            }
            sub="vs cours actuel"
          />
        </div>
      </section>

      {/* === GRAPHIQUE HORIZONTAL : positions des 8 cibles === */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <h4 className="text-sm font-medium text-slate-100 mb-4">
          Dispersion des cibles vs cours actuel
        </h4>
        <div className="relative h-[280px] md:h-[320px]">
          {/* Axe horizontal */}
          <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-700" />

          {/* Zone intervalle ±σ */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-12 bg-blue-500/15 border-x border-blue-500/40"
            style={{
              left: `${pos(lower)}%`,
              width: `${pos(upper) - pos(lower)}%`,
            }}
          />

          {/* Ligne cible centrale */}
          <div
            className="absolute top-[20%] bottom-[20%] w-0.5 bg-blue-400"
            style={{ left: `${pos(centralValue)}%` }}
          >
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-blue-300 font-semibold whitespace-nowrap">
              Cible {formatFCFA(centralValue)}
            </div>
          </div>

          {/* Ligne cours actuel */}
          <div
            className="absolute top-[10%] bottom-[10%] w-0.5 bg-slate-100"
            style={{ left: `${pos(currentPrice)}%` }}
          >
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-200 font-semibold whitespace-nowrap">
              Spot {formatFCFA(currentPrice)}
            </div>
          </div>

          {/* Points des 8 methodes */}
          {validMethods.map((m, idx) => {
            const y = 50 + (idx % 2 === 0 ? -1 : 1) * (15 + (idx % 4) * 4);
            return (
              <div
                key={m.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                style={{
                  left: `${pos(m.value as number)}%`,
                  top: `${y}%`,
                }}
                onMouseEnter={() => setExpandedMethod(m.id)}
                onMouseLeave={() => setExpandedMethod(null)}
              >
                <div className="w-3 h-3 rounded-full bg-slate-400 border-2 border-slate-900 shadow group-hover:bg-blue-400 transition" />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 whitespace-nowrap pointer-events-none">
                  {m.label.split(" ")[0]}
                </div>
              </div>
            );
          })}

          {/* Echelle */}
          <div className="absolute -bottom-8 left-0 text-[10px] text-slate-400">
            {formatFCFA(scaleMin)}
          </div>
          <div className="absolute -bottom-8 right-0 text-[10px] text-slate-400">
            {formatFCFA(scaleMax)}
          </div>
        </div>
      </section>

      {/* === DETAIL DES METHODES === */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <h4 className="text-sm font-medium text-slate-100 mb-3">
          Détail des 8 méthodes de valorisation
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 border-b border-slate-700">
                <th className="text-left py-2 px-2 font-medium">Méthode</th>
                <th className="text-right py-2 px-2 font-medium">Cible</th>
                <th className="text-right py-2 px-2 font-medium">Δ vs spot</th>
                <th className="text-right py-2 px-2 font-medium">Poids</th>
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => (
                <MethodRow
                  key={m.id}
                  method={m}
                  currentPrice={currentPrice}
                  weightNormalized={
                    m.value !== null && m.value > 0 && wSum > 0
                      ? m.weight / wSum
                      : null
                  }
                  expanded={expandedMethod === m.id}
                  onToggle={() =>
                    setExpandedMethod(expandedMethod === m.id ? null : m.id)
                  }
                />
              ))}
            </tbody>
          </table>
        </div>

        {unavailableMethods.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-500">
            <strong className="text-slate-400">
              {unavailableMethods.length} méthode
              {unavailableMethods.length > 1 ? "s" : ""} indisponible
              {unavailableMethods.length > 1 ? "s" : ""}
            </strong>{" "}
            · les poids des méthodes restantes sont re-normalisés.
          </div>
        )}
      </section>

      {/* === METHODOLOGIE === */}
      <section className="bg-slate-900/40 border border-slate-700 rounded-lg p-4 text-xs text-slate-400 space-y-2">
        <h4 className="text-sm font-medium text-slate-100">Méthodologie</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong className="text-slate-300">Projection partielle</strong> : RN
            partiel publié pour l&apos;année en cours (priorité 9M &gt; S1 &gt;
            T1) / taux d&apos;avancement historique → BPA projeté × payout moyen
            → DPA projeté / yield moyen. Si aucun partiel publié pour l&apos;année
            en cours → méthode non applicable.
          </li>
          <li>
            <strong className="text-slate-300">Rendement historique</strong> :
            DPA du dernier exercice publié / yield moyen 5 ans. Si pas de DPA
            déclaré sur ce dernier exercice → méthode non applicable.
          </li>
          <li>
            <strong className="text-slate-300">PER moyen × BPA</strong>,{" "}
            <strong className="text-slate-300">P/B moyen × BV</strong>,
            <strong className="text-slate-300"> P/S moyen × CA/action</strong> :
            multiples historiques 5 ans appliqués aux agrégats du dernier
            exercice.
          </li>
          <li>
            <strong className="text-slate-300">Comparables sectoriels</strong> :
            PER médian des autres titres du même secteur × BPA du titre.
          </li>
          <li>
            <strong className="text-slate-300">Gordon-Shapiro (DDM)</strong> :
            DPA dernier × (1+g) / (k−g), avec g = croissance géométrique du DPA
            (cappé ±20%), k = yield historique + 2,5%. Si pas de DPA sur dernier
            exercice → méthode non applicable.
          </li>
          <li>
            <strong className="text-slate-300">
              Réversion à la moyenne (SMA 200)
            </strong>{" "}
            : moyenne mobile 200 séances comme niveau d&apos;équilibre.
          </li>
        </ul>
        <p className="pt-2 border-t border-slate-700">
          Cette analyse est une{" "}
          <strong className="text-slate-300">aide à la décision</strong>, pas une
          recommandation. Les hypothèses (croissance, prime de risque, multiples
          historiques) peuvent ne plus refléter le contexte de marché actuel.
        </p>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-md p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={`text-lg font-semibold mt-1 font-mono ${
          accent ?? "text-white"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function MethodRow({
  method,
  currentPrice,
  weightNormalized,
  expanded,
  onToggle,
}: {
  method: PriceTargetMethod;
  currentPrice: number;
  weightNormalized: number | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const available = method.value !== null && method.value > 0;
  const delta =
    available && currentPrice > 0
      ? ((method.value as number) - currentPrice) / currentPrice
      : null;

  return (
    <>
      <tr
        className={`border-b border-slate-800 ${
          available ? "hover:bg-slate-800/50 cursor-pointer" : "opacity-50"
        }`}
        onClick={available ? onToggle : undefined}
      >
        <td className="py-2 px-2">
          <div className="text-sm font-medium text-slate-200">
            {method.label}
          </div>
          {!available && method.reasonUnavailable && (
            <div className="text-[11px] text-slate-500 italic">
              {method.reasonUnavailable}
            </div>
          )}
        </td>
        <td className="py-2 px-2 text-right font-medium font-mono text-slate-200">
          {available ? `${formatFCFA(method.value as number)} FCFA` : "—"}
        </td>
        <td className={`py-2 px-2 text-right text-sm font-mono ${pctColor(delta)}`}>
          {delta !== null ? formatPct(delta) : "—"}
        </td>
        <td className="py-2 px-2 text-right text-sm font-mono text-slate-400">
          {weightNormalized !== null
            ? `${(weightNormalized * 100).toFixed(0)}%`
            : "—"}
        </td>
      </tr>
      {expanded && available && method.hypotheses.length > 0 && (
        <tr className="border-b border-slate-800 bg-slate-900/60">
          <td colSpan={4} className="py-2 px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {method.hypotheses.map((h) => (
                <div key={h.label}>
                  <div className="text-slate-500 text-[10px] uppercase tracking-wide">
                    {h.label}
                  </div>
                  <div className="font-medium text-slate-200">{h.value}</div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

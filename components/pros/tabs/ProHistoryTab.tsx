"use client";

import { useMemo, useState } from "react";

type PriceVolumePoint = { date: string; value: number; volume: number | null };
type OhlcChartPoint = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type Props = {
  ticker: string;
  history: PriceVolumePoint[];
  ohlcHistory: OhlcChartPoint[];
};

function fmtNumber(v: number): string {
  return Math.round(v).toLocaleString("fr-FR").replace(/,/g, " ");
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

/** Date ISO (YYYY-MM-DD) du point le plus recent. */
function latestDate(history: PriceVolumePoint[]): string | null {
  if (history.length === 0) return null;
  return history[history.length - 1].date;
}

/** Soustrait N jours d'une date ISO. */
function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ProHistoryTab({
  ticker,
  history,
  ohlcHistory,
}: Props) {
  // Index OHLC par date ISO pour merger avec history (priceHistoryWithVolume
  // n'a que close + volume ; OHLC apporte open/high/low quand dispo)
  const ohlcByDate = useMemo(() => {
    const m = new Map<string, OhlcChartPoint>();
    for (const p of ohlcHistory) {
      const iso = new Date(p.timestamp).toISOString().slice(0, 10);
      m.set(iso, p);
    }
    return m;
  }, [ohlcHistory]);

  const last = latestDate(history);
  // Outil pro : on défaut aux 90 derniers jours (pas 30).
  const defaultFrom = last ? shiftDays(last, -90) : "";
  const defaultTo = last ?? "";

  // Bornes calendrier
  const firstDate = history[0]?.date ?? "";
  const lastDate = last ?? "";

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const filtered = useMemo(() => {
    if (!from || !to) return [];
    return history
      .filter((p) => p.date >= from && p.date <= to)
      .sort((a, b) => b.date.localeCompare(a.date)); // plus recent en haut
  }, [history, from, to]);

  // KPIs sur la plage sélectionnée (amélioration pro).
  const kpis = useMemo(() => {
    if (filtered.length === 0) return null;
    // filtered est trié DESC (plus recent en tete)
    const lastClose = filtered[0].value;
    const firstClose = filtered[filtered.length - 1].value;
    const variation =
      firstClose !== 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const p of filtered) {
      if (p.value > high) high = p.value;
      if (p.value < low) low = p.value;
      if (p.volume !== null) volume += p.volume;
    }
    return {
      count: filtered.length,
      variation,
      high,
      low,
      volume,
    };
  }, [filtered]);

  function handleDownload() {
    if (filtered.length === 0) return;

    // CSV avec separateur ; (convention site)
    // Colonnes : Date;Cours;Volume;Ouverture;Plus_Haut;Plus_Bas
    const header = "Date;Cours;Volume;Ouverture;Plus_Haut;Plus_Bas";
    const lines = filtered
      .slice() // tri ASC pour le CSV (plus lisible chronologique)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => {
        const ohlc = ohlcByDate.get(p.date);
        const cells = [
          p.date,
          String(p.value),
          p.volume !== null ? String(p.volume) : "",
          ohlc ? String(ohlc.open) : "",
          ohlc ? String(ohlc.high) : "",
          ohlc ? String(ohlc.low) : "",
        ];
        return cells.join(";");
      });

    // BOM UTF-8 pour qu'Excel reconnaisse les accents
    const csv = "﻿" + header + "\n" + lines.join("\n") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ticker}_historique_${from}_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-4">
      {/* === HEADER === */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-medium text-white">
              Historique des cours
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Sélectionnez une plage de dates puis téléchargez le fichier CSV.
            </p>
          </div>
          <span className="text-[10px] md:text-xs text-slate-500">
            {firstDate && lastDate
              ? `Période disponible : ${fmtDate(firstDate)} → ${fmtDate(lastDate)}`
              : null}
          </span>
        </div>
      </section>

      {/* === CONTRÔLES === */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="pro-hist-from"
              className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1"
            >
              Du
            </label>
            <input
              id="pro-hist-from"
              type="date"
              value={from}
              min={firstDate || undefined}
              max={to || lastDate || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="text-sm px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-slate-200 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="pro-hist-to"
              className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1"
            >
              Au
            </label>
            <input
              id="pro-hist-to"
              type="date"
              value={to}
              min={from || firstDate || undefined}
              max={lastDate || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="text-sm px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-slate-200 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Télécharger CSV ({filtered.length} séances)
          </button>
        </div>
      </section>

      {/* === KPIs === */}
      {kpis && (
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-slate-900/50 border border-slate-700 rounded-md p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Séances
            </div>
            <div className="text-base font-mono font-semibold text-white mt-1">
              {kpis.count}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-700 rounded-md p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Variation période
            </div>
            <div
              className={`text-base font-mono font-semibold mt-1 ${
                kpis.variation >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {kpis.variation >= 0 ? "+" : ""}
              {kpis.variation.toFixed(2)} %
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-700 rounded-md p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Plus haut
            </div>
            <div className="text-base font-mono font-semibold text-white mt-1">
              {fmtNumber(kpis.high)}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-700 rounded-md p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Plus bas
            </div>
            <div className="text-base font-mono font-semibold text-white mt-1">
              {fmtNumber(kpis.low)}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-700 rounded-md p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Volume cumulé
            </div>
            <div className="text-base font-mono font-semibold text-white mt-1">
              {fmtNumber(kpis.volume)}
            </div>
          </div>
        </section>
      )}

      {/* === TABLE === */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[560px] pro-scrollbar">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
              <tr className="border-b border-slate-700">
                <th className="text-left text-[11px] uppercase tracking-wide text-slate-400 px-3 py-2 font-medium">
                  Date
                </th>
                <th className="text-right text-[11px] uppercase tracking-wide text-slate-400 px-3 py-2 font-medium">
                  Cours
                </th>
                <th className="text-right text-[11px] uppercase tracking-wide text-slate-400 px-3 py-2 font-medium">
                  Volume
                </th>
                <th className="text-right text-[11px] uppercase tracking-wide text-slate-400 px-3 py-2 font-medium hidden md:table-cell">
                  Ouv.
                </th>
                <th className="text-right text-[11px] uppercase tracking-wide text-slate-400 px-3 py-2 font-medium hidden md:table-cell">
                  + Haut
                </th>
                <th className="text-right text-[11px] uppercase tracking-wide text-slate-400 px-3 py-2 font-medium hidden md:table-cell">
                  + Bas
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-slate-500 text-xs py-6"
                  >
                    Aucune séance dans la plage sélectionnée.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const ohlc = ohlcByDate.get(p.date);
                  return (
                    <tr
                      key={p.date}
                      className="border-b border-slate-800 hover:bg-slate-800/50"
                    >
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-300">
                        {fmtDate(p.date)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-200">
                        {fmtNumber(p.value)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-400">
                        {p.volume !== null ? fmtNumber(p.volume) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-400 hidden md:table-cell">
                        {ohlc ? fmtNumber(ohlc.open) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-400 hidden md:table-cell">
                        {ohlc ? fmtNumber(ohlc.high) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-400 hidden md:table-cell">
                        {ohlc ? fmtNumber(ohlc.low) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* === FOOTER === */}
      <div className="text-[11px] text-slate-500 text-right">
        {filtered.length} séance{filtered.length > 1 ? "s" : ""} · Source : BRVM
        (clôture quotidienne)
      </div>
    </div>
  );
}

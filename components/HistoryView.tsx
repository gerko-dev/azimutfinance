"use client";

import { useMemo, useState } from "react";
import MemberGateDialog from "./MemberGateDialog";
import type { UserRole } from "@/lib/auth/userRole";

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
  userRole: UserRole;
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

export default function HistoryView({
  ticker,
  history,
  ohlcHistory,
  userRole,
}: Props) {
  const isMember = userRole !== null;

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
  const defaultFrom = last ? shiftDays(last, -30) : "";
  const defaultTo = last ?? "";

  // Bornes calendrier
  const firstDate = history[0]?.date ?? "";
  const lastDate = last ?? "";

  // Etats : pour invites on FORCE [last-30j, last] et on n'expose pas le picker.
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [gateOpen, setGateOpen] = useState(false);

  // Pour les invites, la plage est figee aux 30 derniers jours.
  const effectiveFrom = isMember ? from : defaultFrom;
  const effectiveTo = isMember ? to : defaultTo;

  const filtered = useMemo(() => {
    if (!effectiveFrom || !effectiveTo) return [];
    return history
      .filter((p) => p.date >= effectiveFrom && p.date <= effectiveTo)
      .sort((a, b) => b.date.localeCompare(a.date)); // plus recent en haut
  }, [history, effectiveFrom, effectiveTo]);

  function handleDownload() {
    if (!isMember) {
      setGateOpen(true);
      return;
    }
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
    a.download = `${ticker}_historique_${effectiveFrom}_${effectiveTo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* === HEADER === */}
      <div className="bg-gradient-to-br from-slate-50 to-white rounded-lg border border-slate-200 p-4 md:p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-medium">Historique des cours</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isMember
                ? "Sélectionnez une plage de dates puis téléchargez le fichier CSV."
                : "Cours des 30 derniers jours · téléchargement réservé aux membres."}
            </p>
          </div>
          <span className="text-[10px] md:text-xs text-slate-500">
            {firstDate && lastDate
              ? `Période disponible : ${fmtDate(firstDate)} → ${fmtDate(lastDate)}`
              : null}
          </span>
        </div>
      </div>

      {/* === CONTRÔLES === */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
        {isMember ? (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="hist-from"
                className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1"
              >
                Du
              </label>
              <input
                id="hist-from"
                type="date"
                value={from}
                min={firstDate || undefined}
                max={to || lastDate || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="text-sm px-2.5 py-1.5 rounded-md border border-slate-300 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="hist-to"
                className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1"
              >
                Au
              </label>
              <input
                id="hist-to"
                type="date"
                value={to}
                min={from || firstDate || undefined}
                max={lastDate || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="text-sm px-2.5 py-1.5 rounded-md border border-slate-300 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleDownload}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              📥 Télécharger CSV ({filtered.length} séances)
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              <strong className="text-slate-900">30 derniers jours</strong>{" "}
              · {filtered.length} séances affichées
            </div>
            <button
              type="button"
              onClick={() => setGateOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 transition"
            >
              🔓 Inscription gratuite pour télécharger
            </button>
          </div>
        )}
      </section>

      {/* === TABLE === */}
      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="text-right px-3 py-2 font-medium">Cours</th>
                <th className="text-right px-3 py-2 font-medium">Volume</th>
                <th className="text-right px-3 py-2 font-medium hidden md:table-cell">
                  Ouv.
                </th>
                <th className="text-right px-3 py-2 font-medium hidden md:table-cell">
                  + Haut
                </th>
                <th className="text-right px-3 py-2 font-medium hidden md:table-cell">
                  + Bas
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-slate-400 text-xs py-6"
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
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {fmtDate(p.date)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium">
                        {fmtNumber(p.value)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-600">
                        {p.volume !== null ? fmtNumber(p.volume) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-600 hidden md:table-cell">
                        {ohlc ? fmtNumber(ohlc.open) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-600 hidden md:table-cell">
                        {ohlc ? fmtNumber(ohlc.high) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-600 hidden md:table-cell">
                        {ohlc ? fmtNumber(ohlc.low) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 text-right">
            {filtered.length} séance{filtered.length > 1 ? "s" : ""} · Source :
            BRVM (clôture quotidienne)
          </div>
        )}
      </section>

      <MemberGateDialog
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        tier="member"
        title="Téléchargement réservé aux membres"
        description="Inscrivez-vous gratuitement pour télécharger l'historique complet des cours au format CSV, sur la plage de dates de votre choix."
      />
    </div>
  );
}

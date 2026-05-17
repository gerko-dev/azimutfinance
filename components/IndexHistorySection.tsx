"use client";

import { useMemo, useState } from "react";
import MemberGateDialog from "./MemberGateDialog";
import type { UserRole } from "@/lib/auth/userRole";

type IndexPoint = { date: string; value: number };

type Props = {
  code: string;
  name: string;
  history: IndexPoint[];
  userRole: UserRole;
};

function fmtNumber(v: number, digits = 2): string {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).replace(/,/g, " ").replace(/ (\d{1,2})$/, ",$1");
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function IndexHistorySection({
  code,
  name,
  history,
  userRole,
}: Props) {
  const isMember = userRole !== null;

  const lastDate = history.length > 0 ? history[history.length - 1].date : "";
  const firstDate = history.length > 0 ? history[0].date : "";
  const defaultFrom = lastDate ? shiftDays(lastDate, -30) : "";
  const defaultTo = lastDate;

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [gateOpen, setGateOpen] = useState(false);

  // Pour les invites, plage figee aux 30 derniers jours.
  const effectiveFrom = isMember ? from : defaultFrom;
  const effectiveTo = isMember ? to : defaultTo;

  const filtered = useMemo(() => {
    if (!effectiveFrom || !effectiveTo) return [];
    return history
      .filter((p) => p.date >= effectiveFrom && p.date <= effectiveTo)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [history, effectiveFrom, effectiveTo]);

  function handleDownload() {
    if (!isMember) {
      setGateOpen(true);
      return;
    }
    if (filtered.length === 0) return;

    const header = "Date;Valeur";
    const lines = filtered
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => `${p.date};${p.value}`);
    const csv = "﻿" + header + "\n" + lines.join("\n") + "\n";

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${code}_historique_${effectiveFrom}_${effectiveTo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <div>
          <h2 className="text-lg md:text-xl font-semibold">
            📥 Historique téléchargeable
          </h2>
          <p className="text-[11px] text-slate-500 mt-1">
            {isMember
              ? "Sélectionnez une plage de dates puis téléchargez le CSV."
              : "Cours des 30 derniers jours · téléchargement réservé aux membres."}
          </p>
        </div>
        {firstDate && lastDate && (
          <span className="text-[11px] text-slate-500">
            Période disponible : {fmtDate(firstDate)} → {fmtDate(lastDate)}
          </span>
        )}
      </div>

      {/* CONTRÔLES */}
      <div className="mb-4">
        {isMember ? (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor={`idx-hist-from-${code}`}
                className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1"
              >
                Du
              </label>
              <input
                id={`idx-hist-from-${code}`}
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
                htmlFor={`idx-hist-to-${code}`}
                className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1"
              >
                Au
              </label>
              <input
                id={`idx-hist-to-${code}`}
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
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-right px-3 py-2 font-medium">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="text-center text-slate-400 text-xs py-6"
                >
                  Aucune séance dans la plage sélectionnée.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <div className="mt-2 text-[11px] text-slate-500 text-right">
          {filtered.length} séance{filtered.length > 1 ? "s" : ""} · Indice{" "}
          {name} · Source : BRVM
        </div>
      )}

      <MemberGateDialog
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        tier="member"
        title="Téléchargement réservé aux membres"
        description={`Inscrivez-vous gratuitement pour télécharger l'historique complet de l'indice ${name} au format CSV, sur la plage de dates de votre choix.`}
      />
    </section>
  );
}

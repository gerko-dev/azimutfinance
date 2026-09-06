"use client";

import { useMemo, useState } from "react";
import MemberGateDialog from "./MemberGateDialog";
import type { UserRole } from "@/lib/auth/userRole";

export type BondHistoryPoint = {
  date: string;
  cleanPrice: number;
  dirtyPrice: number | null;
  volume: number;
  valeurTransigee: number;
  traded: boolean;
};

type Props = {
  /** Mnemonique, utilise pour nommer le fichier telecharge. */
  code: string;
  history: BondHistoryPoint[];
  /** Nominal restant par titre a une date — normalise les titres amortissables. */
  nominalAt: (date: string) => number;
  amortized: boolean;
  userRole: UserRole;
};

function fmt(v: number): string {
  return Math.round(v).toLocaleString("fr-FR").replace(/,/g, " ");
}

function fmt2(v: number): string {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BondHistoryView({
  code,
  history,
  nominalAt,
  amortized,
  userRole,
}: Props) {
  const isMember = userRole !== null;
  const [gateOpen, setGateOpen] = useState(false);

  const first = history[0]?.date ?? "";
  const last = history[history.length - 1]?.date ?? "";
  // Meme regle que l'historique des actions : les invites voient les
  // 30 derniers jours, sans selecteur ni telechargement.
  const defaultFrom = last ? shiftDays(last, -30) : "";

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(last);
  const effFrom = isMember ? from : defaultFrom;
  const effTo = isMember ? to : last;

  const filtered = useMemo(
    () =>
      history
        .filter((p) => p.date >= effFrom && p.date <= effTo)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [history, effFrom, effTo],
  );

  const traded = filtered.filter((p) => p.traded);

  function preset(days: number | null) {
    if (!isMember) {
      setGateOpen(true);
      return;
    }
    setTo(last);
    setFrom(days === null ? first : shiftDays(last, -days));
  }

  function download() {
    if (!isMember) {
      setGateOpen(true);
      return;
    }
    if (filtered.length === 0) return;
    // Separateur ";" et BOM UTF-8 : convention du site, Excel FR reconnait
    // les accents et ne colle pas tout dans une seule colonne.
    const header =
      "Date;Cours_pied_de_coupon;Prix_plein_coupon;Nominal_restant;" +
      "Pourcentage_du_nominal;Volume;Montant_transige";
    const lines = [...filtered]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => {
        const nom = nominalAt(p.date);
        const pct = nom > 0 ? (p.cleanPrice / nom) * 100 : null;
        return [
          p.date,
          String(p.cleanPrice),
          p.dirtyPrice !== null ? String(p.dirtyPrice) : "",
          String(nom),
          pct !== null ? pct.toFixed(2).replace(".", ",") : "",
          p.traded ? String(p.volume) : "",
          p.traded ? String(p.valeurTransigee) : "",
        ].join(";");
      });
    const csv = "﻿" + header + "\n" + lines.join("\n") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${code}_cours_${effFrom}_${effTo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (history.length === 0) {
    return (
      <section className="bg-white rounded-lg border border-slate-200 p-10 text-center">
        <div className="text-3xl mb-3">📉</div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          Aucun cours enregistré
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          La collecte des cours obligataires démarre le 2 janvier 2026. Cette
          ligne n&apos;y figure pas — elle vient d&apos;être admise à la cote,
          ou n&apos;est plus cotée.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
          <div>
            <h3 className="text-base font-medium">Historique du cours</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {filtered.length} séance{filtered.length > 1 ? "s" : ""} affichée
              {filtered.length > 1 ? "s" : ""} sur {history.length} — dont{" "}
              {traded.length} avec transaction
            </p>
          </div>
          <button
            onClick={download}
            className="text-xs px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 transition"
          >
            📥 Télécharger CSV
            {isMember ? ` (${filtered.length} séances)` : ""}
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1">
            {[
              { l: "1 mois", d: 30 },
              { l: "3 mois", d: 90 },
              { l: "6 mois", d: 180 },
              { l: "Tout", d: null },
            ].map((r) => (
              <button
                key={r.l}
                onClick={() => preset(r.d)}
                className="text-xs px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50 transition"
              >
                {r.l}
              </button>
            ))}
          </div>

          {isMember ? (
            <div className="flex items-end gap-2">
              <label className="block">
                <span className="block text-[11px] text-slate-500 mb-0.5">Du</span>
                <input
                  type="date"
                  value={from}
                  min={first}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  className="px-2 py-1 text-sm border border-slate-300 rounded"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] text-slate-500 mb-0.5">Au</span>
                <input
                  type="date"
                  value={to}
                  min={from}
                  max={last}
                  onChange={(e) => setTo(e.target.value)}
                  className="px-2 py-1 text-sm border border-slate-300 rounded"
                />
              </label>
            </div>
          ) : (
            <button
              onClick={() => setGateOpen(true)}
              className="text-xs text-blue-700 hover:underline"
            >
              🔓 Inscrivez-vous pour choisir la période et télécharger
            </button>
          )}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-right px-4 py-2 font-medium">
                  Pied de coupon
                </th>
                {/* Une colonne en % du nominal n'a d'interet que si le nominal
                    bouge ; sinon elle duplique la precedente. */}
                {amortized && (
                  <th className="text-right px-4 py-2 font-medium">
                    % du nominal
                  </th>
                )}
                <th className="text-right px-4 py-2 font-medium hidden md:table-cell">
                  Plein coupon
                </th>
                <th className="text-right px-4 py-2 font-medium">Volume</th>
                <th className="text-right px-4 py-2 font-medium hidden md:table-cell">
                  Montant
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const nom = nominalAt(p.date);
                return (
                  <tr
                    key={p.date}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2">{fmtDate(p.date)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmt(p.cleanPrice)}
                    </td>
                    {amortized && (
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                        {nom > 0
                          ? `${fmt2((p.cleanPrice / nom) * 100)} %`
                          : "—"}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right tabular-nums hidden md:table-cell text-slate-500">
                      {p.dirtyPrice ? fmt2(p.dirtyPrice) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {p.traded ? (
                        fmt(p.volume)
                      ) : (
                        <span
                          className="text-slate-400"
                          title="Cotation indicative : aucun échange cette séance."
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums hidden md:table-cell text-slate-500">
                      {p.traded && p.valeurTransigee > 0
                        ? fmt(p.valeurTransigee)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500">
            Aucune séance sur la période choisie.
          </div>
        )}
      </section>

      <MemberGateDialog
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        tier="member"
        title="Réservé aux membres"
        description="Inscrivez-vous gratuitement pour choisir la période affichée et télécharger l'historique des cours obligataires au format CSV."
      />
    </div>
  );
}

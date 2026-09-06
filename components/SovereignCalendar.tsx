"use client";

import { useMemo, memo } from "react";
import type {
  EmissionUMOAFuture,
  EmissionUMOAPlanned,
} from "@/lib/listedBondsTypes";
import CountryFlag from "./CountryFlag";

// Extrait de SouverainsNonCotesView : les echeances ont desormais leur
// propre page, atteinte depuis une carte.

function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatBigFCFA(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2).replace(".", ",") + " T FCFA";
  if (value >= 1e9) return (value / 1e9).toFixed(1).replace(".", ",") + " Mds FCFA";
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

type SovereignCalendarProps = {
  upcoming: EmissionUMOAFuture[];
  planned: EmissionUMOAPlanned[];
};

const SovereignCalendar = memo(function SovereignCalendar({
  upcoming,
  planned,
}: SovereignCalendarProps) {
  const sortedUpcoming = useMemo(
    () =>
      [...upcoming].sort((a, b) =>
        a.dateOperation.localeCompare(b.dateOperation)
      ),
    [upcoming]
  );
  const sortedPlanned = useMemo(
    () =>
      [...planned].sort((a, b) =>
        a.dateOperation.localeCompare(b.dateOperation)
      ),
    [planned]
  );

  if (sortedUpcoming.length === 0 && sortedPlanned.length === 0) return null;

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="flex justify-between items-start flex-wrap gap-2 mb-4">
        <div>
          <h2 className="text-lg md:text-xl font-semibold">📅 Calendrier UMOA-Titres</h2>
          <p className="text-xs md:text-sm text-slate-600 mt-1">
            Émissions à venir (détails connus) et planifiées. Source : UMOA-Titres.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* À VENIR */}
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            🔜 À venir
            <span className="text-xs text-slate-500 font-normal">
              ({sortedUpcoming.length})
            </span>
          </h3>
          {sortedUpcoming.length === 0 ? (
            <div className="text-xs text-slate-400 italic p-3 border border-dashed border-slate-200 rounded-md">
              Aucune émission à venir publiée à ce jour.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="text-left py-1.5 px-1 font-medium">Pays</th>
                    <th className="text-left py-1.5 px-1 font-medium">Instr.</th>
                    <th className="text-left py-1.5 px-1 font-medium">Adjud.</th>
                    <th className="text-left py-1.5 px-1 font-medium hidden md:table-cell">Valeur</th>
                    <th className="text-right py-1.5 px-1 font-medium">Montant</th>
                    <th className="text-center py-1.5 px-1 font-medium">Lien</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUpcoming.map((e, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-1.5 px-1">
                        <div className="flex items-center gap-1.5">
                          <CountryFlag country={e.country} size={14} />
                          <span className="text-[10px] text-slate-600">{e.country}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-1 font-medium">{e.instrument || "—"}</td>
                      <td className="py-1.5 px-1 whitespace-nowrap">{formatDate(e.dateOperation)}</td>
                      <td className="py-1.5 px-1 whitespace-nowrap hidden md:table-cell text-slate-500">{formatDate(e.dateValeur)}</td>
                      <td className="py-1.5 px-1 text-right tabular-nums">
                        {e.amount > 0 ? formatBigFCFA(e.amount * 1e6) : "—"}
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        {e.url ? (
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                            title="Voir la fiche UMOA-Titres"
                          >
                            ↗
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* PLANIFIÉES */}
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            📋 Planifiées
            <span className="text-xs text-slate-500 font-normal">
              ({sortedPlanned.length})
            </span>
          </h3>
          {sortedPlanned.length === 0 ? (
            <div className="text-xs text-slate-400 italic p-3 border border-dashed border-slate-200 rounded-md">
              Aucune émission planifiée publiée à ce jour.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="text-left py-1.5 px-1 font-medium">Pays</th>
                    <th className="text-left py-1.5 px-1 font-medium">Adjud.</th>
                    <th className="text-right py-1.5 px-1 font-medium">Montant</th>
                    <th className="text-center py-1.5 px-1 font-medium">Lien</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlanned.map((e, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-1.5 px-1">
                        <div className="flex items-center gap-1.5">
                          <CountryFlag country={e.country} size={14} />
                          <span className="text-[10px] text-slate-600">{e.country}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-1 whitespace-nowrap">{formatDate(e.dateOperation)}</td>
                      <td className="py-1.5 px-1 text-right tabular-nums">
                        {e.amount > 0 ? formatBigFCFA(e.amount * 1e6) : "—"}
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        {e.url ? (
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                            title="Voir la fiche UMOA-Titres"
                          >
                            ↗
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
});

export default SovereignCalendar;

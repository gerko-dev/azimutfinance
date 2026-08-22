import Link from "next/link";
import { loadMyFunds } from "../data";
import { formatBenchmark } from "../types";

export const metadata = {
  title: "Fund management — Fonds gérés",
};

export const dynamic = "force-dynamic";

export default async function FundsListPage() {
  const funds = await loadMyFunds();

  if (funds.length === 0) {
    return (
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-10 text-center">
        <p className="text-sm text-slate-400">Aucun fonds créé pour le moment.</p>
        <Link
          href="/pros/fund-management/parametres"
          className="inline-block mt-4 px-4 py-2 text-sm font-medium rounded-md border border-blue-500/50 bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 transition"
        >
          + Créer un fonds
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {funds.length} fonds géré{funds.length > 1 ? "s" : ""} — sélectionnez-en un pour le gérer.
        </p>
        <Link
          href="/pros/fund-management/parametres"
          className="text-[12px] text-blue-300 hover:text-blue-200 transition shrink-0"
        >
          + Nouveau fonds
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {funds.map((f) => (
          <Link
            key={f.id}
            href={`/pros/fund-management/fonds/${f.id}`}
            className="block bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-blue-500/60 hover:bg-slate-800/80 transition"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100 truncate">{f.nom}</div>
                {f.abreviation && (
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">{f.abreviation}</div>
                )}
              </div>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 shrink-0">
                {f.type}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300">
                {f.categorie}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">
                {f.devise}
              </span>
              {f.objectifPerf && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">
                  {f.objectifPerf}
                </span>
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-700/70 text-[11px] text-slate-500">
              <span className="text-slate-600">Benchmark : </span>
              {formatBenchmark(f.benchmark)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

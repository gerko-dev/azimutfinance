"use client";

import Link from "next/link";
import type { CategoryIndexRow } from "@/app/fcp/categories/page";

function fmtBigFCFA(v: number | null): string {
  if (v === null || !Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e12) return (v / 1e12).toFixed(2).replace(".", ",") + " T";
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (v >= 1e6) return (v / 1e6).toFixed(0) + " M";
  return Math.round(v).toLocaleString("fr-FR").replace(/,/g, " ");
}
function fmtPct(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return (sign + (v * 100).toFixed(digits)).replace(".", ",") + "%";
}
function fmtPctRaw(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return (v * 100).toFixed(digits).replace(".", ",") + "%";
}
function fmtDateFR(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  Obligataire: "#185FA5",
  Monétaire: "#0891b2",
  Diversifié: "#7F77DD",
  Actions: "#0F6E56",
  "Actifs non cotés": "#854F0B",
};

const CATEGORY_DESC: Record<string, string> = {
  Obligataire:
    "Fonds obligataires UEMOA — investissent en titres de créance (OAT/OTAR souverains, obligations corporate cotées BRVM).",
  Monétaire:
    "Fonds monétaires court terme — placements liquides à très faible risque (BAT souverains, dépôts bancaires).",
  Diversifié:
    "Fonds diversifiés — combinaison flexible d'actions, d'obligations et d'instruments monétaires selon la conviction du gérant.",
  Actions:
    "Fonds actions UEMOA — exposés au marché actions BRVM (toutes capi confondues).",
  "Actifs non cotés":
    "Fonds investis en private equity, immobilier ou créances non cotées — illiquides, valorisations ponctuelles.",
};

type Props = {
  rows: CategoryIndexRow[];
  refQuarter: string;
  marketTotalAUM: number;
  totalFunds: number;
};

export default function CategoryIndexView({ rows, refQuarter, marketTotalAUM, totalFunds }: Props) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          <Link href="/marches/fcp" className="hover:underline">FCP / OPCVM</Link>
        </p>
        <h1 className="text-3xl font-bold text-slate-900">Catégories de FCP UEMOA</h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          {rows.length} catégories regroupent les {totalFunds} fonds suivis · encours total{" "}
          <strong>{fmtBigFCFA(marketTotalAUM)} FCFA</strong> au {fmtDateFR(refQuarter)}.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map((r) => (
          <Link
            key={r.slug}
            href={`/fcp/categorie/${r.slug}`}
            className="block bg-white border border-slate-200 rounded-lg p-5 hover:border-slate-400 hover:shadow-sm transition"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ background: CATEGORY_COLORS[r.categorie] || "#94a3b8" }}
                />
                <h2 className="text-lg font-bold text-slate-900">{r.categorie}</h2>
              </div>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {fmtPctRaw(r.marketShare, 0)} du marché
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">{CATEGORY_DESC[r.categorie] || ""}</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Stat label="Fonds" value={String(r.nbFunds)} sub={`${r.nbManagers} SGP`} />
              <Stat label="AUM total" value={fmtBigFCFA(r.aumTotal)} sub="FCFA" />
              <Stat label="Médiane 1A" value={fmtPct(r.perfMedian1Y, 1)} sub="par fonds" />
            </div>
            <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
              <span>Spread 1A:</span>
              <span className="font-mono text-rose-700">{fmtPct(r.perfMin1Y, 1)}</span>
              <span className="text-slate-400">→</span>
              <span className="font-mono text-emerald-700">{fmtPct(r.perfMax1Y, 1)}</span>
              {r.spread1Y !== null && (
                <span className="text-slate-500">({fmtPct(r.spread1Y, 1)} d&apos;écart)</span>
              )}
            </div>
          </Link>
        ))}
      </section>

      <p className="text-xs text-slate-400">
        Encours ponctuel au {fmtDateFR(refQuarter)}. Cliquez sur une catégorie pour voir la
        dispersion détaillée, les concurrents et l&apos;historique.
      </p>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-2 rounded bg-slate-50 border border-slate-200">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-900">{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

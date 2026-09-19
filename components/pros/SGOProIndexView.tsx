"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type SGOIndexRow = {
  slug: string;
  name: string;
  nbFunds: number;
  nbCategories: number;
  aumAtRef: number;
  marketShare: number;
  perfWeighted1Y: number | null;
  perfMedian1Y: number | null;
  topQuartileShare: number | null;
};

function fmtBigFCFA(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return (a / 1e12).toFixed(2).replace(".", ",") + " T";
  if (a >= 1e9) return (a / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (a >= 1e6) return (a / 1e6).toFixed(0) + " M";
  return Math.round(a).toLocaleString("fr-FR").replace(/,/g, " ");
}
function fmtPct(v: number | null, digits = 1): string {
  if (v == null || !isFinite(v)) return "—";
  return (v * 100).toFixed(digits).replace(".", ",") + "%";
}
function fmtPctSigned(v: number | null, digits = 2): string {
  if (v == null || !isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return sign + (v * 100).toFixed(digits).replace(".", ",") + "%";
}
function tone(v: number | null): string {
  if (v == null) return "text-slate-400";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-slate-300";
}

type SortKey = "name" | "nbFunds" | "aumAtRef" | "perfWeighted1Y" | "perfMedian1Y" | "topQuartileShare";

export default function SGOProIndexView({ rows, totalAUM }: { rows: SGOIndexRow[]; totalAUM: number }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("aumAtRef");
  const [sortDesc, setSortDesc] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter((r) => !q || r.name.toLowerCase().includes(q));
    const dir = sortDesc ? -1 : 1;
    out.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return dir * av.localeCompare(bv);
      return dir * ((av as number) - (bv as number));
    });
    return out;
  }, [rows, query, sortKey, sortDesc]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(k);
      setSortDesc(true);
    }
  };

  const maxShare = rows.length > 0 ? Math.max(...rows.map((r) => r.marketShare)) : 1;

  const exportCsv = () => {
    const header = ["Gestionnaire", "Fonds", "Categories", "AUM_FCFA", "Part_marche", "Perf_pondere_1Y", "Perf_mediane_1Y", "Part_top_Q"];
    const lines = filtered.map((r) =>
      [
        `"${r.name.replace(/"/g, '""')}"`,
        r.nbFunds,
        r.nbCategories,
        Math.round(r.aumAtRef),
        (r.marketShare * 100).toFixed(2).replace(".", ","),
        r.perfWeighted1Y != null ? (r.perfWeighted1Y * 100).toFixed(2).replace(".", ",") : "",
        r.perfMedian1Y != null ? (r.perfMedian1Y * 100).toFixed(2).replace(".", ",") : "",
        r.topQuartileShare != null ? (r.topQuartileShare * 100).toFixed(0) : "",
      ].join(";")
    );
    const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "societes-gestion.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une société de gestion…"
          className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-64"
        />
        <span className="text-[11px] text-slate-500">{filtered.length} / {rows.length}</span>
        <button
          type="button"
          onClick={exportCsv}
          className="ml-auto text-[11px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-500/40 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25 transition"
        >
          ⬇ Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
              <th className="px-4 py-2.5 text-left font-medium">#</th>
              <Th onClick={() => toggleSort("name")} active={sortKey === "name"} desc={sortDesc}>Gestionnaire</Th>
              <Th onClick={() => toggleSort("nbFunds")} active={sortKey === "nbFunds"} desc={sortDesc} right>Fonds</Th>
              <Th onClick={() => toggleSort("aumAtRef")} active={sortKey === "aumAtRef"} desc={sortDesc} right>Encours</Th>
              <th className="px-3 py-2.5 text-left font-medium">Part de marché</th>
              <Th onClick={() => toggleSort("perfWeighted1Y")} active={sortKey === "perfWeighted1Y"} desc={sortDesc} right>Perf. pond. 1A</Th>
              <Th onClick={() => toggleSort("perfMedian1Y")} active={sortKey === "perfMedian1Y"} desc={sortDesc} right cls="hidden md:table-cell">Perf. méd. 1A</Th>
              <Th onClick={() => toggleSort("topQuartileShare")} active={sortKey === "topQuartileShare"} desc={sortDesc} right>% top Q</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.slug} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                <td className="px-4 py-2 font-mono text-slate-500">{i + 1}</td>
                <td className="px-3 py-2">
                  <Link href={`/pros/sgo/${r.slug}`} className="text-slate-200 hover:text-white transition">
                    {r.name}
                  </Link>
                  <div className="text-[10px] text-slate-500">{r.nbCategories} catégories</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-400">{r.nbFunds}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-200">{fmtBigFCFA(r.aumAtRef)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden min-w-[60px]">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${maxShare > 0 ? (r.marketShare / maxShare) * 100 : 0}%` }} />
                    </div>
                    <span className="font-mono text-slate-400 w-12 text-right">{fmtPct(r.marketShare)}</span>
                  </div>
                </td>
                <td className={`px-3 py-2 text-right font-mono ${tone(r.perfWeighted1Y)}`}>{fmtPctSigned(r.perfWeighted1Y)}</td>
                <td className={`px-3 py-2 text-right font-mono hidden md:table-cell ${tone(r.perfMedian1Y)}`}>{fmtPctSigned(r.perfMedian1Y)}</td>
                <td className="px-3 py-2 text-right">
                  {r.topQuartileShare != null ? (
                    <span
                      className={`font-mono px-1.5 py-0.5 rounded ${
                        r.topQuartileShare >= 0.5
                          ? "bg-emerald-500/15 text-emerald-300"
                          : r.topQuartileShare > 0
                          ? "bg-blue-500/15 text-blue-300"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {Math.round(r.topQuartileShare * 100)}%
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-10 text-center text-sm text-slate-500">Aucune société de gestion trouvée.</div>
        )}
      </div>
      <p className="px-4 py-2.5 text-[11px] text-slate-500 border-t border-slate-700 leading-relaxed">
        Perf. pondérée = perf. 1 an pondérée par l&apos;encours des fonds · % top Q = part des fonds classés Q1
        dans leur catégorie. Encours total marché : {fmtBigFCFA(totalAUM)} FCFA.
      </p>
    </section>
  );
}

function Th({
  children,
  onClick,
  active,
  desc,
  right,
  cls = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  desc: boolean;
  right?: boolean;
  cls?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2.5 font-medium cursor-pointer select-none hover:text-slate-300 ${right ? "text-right" : "text-left"} ${cls}`}
    >
      {children}
      {active && <span className="ml-1 text-blue-400">{desc ? "▼" : "▲"}</span>}
    </th>
  );
}

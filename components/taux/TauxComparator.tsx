"use client";

import { useMemo, useState } from "react";
import CountryFlag from "@/components/CountryFlag";
import { COUNTRY_TO_FLAG } from "@/lib/tauxTypes";
import type { TauxRow, TauxSection } from "@/lib/tauxTypes";
import { fmtPct, fmtMFCFA, fmtMdsFCFA, fmtRatio, fmtRate } from "@/lib/tauxFormat";

type ComparableIndicator = {
  section: TauxSection;
  indicator: string;
  label: string;
  unit: "pct" | "Mds_FCFA" | "M_FCFA" | "x" | "rate";
  group: string;
};

const COMPARABLES: ComparableIndicator[] = [
  // Section 4 — Inflation
  { section: "4_Inflation_pays_UEMOA", indicator: "IPC glissement annuel", label: "Inflation IPC (YoY)", unit: "pct", group: "Inflation" },
  // Section 5 — Agrégats (par pays)
  { section: "5_Reserves_Agregats", indicator: "Masse monetaire M2", label: "Masse monétaire M2", unit: "Mds_FCFA", group: "Agrégats monétaires" },
  { section: "5_Reserves_Agregats", indicator: "Circulation fiduciaire", label: "Circulation fiduciaire", unit: "Mds_FCFA", group: "Agrégats monétaires" },
  { section: "5_Reserves_Agregats", indicator: "Actifs exterieurs nets", label: "Actifs extérieurs nets", unit: "Mds_FCFA", group: "Agrégats monétaires" },
  { section: "5_Reserves_Agregats", indicator: "Creances interieures", label: "Créances intérieures", unit: "Mds_FCFA", group: "Agrégats monétaires" },
  { section: "5_Reserves_Agregats", indicator: "Coefficient RO Banques", label: "Coefficient RO banques", unit: "pct", group: "Agrégats monétaires" },
  // Section 9 — Réserves
  { section: "9_Reserves_const_vs_req", indicator: "Reserves requises", label: "Réserves requises", unit: "M_FCFA", group: "Réserves obligatoires" },
  { section: "9_Reserves_const_vs_req", indicator: "Reserves constituees", label: "Réserves constituées", unit: "M_FCFA", group: "Réserves obligatoires" },
  { section: "9_Reserves_const_vs_req", indicator: "Solde net", label: "Solde net réserves", unit: "M_FCFA", group: "Réserves obligatoires" },
  { section: "9_Reserves_const_vs_req", indicator: "Ratio constituees sur requises", label: "Ratio sur-réserves", unit: "x", group: "Réserves obligatoires" },
  // Section 10a — Conditions catégorie
  { section: "10a_Conditions_banque_categorie", indicator: "Ensemble", label: "Cond. banque — Ensemble", unit: "pct", group: "Conditions de banque · catégorie" },
  { section: "10a_Conditions_banque_categorie", indicator: "Societes non financieres", label: "Cond. — Sociétés non fin.", unit: "pct", group: "Conditions de banque · catégorie" },
  { section: "10a_Conditions_banque_categorie", indicator: "Menages", label: "Cond. — Ménages", unit: "pct", group: "Conditions de banque · catégorie" },
  { section: "10a_Conditions_banque_categorie", indicator: "Societes financieres", label: "Cond. — Sociétés fin.", unit: "pct", group: "Conditions de banque · catégorie" },
  { section: "10a_Conditions_banque_categorie", indicator: "Administrations Publiques", label: "Cond. — Admin. publiques", unit: "pct", group: "Conditions de banque · catégorie" },
  // Section 10b — Conditions objet
  { section: "10b_Conditions_banque_objet", indicator: "Tresorerie", label: "Cond. — Trésorerie", unit: "pct", group: "Conditions de banque · objet" },
  { section: "10b_Conditions_banque_objet", indicator: "Equipement", label: "Cond. — Équipement", unit: "pct", group: "Conditions de banque · objet" },
  { section: "10b_Conditions_banque_objet", indicator: "Immobilier", label: "Cond. — Immobilier", unit: "pct", group: "Conditions de banque · objet" },
  { section: "10b_Conditions_banque_objet", indicator: "Consommation", label: "Cond. — Consommation", unit: "pct", group: "Conditions de banque · objet" },
];

const COUNTRY_ORDER = [
  "Benin",
  "Burkina Faso",
  "Cote d'Ivoire",
  "Guinee-Bissau",
  "Mali",
  "Niger",
  "Senegal",
  "Togo",
];

function fmtForUnit(v: number, unit: ComparableIndicator["unit"]): string {
  switch (unit) {
    case "pct": return fmtPct(v);
    case "Mds_FCFA": return fmtMdsFCFA(v);
    case "M_FCFA": return fmtMFCFA(v);
    case "x": return fmtRatio(v);
    case "rate": return fmtRate(v, 4);
  }
}

type SortKey = "country" | "value" | "vsRef";
type SortDir = "asc" | "desc";

export default function TauxComparator({ rows }: { rows: TauxRow[] }) {
  const [selectedKey, setSelectedKey] = useState<string>(COMPARABLES[0].section + "|" + COMPARABLES[0].indicator);
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const selected = COMPARABLES.find((c) => `${c.section}|${c.indicator}` === selectedKey)!;

  const tableData = useMemo(() => {
    const matching = rows.filter(
      (r) => r.section === selected.section && r.indicator === selected.indicator
    );
    if (matching.length === 0) return { rows: [], reference: null, period: "—" };

    const maxKey = Math.max(...matching.map((r) => r.period.sortKey));
    const snapshot = matching.filter((r) => r.period.sortKey === maxKey);
    const period = snapshot[0]?.period.label ?? "—";

    // Référence : UEMOA, UMOA, Union ou Mediane (selon ce qui existe)
    const referenceCandidates = ["UEMOA", "UMOA", "Union", "Mediane UEMOA"];
    let reference: number | null = null;
    let referenceLabel = "";
    for (const refName of referenceCandidates) {
      const found = snapshot.find((r) => r.country === refName);
      if (found) {
        reference = found.value;
        referenceLabel = refName;
        break;
      }
    }

    const countryRows = COUNTRY_ORDER.map((c) => {
      const found = snapshot.find((r) => r.country === c);
      return {
        country: c,
        value: found?.value ?? NaN,
        vsRef: reference !== null && found ? found.value - reference : NaN,
      };
    }).filter((r) => isFinite(r.value));

    countryRows.sort((a, b) => {
      let diff = 0;
      if (sortKey === "country") diff = a.country.localeCompare(b.country);
      else if (sortKey === "value") diff = a.value - b.value;
      else diff = a.vsRef - b.vsRef;
      return sortDir === "asc" ? diff : -diff;
    });

    return { rows: countryRows, reference, referenceLabel, period };
  }, [rows, selected, sortKey, sortDir]);

  const minVal = tableData.rows.length > 0 ? Math.min(...tableData.rows.map((r) => r.value)) : 0;
  const maxVal = tableData.rows.length > 0 ? Math.max(...tableData.rows.map((r) => r.value)) : 1;

  function bgFor(v: number): string {
    if (!isFinite(v)) return "bg-slate-50";
    const t = maxVal === minVal ? 0.5 : (v - minVal) / (maxVal - minVal);
    if (t < 0.2) return "bg-emerald-100";
    if (t < 0.4) return "bg-emerald-50";
    if (t < 0.6) return "bg-amber-50";
    if (t < 0.8) return "bg-orange-100";
    return "bg-red-100";
  }

  function cycleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ComparableIndicator[]>();
    for (const c of COMPARABLES) {
      const list = map.get(c.group) ?? [];
      list.push(c);
      map.set(c.group, list);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <section
      id="comparateur"
      className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 scroll-mt-24"
    >
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold">Comparateur pays</h2>
          <p className="text-xs text-slate-500 mt-1">
            Snapshot par pays sur n&apos;importe quel indicateur disponible. Tri et écart vs zone UEMOA.
          </p>
        </div>
        <div className="text-xs text-slate-500">Période : {tableData.period}</div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <label className="text-xs text-slate-600">Indicateur :</label>
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className="text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        >
          {grouped.map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map((c) => (
                <option key={`${c.section}|${c.indicator}`} value={`${c.section}|${c.indicator}`}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {tableData.reference !== null && (
          <span className="text-xs text-slate-500 ml-2">
            Référence : <span className="font-medium">{tableData.referenceLabel}</span> = {fmtForUnit(tableData.reference, selected.unit)}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-200">
              <th className="text-left py-2 px-2 font-medium cursor-pointer hover:text-slate-900" onClick={() => cycleSort("country")}>
                Pays {sortKey === "country" && (sortDir === "asc" ? "▲" : "▼")}
              </th>
              <th className="text-right py-2 px-2 font-medium cursor-pointer hover:text-slate-900" onClick={() => cycleSort("value")}>
                Valeur {sortKey === "value" && (sortDir === "asc" ? "▲" : "▼")}
              </th>
              <th className="text-right py-2 px-2 font-medium cursor-pointer hover:text-slate-900" onClick={() => cycleSort("vsRef")}>
                Écart vs {tableData.referenceLabel || "réf."} {sortKey === "vsRef" && (sortDir === "asc" ? "▲" : "▼")}
              </th>
              <th className="text-left py-2 px-2 font-medium w-[40%]">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {tableData.rows.map((r) => {
              const widthPct = maxVal === minVal ? 50 : ((r.value - minVal) / (maxVal - minVal)) * 100;
              return (
                <tr key={r.country} className="border-b border-slate-100">
                  <td className="py-2 px-2">
                    <span className="inline-flex items-center gap-2">
                      <CountryFlag country={COUNTRY_TO_FLAG[r.country] ?? r.country} size={14} />
                      {r.country}
                    </span>
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums font-medium ${bgFor(r.value)}`}>
                    {fmtForUnit(r.value, selected.unit)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {isFinite(r.vsRef) ? (
                      <span className={r.vsRef > 0 ? "text-red-600" : r.vsRef < 0 ? "text-green-600" : "text-slate-500"}>
                        {r.vsRef >= 0 ? "+" : ""}
                        {fmtForUnit(r.vsRef, selected.unit)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="py-2 px-2">
                    <div className="h-2 bg-slate-100 rounded overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${widthPct}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {tableData.rows.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-8">Aucune donnée pour cet indicateur.</div>
        )}
      </div>
    </section>
  );
}

import React from "react";
import {
  BIEN_CATEGORIES_BY_TRANSACTION,
  BIEN_CATEGORIE_LABEL,
  UEMOA_COUNTRY_LABEL,
  formatFCFA,
  type BienCategorie,
  type CommuneYieldM2Row,
  type CountryPriceM2Row,
  type QuartierDispersionRow,
  type Transaction,
} from "@/lib/immobilier";

const COUNTRY_COLORS: Record<string, string> = {
  CI: "#f97316",
  SN: "#10b981",
  ML: "#eab308",
  BF: "#dc2626",
  BJ: "#3b82f6",
  TG: "#8b5cf6",
  NE: "#06b6d4",
  GW: "#ec4899",
};

const CAT_COLORS: Record<BienCategorie, string> = {
  bureaux: "#3b82f6",
  logements: "#10b981",
  magasins: "#f59e0b",
  terrains: "#a855f7",
};

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("fr-FR").replace(/,/g, " ");
}

export default function ImmobilierAnalytics({
  yieldsByCommune,
  pricesByCountryAchat,
  pricesByCountryLocation,
  dispersionAchat,
  dispersionLocation,
  showAchat,
  showLocation,
}: {
  yieldsByCommune: CommuneYieldM2Row[];
  pricesByCountryAchat: CountryPriceM2Row[];
  pricesByCountryLocation: CountryPriceM2Row[];
  dispersionAchat: QuartierDispersionRow[];
  dispersionLocation: QuartierDispersionRow[];
  showAchat: boolean;
  showLocation: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* === 1) RENDEMENT LOCATIF BRUT === */}
      {showAchat && showLocation && yieldsByCommune.length > 0 && (
        <YieldsSection rows={yieldsByCommune} />
      )}

      {/* === 2) COMPARAISON CROSS-PAYS === */}
      {showAchat && pricesByCountryAchat.length > 0 && (
        <CountryComparisonSection
          rows={pricesByCountryAchat}
          transaction="achat"
        />
      )}
      {showLocation && pricesByCountryLocation.length > 0 && (
        <CountryComparisonSection
          rows={pricesByCountryLocation}
          transaction="location"
        />
      )}

      {/* === 3) DISPERSION PAR QUARTIER === */}
      {showAchat && dispersionAchat.length > 0 && (
        <DispersionSection rows={dispersionAchat} transaction="achat" />
      )}
      {showLocation && dispersionLocation.length > 0 && (
        <DispersionSection rows={dispersionLocation} transaction="location" />
      )}
    </div>
  );
}

// =============================================================================
// 1) YIELDS
// =============================================================================

function YieldsSection({ rows }: { rows: CommuneYieldM2Row[] }) {
  // Pour la barre de progression, max rendement parmi communes (et enfants)
  const allRendements: number[] = [];
  for (const r of rows) {
    if (r.rendementBrutPct > 0) allRendements.push(r.rendementBrutPct);
    for (const ch of r.children) {
      if (ch.rendementBrutPct > 0) allRendements.push(ch.rendementBrutPct);
    }
  }
  const maxRendement = Math.max(1, ...allRendements);

  function colorFor(r: number): string {
    if (r >= 8) return "bg-emerald-500";
    if (r >= 5) return "bg-blue-500";
    return "bg-slate-400";
  }
  function txtFor(r: number): string {
    if (r >= 8) return "text-emerald-700";
    if (r >= 5) return "text-blue-700";
    return "text-slate-700";
  }

  function renderBar(r: number) {
    const widthPct = (r / maxRendement) * 100;
    return (
      <div className="w-full h-2 bg-slate-100 rounded">
        <div className={`h-2 rounded ${colorFor(r)}`} style={{ width: `${widthPct}%` }} />
      </div>
    );
  }

  return (
    <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 md:px-6 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base md:text-lg font-semibold text-slate-900">
          Rendement locatif brut — par commune (drill-down quartiers)
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          (loyer médian m²/mois × 12) / prix achat médian m². Calculé uniquement
          sur les <strong>logements</strong>. Min. 3 annonces par côté.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
            <tr>
              <th className="text-left font-medium py-2 px-4">Localité</th>
              <th className="text-right font-medium py-2 px-3">Prix achat m²</th>
              <th className="text-right font-medium py-2 px-3">Loyer m²/mois</th>
              <th className="text-right font-medium py-2 px-3">Rendement</th>
              <th className="text-left font-medium py-2 px-3 w-[30%]">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const prevRegion = idx > 0 ? rows[idx - 1].region : "";
              const showRegionHeader = r.region && r.region !== prevRegion;
              const hasCommuneValue = r.rendementBrutPct > 0;
              return (
                <React.Fragment key={r.commune}>
                  {showRegionHeader && (
                    <tr className="bg-slate-100 border-t-2 border-slate-300">
                      <td
                        colSpan={5}
                        className="py-1.5 px-4 text-[10px] uppercase tracking-wider font-bold text-slate-600"
                      >
                        {r.region}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-4 font-semibold text-slate-900">
                      {r.commune}
                      {r.children.length > 0 && (
                        <span className="ml-1.5 text-[10px] text-amber-600 font-normal">*</span>
                      )}
                    </td>
                    {hasCommuneValue ? (
                      <>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                          {formatFCFA(r.prixAchatM2)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                          {formatFCFA(r.loyerM2Monthly)}
                        </td>
                        <td className={`py-2 px-3 text-right tabular-nums font-semibold ${txtFor(r.rendementBrutPct)}`}>
                          {r.rendementBrutPct.toFixed(1).replace(".", ",")} %
                        </td>
                        <td className="py-2 px-3">{renderBar(r.rendementBrutPct)}</td>
                      </>
                    ) : (
                      <td
                        colSpan={4}
                        className="py-2 px-3 text-right text-[10px] text-slate-400 italic"
                      >
                        commune n&apos;atteint pas le seuil — voir quartiers ci-dessous
                      </td>
                    )}
                  </tr>
                  {r.children.map((ch) => (
                    <tr
                      key={`${r.commune}|${ch.quartier}`}
                      className="border-t border-slate-50 bg-slate-50/30 hover:bg-slate-50"
                    >
                      <td className="py-1.5 pl-8 pr-4 text-slate-700">
                        <span className="text-slate-400 mr-1">└</span>
                        {ch.quartier}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-slate-700">
                        {formatFCFA(ch.prixAchatM2)}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-slate-700">
                        {formatFCFA(ch.loyerM2Monthly)}
                      </td>
                      <td className={`py-1.5 px-3 text-right tabular-nums font-medium ${txtFor(ch.rendementBrutPct)}`}>
                        {ch.rendementBrutPct.toFixed(1).replace(".", ",")} %
                      </td>
                      <td className="py-1.5 px-3">{renderBar(ch.rendementBrutPct)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 md:px-6 py-2 text-[10px] text-slate-500 bg-slate-50 border-t border-slate-100">
        <span className="text-emerald-700">Vert ≥ 8 %</span> = très attractif investisseur ;
        <span className="text-blue-700"> bleu 5–8 %</span> = standard ;
        <span className="text-slate-600"> gris {"<"} 5 %</span> = marché tendu côté prix.
        <span className="text-amber-600 ml-1">*</span> = drill-down quartiers.
      </div>
    </section>
  );
}

// =============================================================================
// 2) CROSS-PAYS
// =============================================================================

function CountryComparisonSection({
  rows,
  transaction,
}: {
  rows: CountryPriceM2Row[];
  transaction: Transaction;
}) {
  const cats = BIEN_CATEGORIES_BY_TRANSACTION[transaction];
  // Pour chaque catégorie, trouve le max pour normaliser les barres
  const maxByCat: Record<BienCategorie, number> = {
    bureaux: 0,
    logements: 0,
    magasins: 0,
    terrains: 0,
  };
  for (const r of rows) {
    for (const c of cats) {
      const v = r.prices[c];
      if (v !== null && v > maxByCat[c]) maxByCat[c] = v;
    }
  }

  const title =
    transaction === "achat"
      ? "Comparaison cross-pays — Prix d'achat m²"
      : "Comparaison cross-pays — Loyer m²/mois";

  return (
    <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 md:px-6 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base md:text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Médianes par pays UEMOA et par catégorie. Minimum 5 annonces par cellule.
        </p>
      </div>
      <div className="p-4 md:p-6 space-y-5">
        {cats.map((c) => {
          const sorted = [...rows].sort((a, b) => {
            const va = a.prices[c] ?? 0;
            const vb = b.prices[c] ?? 0;
            return vb - va;
          });
          const visible = sorted.filter((r) => r.prices[c] !== null);
          if (visible.length === 0) return null;
          const max = maxByCat[c] || 1;
          return (
            <div key={c}>
              <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: CAT_COLORS[c] }}
                />
                {BIEN_CATEGORIE_LABEL[c]}
              </div>
              <div className="space-y-1.5">
                {visible.map((r) => {
                  const v = r.prices[c] as number;
                  const widthPct = (v / max) * 100;
                  const color = COUNTRY_COLORS[r.country] || "#64748b";
                  return (
                    <div
                      key={r.country}
                      className="flex items-center gap-2 text-xs"
                    >
                      <div className="w-20 shrink-0 text-slate-700">
                        {UEMOA_COUNTRY_LABEL[r.country]}
                      </div>
                      <div className="flex-1 h-5 bg-slate-50 rounded relative">
                        <div
                          className="h-5 rounded"
                          style={{
                            width: `${widthPct}%`,
                            background: color,
                          }}
                        />
                      </div>
                      <div className="w-28 text-right tabular-nums font-medium text-slate-900">
                        {formatFCFA(v)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// =============================================================================
// 3) DISPERSION
// =============================================================================

function DispersionSection({
  rows,
  transaction,
}: {
  rows: QuartierDispersionRow[];
  transaction: Transaction;
}) {
  // Trouve la plage globale pour positionner les barres Q1-Q3
  const globalMin = Math.min(...rows.map((r) => r.q1));
  const globalMax = Math.max(...rows.map((r) => r.q3));
  const range = globalMax - globalMin || 1;

  const title =
    transaction === "achat"
      ? "Dispersion par quartier — Prix d'achat m² (logements)"
      : "Dispersion par quartier — Loyer m²/mois (logements)";

  return (
    <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 md:px-6 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base md:text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Pour chaque quartier : Q1 (25 %), médiane, Q3 (75 %). Barre = écart
          inter-quartile (IQR). Plus la barre est large, plus le marché du
          quartier est hétérogène. Top 15 quartiers triés par médiane.
        </p>
      </div>
      <div className="px-4 md:px-6 py-4 space-y-1.5">
        {rows.map((r) => {
          const leftPct = ((r.q1 - globalMin) / range) * 100;
          const widthPct = ((r.q3 - r.q1) / range) * 100;
          const medianLeftPct = ((r.median - globalMin) / range) * 100;
          return (
            <div
              key={r.quartier}
              className="grid grid-cols-[140px_1fr_70px] gap-2 items-center text-xs"
            >
              <div className="truncate text-slate-700">{r.quartier}</div>
              <div className="relative h-5 bg-slate-50 rounded">
                <div
                  className="absolute top-0.5 bottom-0.5 bg-blue-200 rounded"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  title={`Q1 ${fmtInt(r.q1)} — Q3 ${fmtInt(r.q3)} FCFA/m²`}
                />
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-700"
                  style={{ left: `calc(${medianLeftPct}% - 1px)` }}
                  title={`Médiane ${fmtInt(r.median)} FCFA/m²`}
                />
              </div>
              <div className="text-right tabular-nums font-medium text-slate-900">
                {formatFCFA(r.median)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-4 md:px-6 py-2 text-[10px] text-slate-500 bg-slate-50 border-t border-slate-100 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-2 bg-blue-200 rounded" />
          Q1–Q3 (IQR)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-0.5 h-3 bg-blue-700" />
          Médiane
        </span>
      </div>
    </section>
  );
}


"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Treemap,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { FundCard, CategoryStat, PeriodKey } from "@/app/marches/fcp/page";

// ==========================================
// HELPERS
// ==========================================
function fmtBigFCFA(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
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

function fmtDateFR(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
function managerSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CATEGORY_SLUG: Record<string, string> = {
  Obligataire: "obligataire",
  Monétaire: "monetaire",
  Diversifié: "diversifie",
  Actions: "actions",
  "Actifs non cotés": "actifs-non-cotes",
};

const CATEGORY_COLORS: Record<string, string> = {
  Obligataire: "#185FA5",
  Monétaire: "#0891b2",
  Diversifié: "#7F77DD",
  Actions: "#0F6E56",
  "Actifs non cotés": "#854F0B",
};

const PERIOD_LABEL: Record<PeriodKey, string> = {
  lastPeriod: "Dernière",
  ytd: "YTD",
  m3: "3 mois",
  m6: "6 mois",
  m9: "9 mois",
  y1: "1 an",
};
const PERIOD_ORDER: PeriodKey[] = ["lastPeriod", "ytd", "m3", "m6", "m9", "y1"];

// Échelle perf → couleur
function perfColor(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "#cbd5e1";
  const clamped = Math.max(-0.15, Math.min(0.15, p));
  const t = (clamped + 0.15) / 0.3;
  if (t < 0.5) return interpolateHex("#dc2626", "#fbbf24", t * 2);
  return interpolateHex("#fbbf24", "#16a34a", (t - 0.5) * 2);
}
function hexToRgb(h: string) {
  const x = h.replace("#", "");
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
}
function interpolateHex(a: string, b: string, t: number) {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  const m = ra.map((c, i) => Math.round(c + (rb[i] - c) * t));
  return `#${m.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// ==========================================
// PROPS
// ==========================================
type Props = {
  refQuarter: string;
  latestVLGlobal: string;
  stalenessCutoff: string;
  totalAUM: number;
  totalFundsAtRef: number;
  totalManagers: number;
  cards: FundCard[];
  cardsAtRef: FundCard[];
  categoryStats: CategoryStat[];
  aumTimeline: Array<Record<string, number | string>>;
  heatmap: Array<{ date: string; categorie: string; perf: number | null }>;
};

// ==========================================
// TREEMAP CONTENT (interactif : hover + click)
// ==========================================
type TreemapContentProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  size?: number;
  perf?: number | null;
  depth?: number;
  categorie?: string;
  fundId?: string;
  // Injectés par le wrapper :
  hoveredFundId?: string | null;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
};

function TreemapNodeContent(props: TreemapContentProps) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    name = "",
    size,
    perf,
    depth = 1,
    categorie,
    fundId,
    hoveredFundId,
    onHover,
    onSelect,
  } = props;
  if (width <= 0 || height <= 0) return null;
  const isLeaf = depth >= 2;
  const isHovered = isLeaf && !!fundId && hoveredFundId === fundId;
  const fill = isLeaf
    ? perfColor(perf ?? null)
    : CATEGORY_COLORS[name] || CATEGORY_COLORS[categorie || ""] || "#94a3b8";
  // L'agrandissement visuel : on étend de quelques pixels à l'extérieur du rect d'origine
  const pad = isHovered ? 4 : 0;
  return (
    <g
      onMouseEnter={isLeaf && fundId && onHover ? () => onHover(fundId) : undefined}
      onMouseLeave={isLeaf && fundId && onHover ? () => onHover(null) : undefined}
      onClick={isLeaf && fundId && onSelect ? () => onSelect(fundId) : undefined}
      style={{ cursor: isLeaf && fundId ? "pointer" : "default" }}
    >
      <rect
        x={x - pad}
        y={y - pad}
        width={width + pad * 2}
        height={height + pad * 2}
        style={{
          fill,
          stroke: isHovered ? "#0f172a" : isLeaf ? "#fff" : "#0f172a",
          strokeWidth: isHovered ? 2.5 : isLeaf ? 1 : 2,
          opacity: isLeaf ? (isHovered ? 1 : 0.92) : 1,
          transition: "all 120ms ease-out",
          filter: isHovered ? "drop-shadow(0 4px 8px rgba(15,23,42,0.25))" : undefined,
        }}
      />
      {width > 60 && height > 28 && (
        <text
          x={x + 6}
          y={y + 18}
          fill={isLeaf ? "#0f172a" : "#fff"}
          fontSize={isLeaf ? 11 : 13}
          fontWeight={isLeaf ? (isHovered ? 700 : 500) : 700}
          style={{ pointerEvents: "none", transition: "font-weight 120ms" }}
        >
          {name.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7) - 1) + "…" : name}
        </text>
      )}
      {isLeaf && width > 80 && height > 44 && (
        <text x={x + 6} y={y + 34} fill="#0f172a" fontSize={10} style={{ pointerEvents: "none" }}>
          {fmtBigFCFA(size || 0)} · {fmtPct(perf ?? null)}
        </text>
      )}
    </g>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function FCPMarketView(props: Props) {
  const {
    refQuarter,
    latestVLGlobal,
    stalenessCutoff,
    totalAUM,
    totalFundsAtRef,
    totalManagers,
    cards,
    cardsAtRef,
    categoryStats,
    aumTimeline,
    heatmap,
  } = props;

  // Treemap et cartes catégories : YTD figé (snapshot global du marché)
  const TREEMAP_PERIOD: PeriodKey = "ytd";
  const router = useRouter();

  // Hover du treemap (pour effet visuel + tooltip)
  const [hoveredFundId, setHoveredFundId] = useState<string | null>(null);

  // États LOCAUX au tableau de classement (n'affectent rien d'autre)
  const [rankPeriod, setRankPeriod] = useState<PeriodKey>("ytd");
  const [rankCategory, setRankCategory] = useState<string>("all");

  // === Pool éligible : avec AUM au refDate ET non stale ===
  const eligibleCards = useMemo(
    () => cardsAtRef.filter((c) => !c.isStale),
    [cardsAtRef]
  );

  // === Treemap (perf YTD figée) ===
  const treemapData = useMemo(() => {
    const byCat = new Map<string, FundCard[]>();
    for (const c of cardsAtRef) {
      const list = byCat.get(c.categorieAtRef) || [];
      list.push(c);
      byCat.set(c.categorieAtRef, list);
    }
    const out: Array<{ name: string; size: number; children: Array<{ name: string; size: number; perf: number | null; fundId: string; categorie: string }> }> = [];
    for (const [cat, list] of byCat) {
      const totalCat = list.reduce((s, c) => s + (c.aumAtRef ?? 0), 0);
      out.push({
        name: cat,
        size: totalCat,
        children: list
          .filter((c) => (c.aumAtRef ?? 0) > 0)
          .map((c) => ({
            name: c.nom,
            size: c.aumAtRef as number,
            perf: c.perf[TREEMAP_PERIOD],
            fundId: c.id,
            categorie: c.categorieAtRef,
          }))
          .sort((a, b) => b.size - a.size),
      });
    }
    out.sort((a, b) => b.size - a.size);
    return out;
  }, [cardsAtRef]);

  // === Classement unique : un seul tableau filtrable par période + catégorie ===
  const rankingTable = useMemo(() => {
    const scope = rankCategory === "all"
      ? eligibleCards
      : eligibleCards.filter((c) => c.categorieAtRef === rankCategory);
    return scope
      .filter((c) => c.perf[rankPeriod] !== null)
      .sort((a, b) => (b.perf[rankPeriod] as number) - (a.perf[rankPeriod] as number));
  }, [eligibleCards, rankCategory, rankPeriod]);

  // === Heatmap : derniers trimestres ===
  const heatmapDates = useMemo(
    () => Array.from(new Set(heatmap.map((h) => h.date))).sort(),
    [heatmap]
  );
  const heatmapCats = useMemo(
    () => Array.from(new Set(heatmap.map((h) => h.categorie))),
    [heatmap]
  );
  const heatmapMap = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const h of heatmap) m.set(`${h.date}__${h.categorie}`, h.perf);
    return m;
  }, [heatmap]);
  const visibleDates = heatmapDates.slice(-8);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      {/* === HEADER === */}
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-wider text-slate-500">Marchés UEMOA</p>
        <h1 className="text-3xl font-bold text-slate-900">FCP / OPCVM</h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          Performances et structure du marché des organismes de placement collectif UEMOA. Encours
          arrêté à la dernière publication trimestrielle ({fmtDateFR(refQuarter)}). Performances
          calculées par catégorie de FCP, fonds dont la dernière VL date de plus de 15 jours
          avant {fmtDateFR(latestVLGlobal)} exclus du classement.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href="/outils/screener-fcp"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-700 text-white hover:bg-blue-800"
          >
            🔍 Screener FCP
          </Link>
          <Link
            href="/sgp"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:border-slate-400"
          >
            Sociétés de gestion
          </Link>
          <Link
            href="/fcp/categories"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:border-slate-400"
          >
            OPC
          </Link>
        </div>
      </header>

      {/* === KPI BAR === */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          label="Encours total"
          value={fmtBigFCFA(totalAUM) + " FCFA"}
          sub={`au ${fmtDateFR(refQuarter)} · ponctuel`}
        />
        <KPI
          label="Fonds publiant"
          value={String(totalFundsAtRef)}
          sub={`${totalManagers} sociétés de gestion à cette date`}
        />
        <KPI
          label="Catégories"
          value={String(categoryStats.length)}
          sub="Obligataire · Monétaire · Diversifié · Actions · Non coté"
        />
        <KPI
          label="Référence VL"
          value={fmtDateFR(latestVLGlobal)}
          sub={`exclusion si VL < ${fmtDateFR(stalenessCutoff)}`}
        />
      </section>

      {/* === CARDS CATEGORIE (clickables, médiane YTD) === */}
      <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {categoryStats.map((c) => (
          <Link
            key={c.categorie}
            href={`/fcp/categorie/${CATEGORY_SLUG[c.categorie] || ""}`}
            className="block p-4 rounded-lg border border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm transition"
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: CATEGORY_COLORS[c.categorie] || "#94a3b8" }}
              />
              <span className="text-xs font-semibold text-slate-700">{c.categorie}</span>
            </div>
            <div className="text-lg font-bold text-slate-900">{fmtBigFCFA(c.aumAtRef)}</div>
            <div className="text-xs text-slate-500 mt-1">
              {c.nbFundsAtRef} fonds · médiane YTD{" "}
              {fmtPct(c.perfMedianByPeriod[TREEMAP_PERIOD])}
            </div>
          </Link>
        ))}
      </section>

      {/* === TREEMAP === */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Cartographie de l&apos;encours</h2>
            <p className="text-xs text-slate-500">
              Taille = AUM au {fmtDateFR(refQuarter)} · couleur = perf YTD
            </p>
          </div>
          <span className="text-xs text-slate-400">
            {totalFundsAtRef} fonds · {fmtBigFCFA(totalAUM)} FCFA
          </span>
        </div>
        <div style={{ width: "100%", height: 460 }}>
          <ResponsiveContainer>
            <Treemap
              data={treemapData}
              dataKey="size"
              stroke="#fff"
              content={(p: unknown) => (
                <TreemapNodeContent
                  {...(p as TreemapContentProps)}
                  hoveredFundId={hoveredFundId}
                  onHover={setHoveredFundId}
                  onSelect={(id) => router.push(`/fcp/${id}`)}
                />
              )}
            />
          </ResponsiveContainer>
        </div>
      </section>

      {/* === STACKED AREA === */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Évolution de l&apos;encours par catégorie de FCP
          </h2>
          <p className="text-xs text-slate-500">
            Empilement trimestriel — révèle les rotations entre catégories
          </p>
        </div>
        <div style={{ width: "100%", height: 360 }}>
          <ResponsiveContainer>
            <AreaChart data={aumTimeline}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d) => String(d).slice(0, 7)}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => fmtBigFCFA(Number(v))}
                width={70}
              />
              <Tooltip
                formatter={(v) => fmtBigFCFA(Number(v)) + " FCFA"}
                labelFormatter={(d) => fmtDateFR(String(d))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {Object.keys(CATEGORY_COLORS).map((cat) => (
                <Area
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stackId="1"
                  stroke={CATEGORY_COLORS[cat]}
                  fill={CATEGORY_COLORS[cat]}
                  fillOpacity={0.75}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* === CLASSEMENT (un seul tableau filtrable) === */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Classement des fonds</h2>
          <p className="text-xs text-slate-500">
            Tri par performance · fonds avec dernière VL ≥ {fmtDateFR(stalenessCutoff)} (sinon exclus)
          </p>
        </div>

        {/* Filtres : juste au-dessus du tableau, n'affectent que celui-ci */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Période
            </span>
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
              {PERIOD_ORDER.map((p) => (
                <button
                  key={p}
                  onClick={() => setRankPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium transition ${
                    rankPeriod === p
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Catégorie
            </span>
            <select
              value={rankCategory}
              onChange={(e) => setRankCategory(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700"
            >
              <option value="all">Toutes</option>
              {categoryStats.map((c) => (
                <option key={c.categorie} value={c.categorie}>
                  {c.categorie}
                </option>
              ))}
            </select>
          </div>
          <div className="md:ml-auto text-xs text-slate-500">
            {rankingTable.length} fonds classés · {cardsAtRef.length - eligibleCards.length} exclus
            (VL stale)
          </div>
        </div>

        {/* Tableau unique */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 w-12">#</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">Fonds</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 hidden md:table-cell">
                  Société de gestion
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 hidden lg:table-cell">
                  Catégorie
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600 hidden md:table-cell">
                  AUM
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600 hidden sm:table-cell">
                  Dernière VL
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                  Perf {PERIOD_LABEL[rankPeriod].toLowerCase()}
                </th>
              </tr>
            </thead>
            <tbody>
              {rankingTable.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                    Aucun fonds éligible pour ce filtre.
                  </td>
                </tr>
              )}
              {rankingTable.map((c, i) => {
                const v = c.perf[rankPeriod];
                return (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs font-bold text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/fcp/${c.id}`}
                        className="text-sm font-medium text-slate-900 hover:underline"
                      >
                        {c.nom}
                      </Link>
                      <div className="text-[11px] text-slate-500 md:hidden">
                        <Link
                          href={`/sgp/${managerSlug(c.gestionnaire)}`}
                          className="hover:underline"
                        >
                          {c.gestionnaire}
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 hidden md:table-cell">
                      <Link
                        href={`/sgp/${managerSlug(c.gestionnaire)}`}
                        className="hover:underline"
                      >
                        {c.gestionnaire}
                      </Link>
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ background: CATEGORY_COLORS[c.categorieAtRef] || "#94a3b8" }}
                        />
                        {c.categorieAtRef}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-slate-700 tabular-nums hidden md:table-cell">
                      {fmtBigFCFA(c.aumAtRef ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-slate-500 hidden sm:table-cell">
                      {fmtDateFR(c.latestVLDate)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right text-sm font-bold tabular-nums ${
                        v !== null && v >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {fmtPct(v, 2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* === HEATMAP === */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 overflow-x-auto">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Performance trimestrielle médiane par catégorie
          </h2>
          <p className="text-xs text-slate-500">
            Médiane des fonds de chaque catégorie sur le trimestre — quelle catégorie a marché quand
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left text-xs font-semibold text-slate-600 px-2 py-2 sticky left-0 bg-white">
                Catégorie
              </th>
              {visibleDates.map((d) => (
                <th
                  key={d}
                  className="text-xs font-semibold text-slate-600 px-2 py-2 whitespace-nowrap"
                >
                  {d.slice(0, 7)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmapCats.map((cat) => (
              <tr key={cat}>
                <td className="text-xs font-medium text-slate-800 px-2 py-1.5 whitespace-nowrap sticky left-0 bg-white">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: CATEGORY_COLORS[cat] || "#94a3b8" }}
                    />
                    {cat}
                  </span>
                </td>
                {visibleDates.map((d) => {
                  const v = heatmapMap.get(`${d}__${cat}`) ?? null;
                  return (
                    <td
                      key={d}
                      className="px-1.5 py-1.5 text-center text-xs font-medium"
                      style={{ background: perfColor(v), color: "#0f172a", minWidth: 70 }}
                    >
                      {v === null ? "—" : fmtPct(v, 1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-slate-400">
        Source : publications BRVM / sociétés de gestion UEMOA. Encours ponctuel à la date de
        publication trimestrielle (non cumulatif). Les indicateurs de risque (volatilité, Sharpe,
        drawdown) ne sont volontairement pas calculés : la fréquence de publication des VL est
        hétérogène entre fonds, ces métriques ne refléteraient pas la réalité.
      </p>
    </main>
  );
}

// ==========================================
// SOUS-COMPOSANTS
// ==========================================
function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-4 rounded-lg border border-slate-200 bg-white">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}


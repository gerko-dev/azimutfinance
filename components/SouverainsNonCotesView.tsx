"use client";

import {
  useState,
  useMemo,
  useDeferredValue,
  useCallback,
  memo,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Line,
} from "recharts";
import type {
  SovereignBondLite,
  EmissionUMOAFuture,
  EmissionUMOAPlanned,
} from "@/lib/listedBondsTypes";
import type { UserRole } from "@/lib/auth/userRole";
import CountryFlag from "./CountryFlag";
import MemberGateDialog from "./MemberGateDialog";

const PAGE_SIZE = 50;

// === HELPERS FORMATAGE ===
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

type Props = {
  bonds: SovereignBondLite[];
  stats: {
    totalBonds: number;
    totalBAT: number;
    totalOAT: number;
    totalVolume: number;
    avgYield: number;
    avgMaturity: number;
    volumeOAT: number;
    volumeBAT: number;
    avgYieldOAT: number;
    avgYieldBAT: number;
    avgMaturityOAT: number;
    avgMaturityBAT: number;
    byCountry: Record<string, number>;
    volumeByCountry: Record<string, number>;
  };
  upcoming: EmissionUMOAFuture[];
  planned: EmissionUMOAPlanned[];
  userRole: UserRole;
};

type SortKey =
  | "country"
  | "maturity"
  | "lastYield"
  | "outstandingEstimate"
  | "lastIssueDate"
  | "nbRounds";
type SortOrder = "asc" | "desc";

// Couleurs par pays
const countryColors: Record<string, string> = {
  CI: "#2563eb",
  SN: "#16a34a",
  BF: "#9333ea",
  ML: "#ea580c",
  BJ: "#0891b2",
  TG: "#db2777",
  NE: "#ca8a04",
  GW: "#6b7280",
};

export default function SouverainsNonCotesView({
  bonds,
  stats,
  upcoming,
  planned,
  userRole,
}: Props) {
  const isPremium = userRole === "premium" || userRole === "pro";
  const [curveGateOpen, setCurveGateOpen] = useState(false);
  // === ETATS ===
  const [search, setSearch] = useState("");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDuration, setFilterDuration] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastIssueDate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // === VALEURS DEFEREES (React 18) ===
  // L'input reste instantane, le tableau se met a jour en arriere-plan
  const deferredSearch = useDeferredValue(search);
  const deferredCountry = useDeferredValue(filterCountry);
  const deferredType = useDeferredValue(filterType);
  const deferredDuration = useDeferredValue(filterDuration);

  // Filtrage + tri
  const processedBonds = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    let filtered = bonds;

    if (
      q ||
      deferredCountry !== "all" ||
      deferredType !== "all" ||
      deferredDuration !== "all"
    ) {
      filtered = bonds.filter((b) => {
        if (q) {
          if (
            !b.isin.toLowerCase().includes(q) &&
            !b.country.toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        if (deferredCountry !== "all" && b.country !== deferredCountry) return false;
        if (deferredType !== "all" && b.type !== deferredType) return false;
        if (deferredDuration !== "all") {
          const y = b.maturity;
          if (deferredDuration === "0-2" && (y < 0 || y > 2)) return false;
          if (deferredDuration === "2-5" && (y <= 2 || y > 5)) return false;
          if (deferredDuration === "5-10" && (y <= 5 || y > 10)) return false;
          if (deferredDuration === "10+" && y <= 10) return false;
        }
        return true;
      });
    }

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "country":
          cmp = a.country.localeCompare(b.country);
          break;
        case "maturity":
          cmp = a.maturity - b.maturity;
          break;
        case "lastYield":
          cmp = a.lastYield - b.lastYield;
          break;
        case "outstandingEstimate":
          cmp = a.outstandingEstimate - b.outstandingEstimate;
          break;
        case "lastIssueDate":
          cmp = a.lastTradeDate.localeCompare(b.lastTradeDate);
          break;
        case "nbRounds":
          cmp = a.nbRounds - b.nbRounds;
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [
    bonds,
    deferredSearch,
    deferredCountry,
    deferredType,
    deferredDuration,
    sortKey,
    sortOrder,
  ]);

  // Indicateur visuel : tableau en cours de mise a jour
  const isFiltering =
    search !== deferredSearch ||
    filterCountry !== deferredCountry ||
    filterType !== deferredType ||
    filterDuration !== deferredDuration;

  // Pagination
  const totalPages = Math.ceil(processedBonds.length / PAGE_SIZE);
  const pagedBonds = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return processedBonds.slice(start, start + PAGE_SIZE);
  }, [processedBonds, currentPage]);

  // Reset de la pagination quand les filtres déférés changent.
  // Pattern "ajuster un state pendant le render" recommandé par React,
  // qui évite le useEffect+setState cascadant.
  const filtersKey = `${deferredSearch}|${deferredCountry}|${deferredType}|${deferredDuration}`;
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey);
  if (prevFiltersKey !== filtersKey) {
    setPrevFiltersKey(filtersKey);
    setCurrentPage(1);
  }

  // Dataset unifie pour la courbe des taux souveraine UEMOA :
  // un point = un bond (= un ISIN, derniere adjudication). Le type, le pays
  // et la date sont conserves pour les filtres / la forme / la couleur.
  const sovereignCurveData = useMemo(() => {
    return bonds
      .filter((b) => b.maturity > 0 && b.lastYield > 0)
      .map((b) => ({
        x: b.maturity,
        y: b.lastYield * 100,
        type: b.type,
        country: b.country,
        isin: b.isin,
        amount: b.totalAmount,
        nbRounds: b.nbRounds,
        date: b.lastTradeDate,
      }));
  }, [bonds]);

  const recentAdjudications = useMemo(() => {
    // Tri par date d'OPERATION (adjudication) decroissante, pas par date
    // de valeur — la date d'adjudication est celle de la mise aux enchères.
    return [...bonds]
      .sort((a, b) => b.lastTradeDate.localeCompare(a.lastTradeDate))
      .slice(0, 10);
  }, [bonds]);

  // useCallback : référence stable tant que sortKey ne change pas — permet
  // au tableau memo de sauter le re-render sur chaque frappe de recherche.
  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortOrder("desc");
      }
    },
    [sortKey]
  );

  // Mémoisé : sinon Object.keys().sort() retourne une nouvelle référence
  // à chaque render et casse le memo du chart en aval.
  const availableCountries = useMemo(
    () => Object.keys(stats.byCountry).sort(),
    [stats.byCountry]
  );

  return (
    <>
      {/* HERO */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            <Link href="/" className="hover:text-white transition">
              Marchés
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <span className="text-slate-200">Souverains non cotés</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-white">
            Souverains non cotés UEMOA
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            Obligations (OAT) et bons (BAT) du Trésor des 8 États UEMOA émis via
            UMOA-Titres.
          </p>

          {/* KPIs : valeur principale = total marché ; split OAT/BAT en
              sous-lignes pour ne pas multiplier les cartes. Tous les montants
              sont stockes en millions FCFA cote loader → on multiplie par 1e6
              avant formatBigFCFA. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-6">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Titres en circulation</div>
              <div className="text-2xl md:text-3xl font-semibold text-blue-900">
                {stats.totalBonds}
              </div>
              <div className="text-[11px] text-slate-500 mt-2 grid grid-cols-2 gap-1">
                <span>
                  OAT <b className="text-slate-800">{stats.totalOAT}</b>
                </span>
                <span>
                  BAT <b className="text-slate-800">{stats.totalBAT}</b>
                </span>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Encours UEMOA</div>
              <div className="text-2xl md:text-3xl font-semibold">
                {formatBigFCFA(stats.totalVolume * 1e6)}
              </div>
              <div className="text-[11px] text-slate-500 mt-2 grid grid-cols-2 gap-1">
                <span>
                  OAT{" "}
                  <b className="text-slate-800">
                    {formatBigFCFA(stats.volumeOAT * 1e6)}
                  </b>
                </span>
                <span>
                  BAT{" "}
                  <b className="text-slate-800">
                    {formatBigFCFA(stats.volumeBAT * 1e6)}
                  </b>
                </span>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Taux moyen pondéré</div>
              <div className="text-2xl md:text-3xl font-semibold text-green-700">
                {(stats.avgYield * 100).toFixed(2).replace(".", ",")}%
              </div>
              <div className="text-[11px] text-slate-500 mt-2 grid grid-cols-2 gap-1">
                <span>
                  OAT{" "}
                  <b className="text-slate-800">
                    {(stats.avgYieldOAT * 100).toFixed(2).replace(".", ",")}%
                  </b>
                </span>
                <span>
                  BAT{" "}
                  <b className="text-slate-800">
                    {(stats.avgYieldBAT * 100).toFixed(2).replace(".", ",")}%
                  </b>
                </span>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Maturité résiduelle</div>
              <div className="text-2xl md:text-3xl font-semibold">
                {stats.avgMaturity.toFixed(1).replace(".", ",")} ans
              </div>
              <div className="text-[11px] text-slate-500 mt-2 grid grid-cols-2 gap-1">
                <span>
                  OAT{" "}
                  <b className="text-slate-800">
                    {stats.avgMaturityOAT.toFixed(1).replace(".", ",")} ans
                  </b>
                </span>
                <span>
                  BAT{" "}
                  <b className="text-slate-800">
                    {stats.avgMaturityBAT.toFixed(1).replace(".", ",")} ans
                  </b>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* COURBE DES TAUX UNIFIEE — header + badge "EXCLUSIVITÉ AZIMUT"
            toujours visibles. Filtres + chart floutes pour visiteurs / membres
            avec CTA Premium au centre. */}
        <SovereignYieldCurveSection
          curveData={sovereignCurveData}
          availableCountries={availableCountries}
          locked={!isPremium}
          onUnlock={() => setCurveGateOpen(true)}
        />

        {/* CALENDRIER UMOA-Titres — émissions à venir + planifiées */}
        <UmoaCalendarSection upcoming={upcoming} planned={planned} />

        {/* DERNIERES ADJUDICATIONS — memo : 10 lignes mais avec CountryFlag SVG, on évite les redraws */}
        <RecentAdjudicationsSection bonds={recentAdjudications} />

        {/* TABLEAU PAGINE — memo + useDeferredValue : la frappe ne déclenche pas le re-render synchrone */}
        <SovereignBondsTableSection
          pagedBonds={pagedBonds}
          processedBondsLength={processedBonds.length}
          totalBondsLength={bonds.length}
          isFiltering={isFiltering}
          search={search}
          onSearchChange={setSearch}
          filterCountry={filterCountry}
          onFilterCountryChange={setFilterCountry}
          filterType={filterType}
          onFilterTypeChange={setFilterType}
          filterDuration={filterDuration}
          onFilterDurationChange={setFilterDuration}
          sortKey={sortKey}
          sortOrder={sortOrder}
          onToggleSort={toggleSort}
          availableCountries={availableCountries}
          countryCounts={stats.byCountry}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </main>

      <MemberGateDialog
        open={curveGateOpen}
        onClose={() => setCurveGateOpen(false)}
        tier="premium"
        title="Courbe des taux souveraine — réservée Premium"
        description="La courbe des rendements BAT/OAT UEMOA avec filtres et régression actuarielle est disponible avec l'abonnement Premium."
      />
    </>
  );
}

// ============================================================
// COMPOSANTS MEMOISES — découplent les blocs lourds (charts Recharts,
// tableaux ~50 lignes) des re-renders synchrones provoqués par chaque
// frappe dans la barre de recherche.
// ============================================================

type SovereignCurvePoint = {
  x: number;
  y: number;
  type: "BAT" | "OAT";
  country: string;
  isin: string;
  amount: number;
  nbRounds: number;
  date: string;
};

type SovereignYieldCurveProps = {
  curveData: SovereignCurvePoint[];
  availableCountries: string[];
  /** Si true, on floute filtres + chart et on superpose un CTA Premium.
   *  Le header (titre + badge "EXCLUSIVITÉ AZIMUT") reste toujours visible. */
  locked: boolean;
  onUnlock: () => void;
};

const SovereignYieldCurveSection = memo(function SovereignYieldCurveSection({
  curveData,
  availableCountries,
  locked,
  onUnlock,
}: SovereignYieldCurveProps) {
  // Filtres independants. Defaults choisis pour montrer l'image la plus utile
  // au premier affichage : OAT (vraies courbes de taux), 12 derniers mois.
  const [filterType, setFilterType] = useState<"all" | "BAT" | "OAT">("OAT");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<
    "3m" | "6m" | "1y" | "3y" | "all"
  >("1y");
  const [showRegression, setShowRegression] = useState<boolean>(true);
  const [xScaleLog, setXScaleLog] = useState<boolean>(false);

  // Cut-off date pour la periode (en ms).
  const periodCutoff = useMemo(() => {
    const now = Date.now();
    const days =
      filterPeriod === "3m"
        ? 92
        : filterPeriod === "6m"
          ? 183
          : filterPeriod === "1y"
            ? 365
            : filterPeriod === "3y"
              ? 365 * 3
              : Number.POSITIVE_INFINITY;
    return now - days * 24 * 60 * 60 * 1000;
  }, [filterPeriod]);

  const filteredData = useMemo(() => {
    return curveData.filter((d) => {
      if (filterType !== "all" && d.type !== filterType) return false;
      if (filterCountry !== "all" && d.country !== filterCountry) return false;
      if (filterPeriod !== "all") {
        const t = new Date(d.date).getTime();
        if (!Number.isFinite(t) || t < periodCutoff) return false;
      }
      return true;
    });
  }, [curveData, filterType, filterCountry, filterPeriod, periodCutoff]);

  // Regression linéaire en y = a + b * log(x). Cette forme épouse bien la
  // courbe des taux souveraine (croissance plus lente sur les longues
  // maturités). On la calcule sur l'échantillon filtré uniquement.
  const regressionLine = useMemo(() => {
    if (!showRegression || filteredData.length < 3) return null;
    const n = filteredData.length;
    let sx = 0,
      sy = 0,
      sxx = 0,
      sxy = 0;
    for (const p of filteredData) {
      const lx = Math.log(Math.max(p.x, 0.01));
      sx += lx;
      sy += p.y;
      sxx += lx * lx;
      sxy += lx * p.y;
    }
    const denom = n * sxx - sx * sx;
    if (denom === 0) return null;
    const b = (n * sxy - sx * sy) / denom;
    const a = (sy - b * sx) / n;
    const xMin = Math.min(...filteredData.map((p) => p.x));
    const xMax = Math.max(...filteredData.map((p) => p.x));
    // 30 points entre xMin et xMax pour dessiner la courbe lisse.
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= 30; i++) {
      const x = xMin + (xMax - xMin) * (i / 30);
      points.push({ x, y: a + b * Math.log(Math.max(x, 0.01)) });
    }
    return { points, a, b };
  }, [showRegression, filteredData]);

  // Tick generator adaptatif selon la plage de maturite affichée.
  const xTicks = useMemo(() => {
    if (filteredData.length === 0) return undefined;
    const maxX = Math.max(...filteredData.map((p) => p.x));
    if (maxX <= 2) return [0, 0.25, 0.5, 1, 1.5, 2];
    if (maxX <= 5) return [0, 0.5, 1, 2, 3, 5];
    if (maxX <= 12) return [0, 1, 2, 3, 5, 7, 10];
    if (maxX <= 20) return [0, 1, 3, 5, 7, 10, 15, 20];
    return [0, 1, 3, 5, 10, 15, 20, 25, 30];
  }, [filteredData]);

  const xTickFormatter = (v: number) => {
    if (v === 0) return "0";
    if (v < 1) return `${Math.round(v * 12)}m`;
    if (v === Math.floor(v)) return `${v}a`;
    return `${v.toFixed(1).replace(".", ",")}a`;
  };

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      {/* HEADER : toujours visible, meme verrouille */}
      <div className="flex justify-between items-start flex-wrap gap-2 mb-1">
        <h2 className="text-lg md:text-xl font-semibold">
          📊 Courbe des taux souveraine UEMOA
        </h2>
        <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
          EXCLUSIVITÉ AZIMUT
        </span>
      </div>
      <p className="text-xs md:text-sm text-slate-600 mb-4">
        Chaque point = un titre à sa dernière adjudication. Couleur = pays,
        forme = type (◯ OAT, △ BAT).
      </p>

      {/* CONTENU : floute pour visiteurs / membres */}
      <div className="relative">
        <div
          className={
            locked ? "blur-[3px] pointer-events-none select-none" : ""
          }
          aria-hidden={locked ? true : undefined}
        >
      {/* FILTRES */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4 p-3 bg-slate-50 rounded-md">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
            Type
          </label>
          <select
            value={filterType}
            onChange={(e) =>
              setFilterType(e.target.value as "all" | "BAT" | "OAT")
            }
            className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">Tous (BAT + OAT)</option>
            <option value="OAT">OAT — moyen/long terme</option>
            <option value="BAT">BAT — court terme</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
            Pays
          </label>
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">Tous</option>
            {availableCountries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
            Période d&apos;émission
          </label>
          <select
            value={filterPeriod}
            onChange={(e) =>
              setFilterPeriod(
                e.target.value as "3m" | "6m" | "1y" | "3y" | "all"
              )
            }
            className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="3m">3 derniers mois</option>
            <option value="6m">6 derniers mois</option>
            <option value="1y">12 derniers mois</option>
            <option value="3y">3 dernières années</option>
            <option value="all">Toutes</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium">
            Affichage
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showRegression}
              onChange={(e) => setShowRegression(e.target.checked)}
              className="rounded"
            />
            Courbe moyenne (régression)
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={xScaleLog}
              onChange={(e) => setXScaleLog(e.target.checked)}
              className="rounded"
            />
            Échelle X log
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-3">
        <span>
          <b className="text-slate-900">{filteredData.length}</b> titre
          {filteredData.length > 1 ? "s" : ""} affiché
          {filteredData.length > 1 ? "s" : ""}
        </span>
        {regressionLine && (
          <>
            <span>·</span>
            <span>
              Pente régression :{" "}
              <b className="text-slate-900">
                {regressionLine.b > 0 ? "+" : ""}
                {regressionLine.b.toFixed(2).replace(".", ",")} pt/log(an)
              </b>
            </span>
          </>
        )}
      </div>

      <div className="h-72 md:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              dataKey="x"
              scale={xScaleLog ? "log" : "linear"}
              domain={xScaleLog ? ["auto", "auto"] : [0, "dataMax + 0.5"]}
              ticks={xScaleLog ? undefined : xTicks}
              tickFormatter={xTickFormatter}
              allowDataOverflow={false}
              stroke="#94a3b8"
              fontSize={11}
              label={{
                value: "Maturité résiduelle",
                position: "bottom",
                offset: 15,
                style: { fontSize: 12, fill: "#64748b" },
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              unit="%"
              stroke="#94a3b8"
              fontSize={11}
              domain={[
                (dataMin: number) => Math.max(0, Math.floor(dataMin - 0.5)),
                (dataMax: number) => Math.ceil(dataMax + 0.5),
              ]}
              label={{
                value: "Taux (%)",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "#64748b" },
              }}
            />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const scatterEntry = payload.find(
                  (p) =>
                    p.payload &&
                    typeof p.payload.country === "string" &&
                    p.payload.country !== undefined &&
                    p.payload.isin !== undefined
                );
                if (!scatterEntry) return null;
                const d = scatterEntry.payload as SovereignCurvePoint;
                const mois = Math.round(d.x * 12);
                return (
                  <div className="bg-white border border-slate-200 rounded-md shadow-md p-3 text-xs">
                    <div className="font-medium mb-1">
                      {d.type} {d.country}
                    </div>
                    {d.isin && (
                      <div className="font-mono text-slate-500">{d.isin}</div>
                    )}
                    <div className="mt-1">
                      Maturité :{" "}
                      <b>
                        {d.x < 1
                          ? `${mois} mois`
                          : `${d.x.toFixed(1).replace(".", ",")} ans`}
                      </b>
                    </div>
                    <div>
                      Taux : <b>{d.y.toFixed(2).replace(".", ",")}%</b>
                    </div>
                    <div>
                      Montant cumulé : <b>{formatBigFCFA(d.amount)}</b>
                    </div>
                    {d.type === "OAT" && (
                      <div>
                        Ré-abondements : <b>{d.nbRounds}</b>
                      </div>
                    )}
                    <div className="text-slate-400 mt-1">
                      Dernière adj : {formatDate(d.date)}
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              verticalAlign="top"
              height={28}
              wrapperStyle={{ fontSize: "11px" }}
            />

            {regressionLine && (
              <Line
                type="linear"
                dataKey="y"
                data={regressionLine.points}
                stroke="#64748b"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                legendType="plainline"
                name="Régression moyenne"
                isAnimationActive={false}
              />
            )}

            {/* Un Scatter par combinaison (pays × type) : couleur = pays,
                forme = type (◯ OAT / △ BAT). Custom shape function pour
                garantir le rendu distinct (les Cell children interferent
                avec le prop shape="..." string en Recharts 3). */}
            {availableCountries.flatMap((country) =>
              (["OAT", "BAT"] as const).map((type) => {
                const data = filteredData.filter(
                  (d) => d.country === country && d.type === type
                );
                if (data.length === 0) return null;
                const color = countryColors[country] || "#6b7280";
                const renderShape = (props: {
                  cx?: number;
                  cy?: number;
                  fill?: string;
                }) => {
                  const { cx, cy } = props;
                  if (typeof cx !== "number" || typeof cy !== "number") {
                    // Hors graphe (non visible) — on retourne un SVG vide
                    // mais valide (Recharts s'attend a un SVGElement).
                    return <g />;
                  }
                  const f = props.fill ?? color;
                  if (type === "BAT") {
                    // Triangle isocele pointe en haut, base ~12px, hauteur ~10px
                    const r = 6;
                    return (
                      <polygon
                        points={`${cx},${cy - r} ${cx + r},${cy + r - 1} ${cx - r},${cy + r - 1}`}
                        fill={f}
                        stroke="white"
                        strokeWidth={0.5}
                      />
                    );
                  }
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={f}
                      stroke="white"
                      strokeWidth={0.5}
                    />
                  );
                };
                return (
                  <Scatter
                    key={`${country}-${type}`}
                    name={`${country} ${type}`}
                    data={data}
                    fill={color}
                    legendType={type === "BAT" ? "triangle" : "circle"}
                    shape={renderShape}
                  />
                );
              })
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
        </div>
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
            <button
              type="button"
              onClick={onUnlock}
              className="bg-white rounded-lg shadow-xl border border-amber-200 max-w-md w-full p-5 md:p-6 pointer-events-auto text-left hover:border-amber-300 transition"
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl shrink-0" aria-hidden>
                  ⭐
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 mb-1">
                    🔒 Réservé Premium
                  </div>
                  <h4 className="text-base md:text-lg font-semibold text-slate-900">
                    Courbe des taux souveraine UEMOA
                  </h4>
                  <p className="text-sm text-slate-600 mt-1">
                    Visualisez la courbe complète des rendements BAT/OAT
                    des 8 émetteurs UEMOA avec filtres (type, pays, période)
                    et régression moyenne calibrée sur votre sélection.
                  </p>
                </div>
              </div>
            </button>
          </div>
        )}
      </div>
    </section>
  );
});

// === DERNIERES ADJUDICATIONS ===
type RecentAdjudicationsProps = {
  bonds: SovereignBondLite[];
};

const RecentAdjudicationsSection = memo(function RecentAdjudicationsSection({
  bonds,
}: RecentAdjudicationsProps) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <h2 className="text-lg md:text-xl font-semibold mb-4">
        🔔 Dernières adjudications
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Pays</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">
                ISIN
              </th>
              <th className="text-right px-3 py-2 font-medium">Maturité</th>
              <th className="text-right px-3 py-2 font-medium">Montant</th>
              <th className="text-right px-3 py-2 font-medium">Taux</th>
            </tr>
          </thead>
          <tbody>
            {bonds.map((b) => (
              <tr
                key={b.id}
                className="border-b border-slate-100 hover:bg-blue-50/30 transition"
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  {b.lastUrl ? (
                    <a
                      href={b.lastUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 hover:underline inline-flex items-center gap-1"
                      title="Voir la fiche UMOA-Titres"
                    >
                      {formatDate(b.lastTradeDate)}
                      <span aria-hidden className="text-[10px]">↗</span>
                    </a>
                  ) : (
                    formatDate(b.lastTradeDate)
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CountryFlag country={b.country} size={18} />
                    <span>{b.country}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      b.type === "OAT"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {b.type}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs hidden md:table-cell">
                  {b.isin || "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {b.maturity.toFixed(1).replace(".", ",")} ans
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  {formatBigFCFA(b.totalAmount * 1e6)}
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {(b.lastYield * 100).toFixed(2).replace(".", ",")}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
});

// === TABLEAU PAGINÉ ===
type SovereignBondsTableProps = {
  pagedBonds: SovereignBondLite[];
  processedBondsLength: number;
  totalBondsLength: number;
  isFiltering: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  filterCountry: string;
  onFilterCountryChange: (v: string) => void;
  filterType: string;
  onFilterTypeChange: (v: string) => void;
  filterDuration: string;
  onFilterDurationChange: (v: string) => void;
  sortKey: SortKey;
  sortOrder: SortOrder;
  onToggleSort: (key: SortKey) => void;
  availableCountries: string[];
  countryCounts: Record<string, number>;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

const SovereignBondsTableSection = memo(function SovereignBondsTableSection({
  pagedBonds,
  processedBondsLength,
  totalBondsLength,
  isFiltering,
  search,
  onSearchChange,
  filterCountry,
  onFilterCountryChange,
  filterType,
  onFilterTypeChange,
  filterDuration,
  onFilterDurationChange,
  sortKey,
  sortOrder,
  onToggleSort,
  availableCountries,
  countryCounts,
  currentPage,
  totalPages,
  onPageChange,
}: SovereignBondsTableProps) {
  const router = useRouter();
  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-slate-300">↕</span>;
    return sortOrder === "asc" ? <span>↑</span> : <span>↓</span>;
  };

  return (
    <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="p-4 md:p-6 border-b border-slate-100">
        <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
          <h2 className="text-lg md:text-xl font-semibold">
            Tous les titres souverains
          </h2>
          <span className="text-xs text-slate-500 flex items-center gap-2">
            {isFiltering && (
              <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
            {processedBondsLength} résultat
            {processedBondsLength > 1 ? "s" : ""} sur {totalBondsLength}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Rechercher (ISIN, pays...)"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
          />
          <select
            value={filterCountry}
            onChange={(e) => onFilterCountryChange(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">Tous les pays</option>
            {availableCountries.map((c) => (
              <option key={c} value={c}>
                {c} ({countryCounts[c]})
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => onFilterTypeChange(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">OAT + BAT</option>
            <option value="OAT">OAT uniquement</option>
            <option value="BAT">BAT uniquement</option>
          </select>
          <select
            value={filterDuration}
            onChange={(e) => onFilterDurationChange(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">Toutes durées</option>
            <option value="0-2">0-2 ans (BAT)</option>
            <option value="2-5">2-5 ans</option>
            <option value="5-10">5-10 ans</option>
            <option value="10+">Plus de 10 ans</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
              <th className="text-left px-3 py-3 font-medium">
                <button
                  onClick={() => onToggleSort("country")}
                  className="flex items-center gap-1 hover:text-slate-900"
                >
                  Pays {sortIcon("country")}
                </button>
              </th>
              <th className="text-left px-3 py-3 font-medium">Type</th>
              <th className="text-left px-3 py-3 font-medium hidden md:table-cell">
                ISIN
              </th>
              <th className="text-right px-3 py-3 font-medium">
                <button
                  onClick={() => onToggleSort("maturity")}
                  className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                >
                  Maturité {sortIcon("maturity")}
                </button>
              </th>
              <th className="text-right px-3 py-3 font-medium">
                <button
                  onClick={() => onToggleSort("lastYield")}
                  className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                >
                  Dernier taux {sortIcon("lastYield")}
                </button>
              </th>
              <th className="text-right px-3 py-3 font-medium hidden md:table-cell">
                <button
                  onClick={() => onToggleSort("outstandingEstimate")}
                  className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                  title="Cash levé + swaps − rachats"
                >
                  Encours estimé {sortIcon("outstandingEstimate")}
                </button>
              </th>
              <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">
                <button
                  onClick={() => onToggleSort("nbRounds")}
                  className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                >
                  Rounds {sortIcon("nbRounds")}
                </button>
              </th>
              <th className="text-right px-3 py-3 font-medium">
                <button
                  onClick={() => onToggleSort("lastIssueDate")}
                  className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                >
                  Dernière adj {sortIcon("lastIssueDate")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {pagedBonds.map((b) => (
              <tr
                key={b.id}
                onClick={() => router.push(`/souverain/${encodeURIComponent(b.id)}`)}
                className="border-b border-slate-100 hover:bg-blue-50/40 cursor-pointer transition"
              >
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <CountryFlag country={b.country} size={18} />
                    <span>{b.country}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      b.type === "OAT"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {b.type}
                  </span>
                </td>
                <td className="px-3 py-3 font-mono text-xs hidden md:table-cell">
                  {b.isin || "—"}
                </td>
                <td className="px-3 py-3 text-right">
                  {b.maturity.toFixed(1).replace(".", ",")} ans
                </td>
                <td className="px-3 py-3 text-right font-medium">
                  {(b.lastYield * 100).toFixed(2).replace(".", ",")}%
                </td>
                <td className="px-3 py-3 text-right text-xs hidden md:table-cell">
                  {formatBigFCFA(b.outstandingEstimate)}
                </td>
                <td className="px-3 py-3 text-right hidden lg:table-cell">
                  {b.nbRounds > 1 ? (
                    <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                      ×{b.nbRounds}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">1</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right text-xs whitespace-nowrap">
                  {b.lastUrl ? (
                    <a
                      href={b.lastUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 hover:underline inline-flex items-center gap-1"
                      title="Voir la fiche UMOA-Titres"
                    >
                      {formatDate(b.lastTradeDate)}
                      <span aria-hidden className="text-[9px]">↗</span>
                    </a>
                  ) : (
                    formatDate(b.lastTradeDate)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {pagedBonds.length === 0 && (
          <div className="p-10 text-center text-slate-500">
            Aucun titre ne correspond à vos critères
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border-t border-slate-100 text-sm">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Précédent
          </button>
          <span className="text-slate-600">
            Page <b>{currentPage}</b> sur <b>{totalPages}</b> ·{" "}
            <span className="text-slate-400">
              ({(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, processedBondsLength)} sur{" "}
              {processedBondsLength})
            </span>
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Suivant →
          </button>
        </div>
      )}
    </section>
  );
});

// === CALENDRIER UMOA-Titres : émissions à venir + planifiées ===
// Source : data/umoa-emissions-a-venir.csv + data/umoa-emissions-planifiees.csv
// Mises a jour quotidiennes par le cron scrape-umoa-emissions (19h GMT).
type UmoaCalendarProps = {
  upcoming: EmissionUMOAFuture[];
  planned: EmissionUMOAPlanned[];
};

const UmoaCalendarSection = memo(function UmoaCalendarSection({
  upcoming,
  planned,
}: UmoaCalendarProps) {
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
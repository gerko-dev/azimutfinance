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
import type {
  SovereignBondLite,
  EmissionUMOAFuture,
  EmissionUMOAPlanned,
} from "@/lib/listedBondsTypes";
import type { UserRole } from "@/lib/auth/userRole";
import CountryFlag from "./CountryFlag";
import MemberGateDialog from "./MemberGateDialog";
import SovereignCalendar from "./SovereignCalendar";

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

  // Dataset unifie pour la courbe des taux souverains UEMOA :
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

  const curveCount = sovereignCurveData.length;

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
        {/* TROIS OUTILS DEDIES — meme structure que la page des obligations
            cotees. La courbe et les echeances avaient leur place ici en
            attendant d'avoir leur propre page ; les y laisser allongeait la
            page sans qu'on puisse les partager par lien. */}
        <section>
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-lg md:text-xl font-semibold">
              Outils sur le gisement souverain
            </h2>
            <span className="text-xs text-slate-500">
              3 outils Premium · courbe, écarts de taux, calendrier
            </span>
          </div>
          {/* Meme ordre que la section des obligations cotees : courbe,
              surveillance, calendrier. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <SovereignToolCard
              href="/marches/souverains-non-cotes/courbe-taux"
              accent="violet"
              title="Courbe des taux souverains"
              description="Taux d'adjudication BAT et OAT par maturité, comparables par pays ou par instrument."
              stat={`${curveCount} lignes cotées`}
              unlocked={isPremium}
            />
            <SovereignToolCard
              href="/marches/souverains-non-cotes/surveillance"
              accent="indigo"
              title="À surveiller"
              description="Lignes dont le taux s'écarte de leurs pairs à pays, instrument et maturité comparables."
              stat={`${bonds.length} lignes analysées`}
              unlocked={isPremium}
            />
            <SovereignToolCard
              href="/marches/souverains-non-cotes/calendrier"
              accent="emerald"
              title="Calendrier obligataire"
              description="Adjudications à venir et calendrier annuel publié par les agences."
              stat={`${upcoming.length} opérations annoncées`}
              unlocked={isPremium}
            />
          </div>
        </section>

        {/* CALENDRIER DES ADJUDICATIONS — le marche primaire a sa place sur la
            page principale : la carte « Calendrier obligataire » mene desormais
            a l'echeancier (coupons, amortissements, remboursements). */}
        <SovereignCalendar upcoming={upcoming} planned={planned} />

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
        title="Courbe des taux souverains — réservée Premium"
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

// Carte d'acces aux outils souverains. Meme grammaire visuelle que les
// teasers de la page des obligations cotees : barre de couleur en tete,
// badge d'acces, statistique de volumetrie.
const TOOL_ACCENT: Record<string, string> = {
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  indigo: "bg-indigo-500",
};

function SovereignToolCard({
  href,
  title,
  description,
  stat,
  accent,
  unlocked,
}: {
  href: string;
  title: string;
  description: string;
  stat: string;
  accent: keyof typeof TOOL_ACCENT;
  unlocked: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
    >
      <span
        className={`absolute inset-x-0 top-0 h-1 ${TOOL_ACCENT[accent]}`}
        aria-hidden
      />
      <div className="flex items-start justify-end mb-3">
        {unlocked ? (
          <span className="text-[10px] uppercase tracking-wider font-semibold bg-emerald-50 text-emerald-700 px-2 py-1 rounded">
            Inclus
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider font-semibold bg-amber-50 text-amber-800 px-2 py-1 rounded">
            Premium
          </span>
        )}
      </div>
      <h3 className="text-base md:text-lg font-semibold text-slate-900 mb-1">
        {title}
      </h3>
      <p className="text-xs md:text-sm text-slate-600 mb-3 flex-1">
        {description}
      </p>
      <div className="text-xs text-slate-500 mb-3 tabular-nums">{stat}</div>
      <div
        className={`text-sm font-medium ${
          unlocked
            ? "text-blue-700 group-hover:text-blue-900"
            : "text-amber-700 group-hover:text-amber-900"
        }`}
      >
        {unlocked ? "Ouvrir" : "Débloquer"} →
      </div>
    </Link>
  );
}

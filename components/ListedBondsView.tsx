"use client";

import { useState, useMemo, useDeferredValue, useCallback, memo } from "react";
import Link from "next/link";
import type {
  ListedBond,
  ListedBondPrice,
  ListedBondEvent,
  MarketStats,
} from "@/lib/listedBondsTypes";
import { getBondYTMFromLatest } from "@/lib/listedBondsTypes";
import type { UserRole } from "@/lib/auth/userRole";
import CountryFlag from "./CountryFlag";
import { bondHref, isBondMatured } from "@/lib/listedBondsTypes";

// === HELPERS DE FORMATAGE ===
function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatBigFCFA(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2) + " T FCFA";
  if (value >= 1e9) return (value / 1e9).toFixed(1) + " Mds FCFA";
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

// Carte KPI du hero : barre latérale colorée + icône + valeur tabular-nums.
// L'accent transmet une catégorisation visuelle (compte / encours / rendement…)
// sans surcharger le texte. Tous les KPI gardent la même typo et le même padding.
type KpiAccent = "blue" | "amber" | "emerald" | "violet" | "indigo" | "rose";

const KPI_ACCENT: Record<KpiAccent, { bar: string; chip: string }> = {
  blue: { bar: "bg-blue-500", chip: "bg-blue-50 text-blue-700" },
  amber: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-700" },
  emerald: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
  violet: { bar: "bg-violet-500", chip: "bg-violet-50 text-violet-700" },
  indigo: { bar: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700" },
  rose: { bar: "bg-rose-500", chip: "bg-rose-50 text-rose-700" },
};

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: string;
  accent: KpiAccent;
}) {
  const a = KPI_ACCENT[accent];
  return (
    <div className="relative bg-white rounded-lg border border-slate-200 p-4 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all">
      <span
        className={`absolute left-0 top-0 bottom-0 w-1 ${a.bar}`}
        aria-hidden
      />
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`flex items-center justify-center w-6 h-6 rounded-md text-sm ${a.chip}`}
          aria-hidden
        >
          {icon}
        </span>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
      <div className="text-2xl md:text-3xl font-semibold text-slate-900 tabular-nums">
        {value}
      </div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  );
}

// Carte teaser pour les sections Premium (courbe, surveiller, calendrier).
// Si l'utilisateur est Premium+, on affiche un CTA d'ouverture ; sinon, un
// cadenas bien visible et un CTA "Voir avec Premium". Le clic dans tous les
// cas mène à la page dédiée — qui gère elle-même la paywall server-side.
function TeaserCard({
  href,
  icon,
  title,
  description,
  stat,
  accent,
  unlocked,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  stat: string;
  accent: KpiAccent;
  unlocked: boolean;
}) {
  const a = KPI_ACCENT[accent];
  return (
    <Link
      href={href}
      className="group relative flex flex-col bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
    >
      <span
        className={`absolute inset-x-0 top-0 h-1 ${a.bar}`}
        aria-hidden
      />
      <div className="flex items-start justify-between mb-3">
        <span
          className={`flex items-center justify-center w-10 h-10 rounded-lg text-xl ${a.chip}`}
          aria-hidden
        >
          {icon}
        </span>
        {unlocked ? (
          <span className="text-[10px] uppercase tracking-wider font-semibold bg-emerald-50 text-emerald-700 px-2 py-1 rounded">
            ✓ Inclus
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider font-semibold bg-amber-50 text-amber-800 px-2 py-1 rounded inline-flex items-center gap-1">
            🔒 Premium
          </span>
        )}
      </div>
      <h3 className="text-base md:text-lg font-semibold text-slate-900 mb-1">
        {title}
      </h3>
      <p className="text-xs md:text-sm text-slate-600 mb-3 flex-1">{description}</p>
      <div className="text-xs text-slate-500 mb-3 tabular-nums">{stat}</div>
      <div
        className={`text-sm font-medium inline-flex items-center gap-1.5 ${
          unlocked
            ? "text-blue-700 group-hover:text-blue-900"
            : "text-amber-700 group-hover:text-amber-900"
        }`}
      >
        {unlocked ? "Ouvrir" : "Voir avec Premium"}
        <span aria-hidden>→</span>
      </div>
    </Link>
  );
}

type Props = {
  bonds: ListedBond[];
  prices: ListedBondPrice[];
  events: ListedBondEvent[];
  stats: MarketStats;
  userRole: UserRole;
};

type SortKey =
  | "name"
  | "couponRate"
  | "cleanPrice"
  | "maturity"
  | "ytm"
  | "outstanding";
type SortOrder = "asc" | "desc";

type EnrichedBond = ListedBond & {
  ytm: number;
  latestPrice: ListedBondPrice | null;
  maturityTime: number;
  /** Echeance passee : la ligne reste listee mais est signalee comme remboursee. */
  isMatured: boolean;
  searchHaystack: string;
};

export default function ListedBondsView({
  bonds,
  prices,
  events,
  stats,
  userRole,
}: Props) {
  const isPremium = userRole === "premium" || userRole === "pro";

  // === ETATS DE FILTRAGE (TABLEAU) ===
  const [search, setSearch] = useState("");
  // useDeferredValue : on laisse React garder l'input fluide et différer
  // le filtrage de la table à un rendu de moindre priorité.
  const deferredSearch = useDeferredValue(search);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterDuration, setFilterDuration] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("maturity");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // === OBLIGATIONS ENRICHIES ===
  // Tout ce qui ne dépend que de [bonds, prices] est calculé une seule fois :
  //   - latestPrice : map ISIN → dernier prix, construite en une passe O(M)
  //     au lieu de prices.filter().reduce() par obligation O(N×M).
  //   - ytm : calculé via getBondYTM (réutilise le latestPrice).
  //   - maturityTime : timestamp pour le tri (évite N×log(N) Date.parse).
  //   - searchHaystack : champs concaténés en lowercase pour ne plus appeler
  //     toLowerCase à chaque frappe.
  const enrichedBonds = useMemo(() => {
    // 1. Index des derniers prix par ISIN
    const latestByIsin = new Map<string, ListedBondPrice>();
    for (const p of prices) {
      const cur = latestByIsin.get(p.isin);
      if (!cur || p.date > cur.date) latestByIsin.set(p.isin, p);
    }

    return bonds.map((bond) => {
      const latestPrice = latestByIsin.get(bond.isin) ?? null;
      const ytm = getBondYTMFromLatest(bond, latestPrice);
      const maturityTime = bond.maturityDate
        ? Date.parse(bond.maturityDate)
        : 0;
      const searchHaystack = (
        bond.isin +
        " " +
        bond.name +
        " " +
        (bond.code ?? "") +
        " " +
        bond.issuer
      ).toLowerCase();
      return {
        ...bond,
        ytm,
        latestPrice,
        maturityTime,
        isMatured: isBondMatured(bond),
        searchHaystack,
      };
    });
  }, [bonds, prices]);

  // === TYPES DISPONIBLES (tires dynamiquement du CSV) + comptage ===
  // Le comptage est précalculé une fois pour éviter un bonds.filter().length
  // par <option> à chaque re-render (chaque frappe dans la recherche).
  const { availableTypes, typeCountByIssuer } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of bonds) {
      counts.set(b.issuerType, (counts.get(b.issuerType) ?? 0) + 1);
    }
    return {
      availableTypes: Array.from(counts.keys()).sort(),
      typeCountByIssuer: counts,
    };
  }, [bonds]);

  // === FILTRAGE DU TABLEAU ===
  // On dépend de deferredSearch (et non de search) : la frappe peut continuer
  // à mettre à jour l'input pendant que React re-calcule cette liste en
  // arrière-plan. Une seule comparaison includes() sur un haystack déjà en
  // lowercase, au lieu de 4 toLowerCase().includes() par obligation.
  const filteredBonds = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return enrichedBonds.filter((b) => {
      if (q && !b.searchHaystack.includes(q)) return false;
      if (filterType !== "all" && b.issuerType !== filterType) return false;
      if (filterCountry !== "all" && b.country !== filterCountry) return false;
      if (filterDuration !== "all") {
        const y = b.yearsToMaturity;
        if (filterDuration === "0-2" && (y < 0 || y > 2)) return false;
        if (filterDuration === "2-5" && (y <= 2 || y > 5)) return false;
        if (filterDuration === "5-10" && (y <= 5 || y > 10)) return false;
        if (filterDuration === "10+" && y <= 10) return false;
      }
      return true;
    });
  }, [enrichedBonds, deferredSearch, filterType, filterCountry, filterDuration]);

  // === TRI ===
  // maturityTime déjà parsé en amont — pas de Date.parse en boucle de tri.
  const sortedBonds = useMemo(() => {
    const sorted = [...filteredBonds];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "couponRate":
          cmp = a.couponRate - b.couponRate;
          break;
        case "cleanPrice": {
          // Les oblig sans cote sont toujours en bas, peu importe le sens.
          const ap = a.latestPrice?.cleanPrice;
          const bp = b.latestPrice?.cleanPrice;
          if (ap === undefined && bp === undefined) return 0;
          if (ap === undefined) return 1;
          if (bp === undefined) return -1;
          cmp = ap - bp;
          break;
        }
        case "maturity":
          cmp = a.maturityTime - b.maturityTime;
          break;
        case "ytm":
          cmp = a.ytm - b.ytm;
          break;
        case "outstanding":
          cmp = a.outstanding - b.outstanding;
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredBonds, sortKey, sortOrder]);

  // === STATS POUR TEASERS PREMIUM ===
  // Compteurs leger pour egayer les cartes teaser sans dupliquer les calculs
  // lourds (anomalies, regression) qui vivent maintenant sur leurs pages dediees.
  // Le filtre "upcoming" se base sur la date du serveur (events.length) plutôt
  // qu'un Date.now() impur — la précision "à venir" n'a pas vraiment de sens
  // ici (overhead négligeable pour un compteur teaser).
  const teaserStats = useMemo(() => {
    const ytmCount = enrichedBonds.filter((b) => b.ytm > 0).length;
    const ratedCount = enrichedBonds.filter((b) => b.rating).length;
    return {
      ytmCount,
      ratedCount,
      upcomingCount: events.length,
    };
  }, [enrichedBonds, events]);

  // useCallback : référence stable tant que sortKey ne bouge pas, ce qui
  // permet à <BondsTable> (memo) de sauter le re-render sur chaque frappe
  // dans la barre de recherche.
  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortOrder("asc");
      }
    },
    [sortKey]
  );

  return (
    <>
      {/* ====== HERO SECTION ====== */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            <Link href="/" className="hover:text-white transition">
              Marchés
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <span className="text-slate-200">Obligations cotées</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-white">
            Obligations cotées BRVM
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            Investissez dans la dette des entreprises et États UEMOA cotés sur la BRVM. Courbe
            de taux actuarielle, screener, veille des écarts et calendrier des coupons.
          </p>

          {(() => {
            // 6 KPIs harmonises : meme typo, meme couleur, meme structure de
            // sous-titre. Les 4 cartes BOC affichent la date du bulletin source ;
            // les 2 cartes calculees ("moyenne ponderee") indiquent la methode.
            const boc = stats.boc;
            const bocDateSub = boc ? `au ${formatDate(boc.bocDate)}` : null;
            const encoursValue = boc?.capitalisationBoursiere ?? stats.totalOutstanding;
            const bondsCountValue = boc?.bondsCount ?? stats.totalBonds;
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mt-6">
                <KpiCard
                  icon="📋"
                  accent="blue"
                  label="Obligations cotées"
                  value={bondsCountValue}
                  sub={boc?.bondsCount != null ? bocDateSub! : "sur la BRVM"}
                />
                <KpiCard
                  icon="💼"
                  accent="amber"
                  label="Encours total"
                  value={formatBigFCFA(encoursValue)}
                  sub={bocDateSub ?? "tous émetteurs"}
                />
                <KpiCard
                  icon="💰"
                  accent="emerald"
                  label="Coupon moyen"
                  value={`${(stats.weightedYield * 100).toFixed(2)}%`}
                  sub="moyenne pondérée"
                />
                <KpiCard
                  icon="⏱️"
                  accent="violet"
                  label="Durée moyenne"
                  value={`${stats.averageDuration.toFixed(1)} ans`}
                  sub="moyenne pondérée"
                />
                <KpiCard
                  icon="📊"
                  accent="indigo"
                  label="Volume échangé"
                  value={boc ? formatFCFA(boc.volumeEchange) : "—"}
                  sub={bocDateSub ?? "—"}
                />
                <KpiCard
                  icon="💸"
                  accent="rose"
                  label="Valeur transigée"
                  value={boc ? formatBigFCFA(boc.valeurTransigee) : "—"}
                  sub={bocDateSub ?? "—"}
                />
              </div>
            );
          })()}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* ====== TEASERS PREMIUM ======
            3 portes d'entree vers les sections analytiques (courbe / surveiller
            / calendrier). Chaque carte affiche un cadenas pour les invites et
            membres ; les Premium et Pro voient "Inclus" et atterrissent
            directement sur le contenu. La paywall est gerée server-side sur
            les pages dediees. */}
        <section>
          <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-lg md:text-xl font-semibold">
              Analyses obligataires
            </h2>
            <span className="text-xs text-slate-500">
              3 outils Premium · z-score, courbe actuarielle, calendrier
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <TeaserCard
              href="/marches/obligations/courbe-taux"
              icon="📊"
              accent="violet"
              title="Courbe des taux BRVM"
              description="YTM actuariel par durée résiduelle, régression sur la base de votre choix."
              stat={`${teaserStats.ytmCount} obligations`}
              unlocked={isPremium}
            />
            <TeaserCard
              href="/marches/obligations/surveillance"
              icon="🔎"
              accent="indigo"
              title="À surveiller"
              description="Obligations dont le YTM s'écarte statistiquement de leurs pairs."
              stat={`${teaserStats.ratedCount} obligations notées analysées`}
              unlocked={isPremium}
            />
            <TeaserCard
              href="/marches/obligations/calendrier"
              icon="📅"
              accent="emerald"
              title="Calendrier obligataire"
              description="12 mois de coupons, amortissements et remboursements à venir."
              stat={`${teaserStats.upcomingCount} événements à venir`}
              unlocked={isPremium}
            />
          </div>
        </section>


        {/* ====== TABLEAU ====== */}
        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100">
            <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
              <h2 className="text-lg md:text-xl font-semibold">
                Liste des obligations cotées
              </h2>
              <span className="text-xs text-slate-500">
                {sortedBonds.length === bonds.length
                  ? `${bonds.length} obligation${bonds.length > 1 ? "s" : ""}`
                  : `${sortedBonds.length} résultat${
                      sortedBonds.length > 1 ? "s" : ""
                    } sur ${bonds.length}`}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="Rechercher (nom, ISIN, code, émetteur...)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
              />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Tous les types</option>
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {t} ({typeCountByIssuer.get(t) ?? 0})
                  </option>
                ))}
              </select>
              <select
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Tous les pays</option>
                {Object.keys(stats.byCountry)
                  .sort()
                  .map((c) => (
                    <option key={c} value={c}>
                      {c} ({stats.byCountry[c]})
                    </option>
                  ))}
              </select>
              <select
                value={filterDuration}
                onChange={(e) => setFilterDuration(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Toutes durées</option>
                <option value="0-2">0-2 ans</option>
                <option value="2-5">2-5 ans</option>
                <option value="5-10">5-10 ans</option>
                <option value="10+">Plus de 10 ans</option>
              </select>
            </div>
          </div>

          {/* Tableau dans un composant memo : ne re-rend que quand sortedBonds
              change réellement (i.e. quand deferredSearch a rattrapé search,
              ou quand un filtre/tri change). Les frappes intermédiaires sont
              absorbées par useDeferredValue + memo. */}
          <BondsTable
            sortedBonds={sortedBonds}
            sortKey={sortKey}
            sortOrder={sortOrder}
            onToggleSort={toggleSort}
          />
        </section>

        {/* ====== PEDAGOGIE ====== */}
        <section className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100 p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-3">
            🎓 Comprendre les obligations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="font-medium mb-1">Qu&apos;est-ce qu&apos;une obligation ?</div>
              <p className="text-slate-600 text-xs md:text-sm">
                Un titre de créance : vous prêtez à un État ou entreprise qui vous paie un
                intérêt (coupon) périodique et vous rembourse à l&apos;échéance.
              </p>
            </div>
            <div>
              <div className="font-medium mb-1">Coupon vs YTM ?</div>
              <p className="text-slate-600 text-xs md:text-sm">
                Le coupon est fixe (% sur le nominal). Le YTM est le rendement actuariel
                effectif qui tient compte du prix d&apos;achat et du timing des flux.
              </p>
            </div>
            <div>
              <div className="font-medium mb-1">Risques ?</div>
              <p className="text-slate-600 text-xs md:text-sm">
                Défaut de l&apos;émetteur, remontée des taux (baisse du prix), inflation
                (érode le rendement réel).
              </p>
            </div>
          </div>
        </section>
      </main>

    </>
  );
}

// ============================================================
// SOUS-COMPOSANT MEMOISE : TABLE
// ============================================================
// La table est isolée derrière React.memo pour skip le re-render synchrone
// provoqué par chaque frappe dans la barre de recherche. useDeferredValue
// diffère la *valeur* mais pas le re-render parent — il faut donc bien le
// memo + props stables (toggleSort en useCallback) pour que ça marche.


// === TABLEAU DES OBLIGATIONS ===
type BondsTableProps = {
  sortedBonds: EnrichedBond[];
  sortKey: SortKey;
  sortOrder: SortOrder;
  onToggleSort: (key: SortKey) => void;
};

const BondsTable = memo(function BondsTable({
  sortedBonds,
  sortKey,
  sortOrder,
  onToggleSort,
}: BondsTableProps) {
  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-slate-300">↕</span>;
    return sortOrder === "asc" ? <span>↑</span> : <span>↓</span>;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
            <th className="text-left px-3 md:px-4 py-3 font-medium">
              <button
                onClick={() => onToggleSort("name")}
                className="flex items-center gap-1 hover:text-slate-900"
              >
                Obligation {sortIcon("name")}
              </button>
            </th>
            <th className="text-left px-3 md:px-4 py-3 font-medium hidden md:table-cell">
              Émetteur
            </th>
            <th className="text-center px-2 py-3 font-medium">Pays</th>
            <th className="text-right px-3 md:px-4 py-3 font-medium">
              <button
                onClick={() => onToggleSort("couponRate")}
                className="flex items-center gap-1 hover:text-slate-900 ml-auto"
              >
                Coupon {sortIcon("couponRate")}
              </button>
            </th>
            <th className="text-right px-3 md:px-4 py-3 font-medium">
              <button
                onClick={() => onToggleSort("cleanPrice")}
                className="flex items-center gap-1 hover:text-slate-900 ml-auto"
              >
                Cours {sortIcon("cleanPrice")}
              </button>
            </th>
            <th className="text-right px-3 md:px-4 py-3 font-medium">
              <button
                onClick={() => onToggleSort("ytm")}
                className="flex items-center gap-1 hover:text-slate-900 ml-auto"
              >
                YTM {sortIcon("ytm")}
              </button>
            </th>
            <th className="text-right px-3 md:px-4 py-3 font-medium">
              <button
                onClick={() => onToggleSort("maturity")}
                className="flex items-center gap-1 hover:text-slate-900 ml-auto"
              >
                Échéance {sortIcon("maturity")}
              </button>
            </th>
            <th className="text-right px-3 md:px-4 py-3 font-medium hidden md:table-cell">
              Rating
            </th>
            <th className="text-right px-3 md:px-4 py-3 font-medium hidden lg:table-cell">
              <button
                onClick={() => onToggleSort("outstanding")}
                className="flex items-center gap-1 hover:text-slate-900 ml-auto"
              >
                Encours {sortIcon("outstanding")}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedBonds.map((b) => (
            <tr
              key={b.code || b.isin}
              className="border-b border-slate-100 hover:bg-blue-50/30 transition"
            >
              <td className="px-3 md:px-4 py-3">
                <Link
                  href={bondHref(b)}
                  className="flex items-center gap-2 hover:text-blue-700"
                >
                  {b.greenBond && (
                    <span title="Obligation verte" className="text-green-600">
                      🌱
                    </span>
                  )}
                  <div>
                    <div className="font-medium">
                      {b.name}
                      {b.code && (
                        <span className="ml-2 text-xs text-slate-500 font-normal">
                          ({b.code})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{b.isin}</div>
                  </div>
                </Link>
              </td>
              <td className="px-3 md:px-4 py-3 hidden md:table-cell">
                <div className="text-sm">{b.issuer}</div>
                <div className="text-xs text-slate-500">
                  {b.issuerType} · {b.sector}
                </div>
              </td>
              <td className="px-2 py-3 text-center">
                <div className="flex flex-col items-center gap-0.5">
                  <CountryFlag country={b.country} size={16} />
                  <span className="text-[10px] text-slate-500 leading-none">
                    {b.country}
                  </span>
                </div>
              </td>
              <td className="px-3 md:px-4 py-3 text-right">
                {(b.couponRate * 100).toFixed(2)}%
              </td>
              <td className="px-3 md:px-4 py-3 text-right">
                {b.latestPrice ? (
                  <div>
                    <div className="font-medium">
                      {formatFCFA(b.latestPrice.cleanPrice)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {(() => {
                        const delta =
                          ((b.latestPrice.cleanPrice - b.nominalValue) /
                            b.nominalValue) *
                          100;
                        if (Math.abs(delta) < 0.05) return "au pair";
                        return (
                          <span
                            className={delta > 0 ? "text-red-600" : "text-green-600"}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta.toFixed(2)}%
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="px-3 md:px-4 py-3 text-right font-medium">
                <span
                  className={
                    b.ytm > b.couponRate
                      ? "text-green-700"
                      : b.ytm < b.couponRate
                      ? "text-red-700"
                      : ""
                  }
                >
                  {(b.ytm * 100).toFixed(2)}%
                </span>
              </td>
              <td className="px-3 md:px-4 py-3 text-right">
                <div className="text-sm">{formatDate(b.maturityDate)}</div>
                {/* Une ligne echue afficherait une duree residuelle negative
                    ("-0,4 ans"), illisible. On montre son statut a la place. */}
                {b.isMatured ? (
                  <span
                    className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-600"
                    title="Obligation remboursée : elle reste consultable pour son historique, mais n'est plus cotée."
                  >
                    Échue
                  </span>
                ) : (
                  <div className="text-xs text-slate-500">
                    {b.yearsToMaturity.toFixed(1)} ans
                  </div>
                )}
              </td>
              <td className="px-3 md:px-4 py-3 text-right hidden md:table-cell">
                {b.rating ? (
                  <span className="text-xs px-2 py-0.5 bg-slate-100 rounded">
                    {b.rating}
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="px-3 md:px-4 py-3 text-right hidden lg:table-cell text-xs text-slate-600">
                {formatBigFCFA(b.outstanding)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sortedBonds.length === 0 && (
        <div className="p-10 text-center text-slate-500">
          Aucune obligation ne correspond à vos critères
        </div>
      )}
    </div>
  );
});
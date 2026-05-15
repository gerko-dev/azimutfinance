// =============================================================================
// Page d'accueil du rôle MEMBRE — un « cockpit » personnalisé.
//
// Pensé autour de ce qui appartient au membre (sa watchlist, ses alertes) et
// de ce qui bouge (marché du jour, pouls macro), puis de quoi apprendre
// (magazine, académie) et explorer le portail.
//
// Volontairement SANS messagerie ni Ligue Azimut (simulateur) : les rôles
// premium et pro ont leur propre page d'accueil.
// =============================================================================

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import Header from "@/components/Header";
import LivePriceBadge from "@/components/LivePriceBadge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBrvmIndicesSnapshot } from "@/lib/brvm/liveIndices";
import { getBrvmSnapshot } from "@/lib/brvm/liveQuotes";
import { computeCommodityStats } from "@/lib/commodities";
import { computeFxStats } from "@/lib/fx";
import { listPublishedArticles, listPublishedIssues } from "@/lib/magazine/queries";
import { getCatalogStats } from "@/lib/formations";
import { listPublishedFormations } from "@/lib/formations/queries";
import { listMyWatchlists, getMyWatchlist } from "@/lib/watchlists/queries";
import { enrichWatchlistItems, type EnrichedItem } from "@/lib/watchlists/enrich";
import { TARGET_TYPE_LABEL } from "@/lib/watchlists/types";
import {
  listMyAlerts,
  getMyAlertsUnreadCount,
  listMyAlertTriggers,
} from "@/lib/alerts/queries";

// ---------------------------------------------------------------------------
// Helpers de formatage
// ---------------------------------------------------------------------------

const fmtNum = (v: number, dec = 0) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtPct = (v: number | null | undefined, dec = 2) =>
  v === null || v === undefined || !isFinite(v)
    ? "—"
    : `${v >= 0 ? "+" : ""}${v.toFixed(dec).replace(".", ",")} %`;

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (isNaN(diff)) return "—";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 30) return `il y a ${j} j`;
  return d.toLocaleDateString("fr-FR");
}

// ---------------------------------------------------------------------------
// Page (server component) — fait son propre fetch de données.
// ---------------------------------------------------------------------------

export default async function MemberHome({ user }: { user: User }) {
  const supabase = await createSupabaseServerClient();

  const meta = user.user_metadata as { full_name?: string; name?: string } | null;

  const [
    profileRes,
    indicesSnapshot,
    brvmSnapshot,
    watchlists,
    alerts,
    alertsUnread,
    recentTriggers,
    articles,
    issues,
    formations,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, username, onboarded_at, role")
      .eq("id", user.id)
      .maybeSingle(),
    getBrvmIndicesSnapshot(),
    getBrvmSnapshot(),
    listMyWatchlists(),
    listMyAlerts(),
    getMyAlertsUnreadCount(),
    listMyAlertTriggers(5),
    listPublishedArticles(),
    listPublishedIssues(),
    listPublishedFormations(),
  ]);

  const profile = profileRes.data as
    | {
        full_name: string | null;
        username: string | null;
        onboarded_at: string | null;
        role: string | null;
      }
    | null;
  const displayName =
    profile?.full_name ||
    profile?.username ||
    meta?.full_name ||
    meta?.name ||
    user.email?.split("@")[0] ||
    "membre";
  const onboarded = !!profile?.onboarded_at;

  // Les alertes de prix sont une fonctionnalité Premium. Un simple membre voit
  // une carte d'incitation à passer Premium à la place.
  const alertsAvailable = !!profile?.role && profile.role !== "member";

  // Watchlist mise en avant : la watchlist par défaut, sinon la première.
  const featuredList =
    watchlists.find((w) => w.is_default) ?? watchlists[0] ?? null;
  let watchlistItems: EnrichedItem[] = [];
  if (featuredList) {
    const full = await getMyWatchlist(featuredList.id);
    if (full) watchlistItems = enrichWatchlistItems(full.items).slice(0, 5);
  }

  // Indices BRVM clés.
  const idx = new Map(indicesSnapshot.indices.map((i) => [i.code, i]));
  const heroIndices = [
    { code: "BRVMC", label: "BRVM Composite" },
    { code: "BRVM30", label: "BRVM 30" },
    { code: "BRVMPR", label: "BRVM Prestige" },
  ]
    .map((d) => ({ ...d, live: idx.get(d.code) }))
    .filter((d) => d.live);

  // Mouvements du jour (variation BRVM live, hors 0 %).
  const movers = brvmSnapshot.quotes.filter(
    (q) => Number.isFinite(q.variationPct) && q.variationPct !== 0,
  );
  const topGainers = [...movers]
    .sort((a, b) => b.variationPct - a.variationPct)
    .slice(0, 4);
  const topLosers = [...movers]
    .sort((a, b) => a.variationPct - b.variationPct)
    .slice(0, 4);

  // Pouls macro.
  const usdXof = computeFxStats("USD_XOF");
  const eurUsd = computeFxStats("EUR_USD");
  const cacao = computeCommodityStats("cacao");
  const or = computeCommodityStats("or");
  const brent = computeCommodityStats("brent");

  // Magazine + académie.
  const featuredArticle = articles.find((a) => a.featured) ?? articles[0] ?? null;
  const recentArticles = articles
    .filter((a) => a.slug !== featuredArticle?.slug)
    .slice(0, 3);
  const latestIssue = issues[0] ?? null;
  const catalog = getCatalogStats(formations);

  const hour = new Date().getUTCHours(); // UEMOA = UTC+0
  const greeting = hour >= 5 && hour < 18 ? "Bonjour" : "Bonsoir";

  const activeAlerts = alerts.filter((a) => a.active);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* ===================== HERO : cockpit ===================== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-6 pt-10 md:pt-14 pb-8 md:pb-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-blue-300">
                Votre espace
              </div>
              <h1 className="text-3xl md:text-5xl font-bold mt-1.5 leading-tight">
                {greeting}, {displayName}.
              </h1>
              <p className="text-sm md:text-base text-slate-300 mt-2 max-w-xl">
                Voici votre tableau de bord du marché UEMOA — votre suivi, vos
                alertes et ce qui bouge aujourd&apos;hui.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/outils/watchlist"
                className="bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium px-4 py-2 rounded-md text-sm transition"
              >
                Ma watchlist
              </Link>
              {/* « Mes alertes » réservé aux comptes Premium. */}
              {alertsAvailable && (
                <Link
                  href="/outils/alertes"
                  className="bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium px-4 py-2 rounded-md text-sm transition"
                >
                  Mes alertes
                </Link>
              )}
              <Link
                href="/compte"
                className="bg-white text-slate-900 hover:bg-slate-100 font-semibold px-4 py-2 rounded-md text-sm transition"
              >
                Mon compte
              </Link>
            </div>
          </div>

          {/* Ticker indices BRVM */}
          <div className="mt-7">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                Marché BRVM
              </span>
              <LivePriceBadge
                sessionLabel={indicesSnapshot.sessionLabel}
                isClosed={indicesSnapshot.isClosed}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {heroIndices.length === 0 ? (
                <div className="text-xs text-slate-400">
                  Cotation des indices indisponible pour le moment.
                </div>
              ) : (
                heroIndices.map((d) => {
                  const v = d.live!;
                  const up = (v.variationPct ?? 0) >= 0;
                  return (
                    <Link
                      key={d.code}
                      href="/marches/indices"
                      className="group bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 hover:border-white/25 rounded-lg px-4 py-3 transition flex items-center justify-between"
                    >
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          {d.label}
                        </div>
                        <div className="text-lg font-bold tabular-nums mt-0.5">
                          {fmtNum(v.value, 2)}
                        </div>
                      </div>
                      <div
                        className={`text-sm font-semibold tabular-nums ${
                          up ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {fmtPct(v.variationPct, 2)}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-10 md:space-y-14">
        {/* Bandeau onboarding (si profil incomplet) */}
        {!onboarded && (
          <Link
            href="/bienvenue"
            className="group flex items-center gap-4 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 hover:border-blue-300 transition"
          >
            <span className="text-2xl" aria-hidden>
              🎯
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-900">
                Personnalisez votre expérience
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                En 4 questions, on adapte les contenus à votre profil
                d&apos;investisseur.
              </div>
            </div>
            <span className="text-sm font-semibold text-blue-700 group-hover:translate-x-0.5 transition">
              Compléter →
            </span>
          </Link>
        )}

        {/* ============ Watchlist + Alertes (le « à moi ») ============ */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <WatchlistPanel
            list={featuredList}
            items={watchlistItems}
            totalLists={watchlists.length}
          />
          {alertsAvailable ? (
            <AlertsPanel
              activeCount={activeAlerts.length}
              unread={alertsUnread}
              triggers={recentTriggers}
              hasAlerts={alerts.length > 0}
            />
          ) : (
            <AlertsUpsell />
          )}
        </section>

        {/* ===================== Marché aujourd'hui ===================== */}
        <section>
          <SectionHeader
            kicker="Le marché aujourd'hui"
            title="Ce qui bouge sur la BRVM"
            href="/marches/actions"
            hrefLabel="Toute la cote"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
            <MoversCard title="Plus fortes hausses" tone="up" quotes={topGainers} />
            <MoversCard title="Plus fortes baisses" tone="down" quotes={topLosers} />
          </div>
        </section>

        {/* ===================== Pouls macro ===================== */}
        <section>
          <SectionHeader
            kicker="Le pouls macro"
            title="Devises & matières premières"
            href="/macro/pays"
            hrefLabel="Macro UEMOA"
          />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-5">
            <MacroCard
              href="/macro/devises"
              label="USD / XOF"
              value={usdXof ? fmtNum(usdXof.last, 2) : "—"}
              delta={fmtPct(usdXof?.changeDayPct, 2)}
              up={(usdXof?.changeDayPct ?? 0) >= 0}
            />
            <MacroCard
              href="/macro/devises"
              label="EUR / USD"
              value={eurUsd ? fmtNum(eurUsd.last, 4) : "—"}
              delta={fmtPct(eurUsd?.changeDayPct, 2)}
              up={(eurUsd?.changeDayPct ?? 0) >= 0}
            />
            <MacroCard
              href="/macro/matieres-premieres/cacao"
              label="Cacao · USD/t"
              value={cacao ? fmtNum(cacao.last, 0) : "—"}
              delta={fmtPct(cacao?.changeDayPct, 2)}
              up={(cacao?.changeDayPct ?? 0) >= 0}
            />
            <MacroCard
              href="/macro/matieres-premieres/or"
              label="Or · USD/oz"
              value={or ? fmtNum(or.last, 0) : "—"}
              delta={fmtPct(or?.changeDayPct, 2)}
              up={(or?.changeDayPct ?? 0) >= 0}
            />
            <MacroCard
              href="/macro/matieres-premieres/brent"
              label="Brent · USD/bbl"
              value={brent ? fmtNum(brent.last, 1) : "—"}
              delta={fmtPct(brent?.changeDayPct, 2)}
              up={(brent?.changeDayPct ?? 0) >= 0}
            />
          </div>
        </section>

        {/* ===================== Lire & apprendre ===================== */}
        <section>
          <SectionHeader
            kicker="Lire & apprendre"
            title="Le magazine et l'académie"
            href="/academie/magazine"
            hrefLabel="Tout le magazine"
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
            {featuredArticle && (
              <Link
                href={`/academie/magazine/article/${featuredArticle.slug}`}
                className="lg:col-span-2 group bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition overflow-hidden flex flex-col"
              >
                <div
                  className="h-36 md:h-44 relative"
                  style={{
                    background: `linear-gradient(135deg, ${featuredArticle.accent} 0%, ${featuredArticle.accent}cc 100%)`,
                  }}
                >
                  <div className="absolute top-4 left-4 text-[10px] uppercase tracking-wide font-semibold text-white bg-black/25 px-2 py-0.5 rounded">
                    À la une · {latestIssue?.monthLabel ?? "Magazine"}
                  </div>
                </div>
                <div className="p-5 md:p-6 flex-1 flex flex-col">
                  <h3
                    className="text-xl md:text-2xl font-bold text-slate-900 leading-tight group-hover:text-blue-700 transition"
                    style={{ fontFamily: "Georgia, serif" }}
                  >
                    {featuredArticle.title}
                  </h3>
                  <p className="text-sm text-slate-600 mt-3 leading-relaxed flex-1">
                    {featuredArticle.excerpt}
                  </p>
                  <div className="text-xs text-slate-500 mt-4">
                    {featuredArticle.readingTimeMinutes} min de lecture
                  </div>
                </div>
              </Link>
            )}

            <div className="space-y-3">
              {recentArticles.map((a) => (
                <Link
                  key={a.slug}
                  href={`/academie/magazine/article/${a.slug}`}
                  className="group block bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md rounded-xl p-4 transition"
                >
                  <div
                    className="text-[10px] uppercase tracking-wide font-semibold"
                    style={{ color: a.accent }}
                  >
                    Article
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-1 leading-snug group-hover:text-blue-700 transition line-clamp-2">
                    {a.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {a.readingTimeMinutes} min
                  </div>
                </Link>
              ))}
              <Link
                href="/academie/formations"
                className="group block bg-gradient-to-br from-purple-50 to-white border border-purple-200 hover:border-purple-300 rounded-xl p-4 transition"
              >
                <div className="text-[10px] uppercase tracking-wide font-semibold text-purple-700">
                  Académie
                </div>
                <div className="text-sm font-semibold text-slate-900 mt-1 group-hover:text-purple-700 transition">
                  {catalog.total} formation{catalog.total > 1 ? "s" : ""} ·{" "}
                  {catalog.freeCount} gratuite{catalog.freeCount > 1 ? "s" : ""}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Montez en compétence sur les marchés UEMOA →
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* ===================== Explorer le portail ===================== */}
        <section>
          <SectionHeader
            kicker="Explorer"
            title="Tout le portail, à portée de clic"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-5">
            <ExploreTile href="/marches/actions" icon="📈" label="Actions BRVM" hint="Cours, indices, fiches valeur" />
            <ExploreTile href="/marches/obligations" icon="💵" label="Obligations cotées" hint="Marché obligataire BRVM" />
            <ExploreTile href="/marches/souverains-non-cotes" icon="🏛️" label="Souverains UMOA-Titres" hint="OAT, BAT, adjudications" />
            <ExploreTile href="/marches/fcp" icon="🧺" label="FCP / OPCVM" hint="Fonds & sociétés de gestion" />
            <ExploreTile href="/marche-monetaire" icon="🏦" label="Marché monétaire" hint="Taux BCEAO & UEMOA" />
            <ExploreTile href="/macro/pays" icon="🌍" label="Macro UEMOA" hint="PIB, inflation, indicateurs pays" />
            <ExploreTile href="/macro/matieres-premieres" icon="🌾" label="Matières premières" hint="Cacao, or, pétrole…" />
            <ExploreTile href="/macro/devises" icon="💱" label="Devises & FX" hint="FCFA face aux majors" />
            <ExploreTile href="/academie/glossaire" icon="📖" label="Glossaire" hint="65+ termes contextualisés" />
            <ExploreTile href="/academie/compte-titre" icon="💼" label="Suivi compte-titre" hint="Pilotez votre portefeuille réel" />
            <ExploreTile href="/communaute/forum" icon="💬" label="Forum investisseurs" hint="Échangez avec la communauté" />
            <ExploreTile href="/communaute/newsletter" icon="✉️" label="Newsletter" hint="L'essentiel chaque semaine" />
          </div>
        </section>
      </div>
    </div>
  );
}

// =============================================================================
// SOUS-COMPOSANTS
// =============================================================================

function SectionHeader({
  kicker,
  title,
  href,
  hrefLabel,
}: {
  kicker: string;
  title: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="text-[11px] uppercase tracking-wider font-semibold text-blue-700">
          {kicker}
        </div>
        <h2
          className="text-xl md:text-2xl font-bold text-slate-900 mt-1 leading-tight"
          style={{ letterSpacing: "-0.01em" }}
        >
          {title}
        </h2>
      </div>
      {href && hrefLabel && (
        <Link
          href={href}
          className="text-sm font-semibold text-blue-700 hover:underline whitespace-nowrap"
        >
          {hrefLabel} →
        </Link>
      )}
    </div>
  );
}

// ---- Watchlist ----

function WatchlistPanel({
  list,
  items,
  totalLists,
}: {
  list: { id: string; name: string } | null;
  items: EnrichedItem[];
  totalLists: number;
}) {
  return (
    <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-baseline justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-blue-700">
            Ma watchlist
          </div>
          <h2 className="text-base font-bold text-slate-900 mt-0.5">
            {list ? list.name : "Suivez vos valeurs favorites"}
          </h2>
        </div>
        <Link
          href="/outils/watchlist"
          className="text-sm font-semibold text-blue-700 hover:underline whitespace-nowrap"
        >
          {list ? "Gérer →" : "Créer →"}
        </Link>
      </div>

      {!list || items.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="text-3xl mb-2" aria-hidden>
            ⭐
          </div>
          <div className="text-sm font-medium text-slate-700">
            {list
              ? "Cette watchlist est encore vide."
              : "Vous n'avez pas encore de watchlist."}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Ajoutez actions, obligations, indices ou devises pour suivre leur
            évolution d&apos;un coup d&apos;œil.
          </p>
          <Link
            href="/outils/watchlist"
            className="inline-block mt-4 text-sm font-semibold bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-md transition"
          >
            {list ? "Ajouter une valeur" : "Créer ma watchlist"}
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {items.map((it) => {
              const ytd = it.enriched.ytdPct;
              return (
                <li key={it.id}>
                  <Link
                    href={targetHref(it.target_type, it.target_code)}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 group"
                  >
                    <div className="w-14 shrink-0">
                      <div className="text-sm font-bold text-slate-900 truncate">
                        {it.target_code}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-800 truncate group-hover:text-blue-700">
                        {it.target_label || it.target_code}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        {TARGET_TYPE_LABEL[it.target_type]}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums text-slate-900">
                        {it.enriched.price !== null
                          ? fmtNum(it.enriched.price, 2)
                          : "—"}
                        {it.enriched.unit ? (
                          <span className="text-[10px] text-slate-400 ml-1">
                            {it.enriched.unit}
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={`text-[11px] tabular-nums font-medium ${
                          ytd === null
                            ? "text-slate-400"
                            : ytd >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                        }`}
                      >
                        {ytd !== null ? `${fmtPct(ytd, 1)} YTD` : "—"}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {totalLists > 1 && (
            <div className="px-5 py-2.5 border-t border-slate-100 text-[11px] text-slate-500">
              + {totalLists - 1} autre{totalLists - 1 > 1 ? "s" : ""} watchlist
              {totalLists - 1 > 1 ? "s" : ""} ·{" "}
              <Link href="/outils/watchlist" className="text-blue-700 hover:underline">
                toutes les voir
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function targetHref(type: string, code: string): string {
  switch (type) {
    case "stock":
      return `/titre/${code}`;
    case "bond":
      return `/obligation/${code}`;
    case "index":
      return "/marches/indices";
    case "currency":
      return "/macro/devises";
    case "commodity":
      return "/macro/matieres-premieres";
    default:
      return "/outils/watchlist";
  }
}

// ---- Alertes ----

function AlertsPanel({
  activeCount,
  unread,
  triggers,
  hasAlerts,
}: {
  activeCount: number;
  unread: number;
  triggers: Awaited<ReturnType<typeof listMyAlertTriggers>>;
  hasAlerts: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-baseline justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-amber-600">
            Mes alertes
          </div>
          <h2 className="text-base font-bold text-slate-900 mt-0.5">
            {hasAlerts
              ? `${activeCount} active${activeCount > 1 ? "s" : ""}`
              : "Restez prévenu"}
          </h2>
        </div>
        <Link
          href="/outils/alertes"
          className="text-sm font-semibold text-amber-600 hover:underline whitespace-nowrap"
        >
          {hasAlerts ? "Gérer →" : "Créer →"}
        </Link>
      </div>

      {!hasAlerts ? (
        <div className="px-5 py-10 text-center flex-1 flex flex-col justify-center">
          <div className="text-3xl mb-2" aria-hidden>
            🔔
          </div>
          <div className="text-sm font-medium text-slate-700">
            Aucune alerte configurée.
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Soyez notifié dès qu&apos;un cours, un rendement ou un indice
            franchit votre seuil.
          </p>
          <Link
            href="/outils/alertes"
            className="inline-block mt-4 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-md transition"
          >
            Créer une alerte
          </Link>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {unread > 0 && (
            <div className="mx-5 mt-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
              <span className="font-semibold">{unread}</span> déclenchement
              {unread > 1 ? "s" : ""} non lu{unread > 1 ? "s" : ""}.
            </div>
          )}
          <div className="px-5 py-3 text-[11px] uppercase tracking-wide font-semibold text-slate-400">
            Derniers déclenchements
          </div>
          {triggers.length === 0 ? (
            <p className="px-5 pb-5 text-xs text-slate-500">
              Aucune alerte déclenchée récemment — tout est sous contrôle.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {triggers.map((t) => (
                <li
                  key={t.id}
                  className="px-5 py-2.5 flex items-start gap-2.5"
                >
                  <span
                    className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                      t.read_at ? "bg-slate-300" : "bg-amber-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs text-slate-800 leading-snug">
                      {t.message || t.alert_name}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {relativeTime(t.triggered_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Alertes : carte d'incitation Premium (rôle membre) ----

function AlertsUpsell() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-white to-amber-50 border border-amber-200 rounded-xl flex flex-col">
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-300/20 rounded-full blur-2xl" />
      <div className="relative px-5 py-3.5 border-b border-amber-100 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-amber-600">
            Mes alertes
          </div>
          <h2 className="text-base font-bold text-slate-900 mt-0.5">
            Restez prévenu, automatiquement
          </h2>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded">
          Premium
        </span>
      </div>

      <div className="relative px-5 py-6 flex-1 flex flex-col">
        <div className="text-3xl mb-2" aria-hidden>
          🔔
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">
          Les <strong>alertes de prix</strong>{" "}
          sont réservées aux membres Premium. Soyez notifié — par email et dans
          l&apos;app — dès qu&apos;un cours, un rendement ou un indice franchit
          le seuil que vous avez fixé.
        </p>
        <ul className="mt-3 space-y-1.5">
          {[
            "Seuils sur actions, obligations, indices et devises",
            "Notification email + journal des déclenchements",
            "Aucune occasion de marché manquée",
          ].map((f) => (
            <li
              key={f}
              className="flex items-start gap-2 text-xs text-slate-600"
            >
              <span className="text-amber-500 mt-0.5" aria-hidden>
                ✓
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <Link
          href="/premium"
          className="mt-auto pt-5 block text-center text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-4 py-2.5 rounded-md transition shadow-sm"
        >
          Passer à Premium →
        </Link>
      </div>
    </div>
  );
}

// ---- Movers ----

function MoversCard({
  title,
  tone,
  quotes,
}: {
  title: string;
  tone: "up" | "down";
  quotes: { code: string; name: string; variationPct: number }[];
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span
          className={`text-[10px] uppercase font-semibold ${
            tone === "up" ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {tone === "up" ? "↑ Jour" : "↓ Jour"}
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {quotes.length === 0 ? (
          <li className="px-5 py-4 text-xs text-slate-400">
            Pas de mouvement coté aujourd&apos;hui.
          </li>
        ) : (
          quotes.map((q) => (
            <li key={q.code}>
              <Link
                href={`/titre/${q.code}`}
                className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 group"
              >
                <div className="w-14 text-sm font-bold text-slate-900 shrink-0">
                  {q.code}
                </div>
                <div className="flex-1 min-w-0 text-sm text-slate-700 truncate group-hover:text-blue-700">
                  {q.name}
                </div>
                <div
                  className={`text-sm font-bold tabular-nums shrink-0 ${
                    q.variationPct >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {fmtPct(q.variationPct, 2)}
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// ---- Macro ----

function MacroCard({
  href,
  label,
  value,
  delta,
  up,
}: {
  href: string;
  label: string;
  value: string;
  delta: string;
  up: boolean;
}) {
  return (
    <Link
      href={href}
      className="group bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md rounded-xl p-4 transition"
    >
      <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums text-slate-900 mt-1">
        {value}
      </div>
      <div
        className={`text-xs font-medium tabular-nums mt-0.5 ${
          up ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {delta}
      </div>
    </Link>
  );
}

// ---- Explore ----

function ExploreTile({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: string;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white border border-slate-200 hover:border-blue-300 hover:shadow-md rounded-xl p-4 transition"
    >
      <div className="text-2xl" aria-hidden>
        {icon}
      </div>
      <div className="text-sm font-semibold text-slate-900 mt-2 group-hover:text-blue-700 transition">
        {label}
      </div>
      <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
        {hint}
      </div>
    </Link>
  );
}

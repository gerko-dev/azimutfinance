import Link from "next/link";
import Header from "@/components/Header";
import { computeCommodityStats } from "@/lib/commodities";
import { computeFxStats } from "@/lib/fx";
import {
  computeStockYtdPct,
  loadStocks,
  getLatestSikaQuote,
} from "@/lib/dataLoader";
import { getBrvmIndicesSnapshot } from "@/lib/brvm/liveIndices";
import { getBrvmSnapshot } from "@/lib/brvm/liveQuotes";
import LivePriceBadge from "@/components/LivePriceBadge";
import {
  listPublishedArticles,
  listPublishedIssues,
} from "@/lib/magazine/queries";
import { getCatalogStats } from "@/lib/formations";
import { listPublishedFormations } from "@/lib/formations/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentSeason,
  getMyPortfolio,
  getPortfolioSnapshot,
  getLeaderboard,
} from "@/lib/simulator/queries";
import {
  getDynamicPlanList,
  listTrialConfigs,
} from "@/lib/premium/pricingQueries";
import { fmtFCFAShort } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AzimutFinance — Le portail des marchés financiers UEMOA",
  description:
    "Données BRVM, marché obligataire UEMOA, macroéconomie zone CFA, formations, simulateur de portefeuille et magazine éditorial. Le portail des investisseurs UEMOA.",
};

const fmtPct = (v: number | null, dec = 1) =>
  v === null || !isFinite(v)
    ? "—"
    : `${v >= 0 ? "+" : ""}${v.toFixed(dec).replace(".", ",")} %`;

const fmtNum = (v: number, dec = 0) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export default async function Home() {
  // ---- Auth check ----
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---- Saison simulateur active (utilisee par memberContext + Spotlight) ----
  const currentSeason = await getCurrentSeason();

  // ---- Personnalisation membre connecte ----
  let memberContext: {
    displayName: string;
    season: Awaited<ReturnType<typeof getCurrentSeason>>;
    snapshot: Awaited<ReturnType<typeof getPortfolioSnapshot>>;
    rank: number | null;
    totalPlayers: number;
    unread: number;
  } | null = null;

  if (user) {
    const meta = user.user_metadata as { full_name?: string; name?: string } | null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", user.id)
      .maybeSingle();
    const fullName =
      (profile as { full_name?: string | null } | null)?.full_name ??
      meta?.full_name ??
      meta?.name ??
      null;
    const username =
      (profile as { username?: string | null } | null)?.username ?? null;
    const displayName = fullName || username || user.email?.split("@")[0] || "membre";

    const season = currentSeason;
    let snapshot: Awaited<ReturnType<typeof getPortfolioSnapshot>> = null;
    let rank: number | null = null;
    let totalPlayers = 0;
    if (season) {
      const portfolio = await getMyPortfolio(season.id);
      if (portfolio) {
        snapshot = await getPortfolioSnapshot(season.id);
        const board = await getLeaderboard(season.id);
        totalPlayers = board.length;
        rank = board.find((e) => e.userId === user.id)?.rank ?? null;
      }
    }

    const { data: unreadCount } = await supabase.rpc("get_unread_count");
    const unread = typeof unreadCount === "number" ? unreadCount : 0;

    memberContext = { displayName, season, snapshot, rank, totalPlayers, unread };
  }

  // ---- Données live ----
  // Indices + quotes BRVM scrapes en direct depuis brvm.org (cache 5 min) :
  //   - Indices : variation jour de la col "Variation jour (%)" du site
  //   - Quotes  : variation jour de chaque action (col "Variation (%)")
  //   - Seance  : isClosed scrape via classes CSS seance-fermee/seance-ouverte
  const [indicesSnapshot, brvmQuotesSnapshot, premiumPlans, trialConfigs] =
    await Promise.all([
      getBrvmIndicesSnapshot(),
      getBrvmSnapshot(),
      getDynamicPlanList(),
      listTrialConfigs(),
    ]);

  // Carte tarif Premium : on prefere le plan mensuel "m1" pour afficher un
  // prix /mois ; sinon on prend le plan au plus petit prix/mois.
  const m1 = premiumPlans.find((p) => p.code === "m1");
  const premiumDisplay = m1
    ? { priceFcfa: m1.priceFcfa, suffix: "/ mois" }
    : premiumPlans.length > 0
      ? (() => {
          const cheapest = [...premiumPlans].sort(
            (a, b) => a.pricePerMonthFcfa - b.pricePerMonthFcfa,
          )[0];
          return { priceFcfa: cheapest.pricePerMonthFcfa, suffix: "/ mois" };
        })()
      : { priceFcfa: 9900, suffix: "/ mois" };

  // CTA "essai" : si une trial_config active existe, on affiche la duree reelle ;
  // sinon CTA generique.
  const activeTrial = trialConfigs.find((t) => t.active);
  const premiumCta = activeTrial
    ? `Essai ${activeTrial.duration_days} jours gratuit`
    : "Découvrir Premium";
  const liveIndexByCode = new Map(
    indicesSnapshot.indices.map((i) => [i.code, i]),
  );
  const brvmcLive = liveIndexByCode.get("BRVMC");
  const brvm30Live = liveIndexByCode.get("BRVM30");
  const brvmPrestigeLive = liveIndexByCode.get("BRVMPR");

  // Top hausse / Top baisse du jour : sur la variation jour BRVM (variationPct).
  // On ignore les quotes a 0% (pas de transaction du jour).
  const dailyMovers = brvmQuotesSnapshot.quotes.filter(
    (q) => Number.isFinite(q.variationPct) && q.variationPct !== 0,
  );
  const topDailyGainer = [...dailyMovers].sort(
    (a, b) => b.variationPct - a.variationPct,
  )[0];
  const topDailyLoser = [...dailyMovers].sort(
    (a, b) => a.variationPct - b.variationPct,
  )[0];

  const cacao = computeCommodityStats("cacao");
  const or = computeCommodityStats("or");
  const brent = computeCommodityStats("brent");
  const usdXof = computeFxStats("USD_XOF");
  const eurUsd = computeFxStats("EUR_USD");

  const stocks = loadStocks();
  const stocksCount = stocks.length;

  const catalog = getCatalogStats(await listPublishedFormations());

  const [magazineArticles, magazineIssues] = await Promise.all([
    listPublishedArticles(),
    listPublishedIssues(),
  ]);
  const featuredArticle =
    magazineArticles.find((a) => a.featured) ?? magazineArticles[0];
  const latestIssue = magazineIssues[0];
  const articlesCount = magazineArticles.length;
  const issuesCount = magazineIssues.length;

  // Top movers YTD : cours live BRVM (scrap) vs cours au 31/12 N-1 (historique
  // Sika). On ignore les actions sans historique YTD suffisant ou sans cours
  // live (fallback CSV si live indisponible).
  const liveQuoteByCode = new Map(
    brvmQuotesSnapshot.quotes.map((q) => [q.code, q]),
  );
  const stocksWithYtd = stocks
    .map((s) => {
      const live = liveQuoteByCode.get(s.code);
      // Cours courant : live BRVM → repli dernière clôture historique_sika.
      // titres.csv n'est plus utilisé pour le prix.
      const currentPrice =
        live && Number.isFinite(live.currentPrice) && live.currentPrice > 0
          ? live.currentPrice
          : getLatestSikaQuote(s.code)?.price ?? 0;
      const ytdChange = computeStockYtdPct(s.code, currentPrice);
      return {
        code: s.code,
        name: s.name,
        sector: s.sector,
        ytdChange,
      };
    })
    .filter(
      (s): s is { code: string; name: string; sector: string; ytdChange: number } =>
        s.ytdChange !== null && Number.isFinite(s.ytdChange) && s.ytdChange !== 0,
    );
  const topGainers = [...stocksWithYtd]
    .sort((a, b) => b.ytdChange - a.ytdChange)
    .slice(0, 3);
  const topLosers = [...stocksWithYtd]
    .sort((a, b) => a.ytdChange - b.ytdChange)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* HERO : dashboard pour les membres connectes, marketing pour les visiteurs */}
      {memberContext && (
        <MemberDashboardHero
          context={memberContext}
          featuredArticle={featuredArticle}
        />
      )}
      {!memberContext && (
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
        {/* Décor : pattern subtil */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Décor : halo bleu */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-6 pt-12 md:pt-20 pb-16 md:pb-24">
          <div className="max-w-3xl">
            <span className="inline-block text-[11px] uppercase tracking-wider font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30 px-2.5 py-1 rounded">
              ★ Le portail des investisseurs UEMOA
            </span>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.05] mt-5">
              Comprendre. Décider.
              <br />
              <span className="bg-gradient-to-r from-blue-300 via-emerald-300 to-amber-300 bg-clip-text text-transparent">
                Investir UEMOA.
              </span>
            </h1>
            <p className="text-base md:text-lg text-slate-300 mt-5 leading-relaxed max-w-2xl">
              Cotation en quasi réel, marché obligataire UEMOA décrypté,
              informations éclairées sur les FCP, académie d&apos;investissement
              et simulateur de portefeuille. Tout ce qu&apos;il faut pour
              apprendre, décider et investir sur les marchés en un seul endroit.
            </p>
            <div className="flex flex-wrap gap-3 mt-7">
              <Link
                href="/inscription"
                className="bg-white text-slate-900 hover:bg-slate-100 font-semibold px-6 py-3 rounded-md text-sm md:text-base transition shadow-lg shadow-blue-500/10"
              >
                Créer un compte gratuit →
              </Link>
              <Link
                href="/marches/actions"
                className="bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium px-6 py-3 rounded-md text-sm md:text-base transition"
              >
                Explorer les marchés
              </Link>
            </div>
          </div>

          {/* Section BRVM */}
          <div className="mt-10 md:mt-14">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                  BRVM
                </div>
                <LivePriceBadge
                  sessionLabel={indicesSnapshot.sessionLabel}
                  isClosed={indicesSnapshot.isClosed}
                />
              </div>
              <Link
                href="/marches/actions"
                className="text-[11px] text-slate-300 hover:text-white inline-flex items-center gap-1"
              >
                Voir toute la cote
                <span aria-hidden>→</span>
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
              <BrvmCard
                href="/marches/indices"
                kicker="INDICE · JOUR"
                title="BRVM Composite"
                value={brvmcLive ? fmtNum(brvmcLive.value, 2) : "—"}
                delta={fmtPct(brvmcLive?.variationPct ?? null, 2)}
                positive={(brvmcLive?.variationPct ?? 0) >= 0}
              />
              <BrvmCard
                href="/marches/indices"
                kicker="INDICE · JOUR"
                title="BRVM 30"
                value={brvm30Live ? fmtNum(brvm30Live.value, 2) : "—"}
                delta={fmtPct(brvm30Live?.variationPct ?? null, 2)}
                positive={(brvm30Live?.variationPct ?? 0) >= 0}
              />
              <BrvmCard
                href="/marches/indices"
                kicker="INDICE · JOUR"
                title="BRVM Prestige"
                value={
                  brvmPrestigeLive ? fmtNum(brvmPrestigeLive.value, 2) : "—"
                }
                delta={fmtPct(brvmPrestigeLive?.variationPct ?? null, 2)}
                positive={(brvmPrestigeLive?.variationPct ?? 0) >= 0}
              />
              <BrvmCard
                href={topDailyGainer ? `/titre/${topDailyGainer.code}` : "/marches/actions"}
                kicker="TOP HAUSSE · JOUR"
                title={topDailyGainer?.code ?? "—"}
                value={topDailyGainer?.name ?? "—"}
                delta={
                  topDailyGainer ? fmtPct(topDailyGainer.variationPct, 2) : "—"
                }
                positive
              />
              <BrvmCard
                href={topDailyLoser ? `/titre/${topDailyLoser.code}` : "/marches/actions"}
                kicker="TOP BAISSE · JOUR"
                title={topDailyLoser?.code ?? "—"}
                value={topDailyLoser?.name ?? "—"}
                delta={
                  topDailyLoser ? fmtPct(topDailyLoser.variationPct, 2) : "—"
                }
                positive={false}
              />
            </div>
          </div>

          {/* Section Autres instruments cotes importants */}
          <div className="mt-6 md:mt-8">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                Autres instruments cotés importants
              </div>
              <Link
                href="/macro/matieres-premieres"
                className="text-[11px] text-slate-300 hover:text-white inline-flex items-center gap-1"
              >
                Toutes les matières premières
                <span aria-hidden>→</span>
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
              <BrvmCard
                href="/macro/devises"
                kicker="DEVISE · JOUR"
                title="USD / XOF"
                value={usdXof ? fmtNum(usdXof.last, 2) : "—"}
                delta={fmtPct(usdXof?.changeDayPct ?? null, 2)}
                positive={(usdXof?.changeDayPct ?? 0) >= 0}
              />
              <BrvmCard
                href="/macro/devises"
                kicker="DEVISE · JOUR"
                title="EUR / USD"
                value={eurUsd ? fmtNum(eurUsd.last, 4) : "—"}
                delta={fmtPct(eurUsd?.changeDayPct ?? null, 2)}
                positive={(eurUsd?.changeDayPct ?? 0) >= 0}
              />
              <BrvmCard
                href="/macro/matieres-premieres/cacao"
                kicker="AGRICOLE · JOUR"
                title="Cacao USD/t"
                value={cacao ? fmtNum(cacao.last, 0) : "—"}
                delta={fmtPct(cacao?.changeDayPct ?? null, 2)}
                positive={(cacao?.changeDayPct ?? 0) >= 0}
              />
              <BrvmCard
                href="/macro/matieres-premieres/or"
                kicker="MÉTAL · JOUR"
                title="Or USD/oz"
                value={or ? fmtNum(or.last, 0) : "—"}
                delta={fmtPct(or?.changeDayPct ?? null, 2)}
                positive={(or?.changeDayPct ?? 0) >= 0}
              />
              <BrvmCard
                href="/macro/matieres-premieres/brent"
                kicker="ÉNERGIE · JOUR"
                title="Brent USD/bbl"
                value={brent ? fmtNum(brent.last, 1) : "—"}
                delta={fmtPct(brent?.changeDayPct ?? null, 2)}
                positive={(brent?.changeDayPct ?? 0) >= 0}
              />
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Pourquoi AzimutFinance */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-14 md:py-20">
        <SectionHeader
          kicker="Pourquoi AzimutFinance"
          title="Tout ce qu'il manquait au marché UEMOA, en un seul portail."
          description="Du data brut au magazine éditorial, en passant par les outils analytiques et la formation. Conçu pour les investisseurs particuliers, les pros et les étudiants en finance."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mt-10 md:mt-14">
          <FeatureCard
            color="#1d4ed8"
            kicker="MARCHÉS"
            title="BRVM en clair"
            description="Actions et obligations cotées en quasi réel, indices, top mouvements, analyses approfondies. Données quotidiennes."
            href="/marches/actions"
          />
          <FeatureCard
            color="#b45309"
            kicker="OBLIGATIONS"
            title="UMOA-Titres décrypté"
            description="OAT, BAT, courbes de taux par pays, calculateur YTM/duration et fiches d'émission. Le seul outil dédié aux obligations du monétaire."
            href="/marches/souverains-non-cotes"
          />
          <FeatureCard
            color="#059669"
            kicker="MACRO"
            title="Zone UEMOA en temps réel"
            description="PIB, taux directeurs, inflation, matières premières, FCFA face aux majors, marché immobilier. Le pouls macro de la zone."
            href="/macro/pays"
          />
          <FeatureCard
            color="#7c3aed"
            kicker="ACADÉMIE"
            title="Formations & glossaire"
            description="Formations et certifications permettant de prendre des décisions éclairées, glossaire de 65+ termes contextualisés."
            href="/academie/formations"
          />
          <FeatureCard
            color="#be185d"
            kicker="MAGAZINE"
            title="Azimut Magazine"
            description="Magazine digital mensuel : analyses, dossiers, interviews et chiffres clés. Mode lecture éditorial avec sommaire et articles longs."
            href="/academie/magazine"
          />
          <FeatureCard
            color="#0d9488"
            kicker="GAMING"
            title="Simulateur de portefeuille"
            description="Jeu de portefeuille avec capital virtuel, achats/ventes BRVM, valorisation quotidienne et classement saisonnier. Réservé aux membres."
            href="/academie/simulateur"
          />
        </div>
      </section>

      {/* Spotlight Simulateur — gros highlight */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-14 md:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-14 items-center">
            <div>
              <span className="inline-block text-[11px] uppercase tracking-wider font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded">
                ● Saison en cours
              </span>
              <h2 className="text-3xl md:text-5xl font-bold mt-4 leading-tight">
                Affrontez la BRVM
                <br />
                <span className="text-emerald-300">avec du capital virtuel.</span>
              </h2>
              <p className="text-base md:text-lg text-slate-300 mt-5 leading-relaxed max-w-xl">
                Rejoignez la compétition : passez vos ordres d&apos;achat et de
                vente sur les vraies valeurs cotées BRVM, suivez votre P&amp;L au jour le
                jour, et grimpez dans le classement général. À la clôture de la saison,
                le meilleur portefeuille gagne.
              </p>

              <div className="grid grid-cols-3 gap-3 mt-7 max-w-lg">
                <Stat
                  darkLabel="Capital initial"
                  darkValue={
                    currentSeason
                      ? `${fmtFCFAShort(currentSeason.initial_capital)} FCFA`
                      : "—"
                  }
                />
                <Stat
                  darkLabel="Frais"
                  darkValue={
                    currentSeason
                      ? `${(currentSeason.transaction_fee_pct * 100)
                          .toFixed(2)
                          .replace(/\.?0+$/, "")
                          .replace(".", ",")} % / ordre`
                      : "—"
                  }
                />
                <Stat
                  darkLabel="Durée saison"
                  darkValue={
                    currentSeason
                      ? `${Math.round(
                          (new Date(currentSeason.ends_at + "T00:00:00Z").getTime() -
                            new Date(currentSeason.starts_at + "T00:00:00Z").getTime()) /
                            (1000 * 60 * 60 * 24),
                        )} jours`
                      : "—"
                  }
                />
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/academie/simulateur"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold px-6 py-3 rounded-md text-sm md:text-base transition"
                >
                  Rejoindre la saison →
                </Link>
                <Link
                  href="/inscription"
                  className="bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium px-6 py-3 rounded-md text-sm md:text-base transition"
                >
                  Créer mon compte
                </Link>
              </div>
            </div>

            {/* Mock leaderboard */}
            <div className="bg-white/5 border border-white/10 rounded-xl backdrop-blur p-5 md:p-6">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
                Classement général · Saison 1
              </div>
              <ul className="space-y-2.5">
                {[
                  { rank: 1, name: "amadou_d", value: "12,4 M", perf: "+24,1 %", medal: "🥇" },
                  { rank: 2, name: "fatou.koffi", value: "11,8 M", perf: "+18,3 %", medal: "🥈" },
                  { rank: 3, name: "kouassi92", value: "11,2 M", perf: "+12,6 %", medal: "🥉" },
                  { rank: 4, name: "abdoul_t", value: "10,9 M", perf: "+8,7 %" },
                  { rank: 5, name: "mariame", value: "10,5 M", perf: "+5,2 %" },
                ].map((p) => (
                  <li
                    key={p.rank}
                    className="flex items-center gap-3 px-3 py-2 rounded bg-white/5"
                  >
                    <div className="w-7 text-center">
                      {p.medal ? (
                        <span className="text-base">{p.medal}</span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-400">#{p.rank}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">@{p.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">{p.value}</div>
                      <div className="text-[11px] text-emerald-400 tabular-nums">{p.perf}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 pt-3 border-t border-white/10 text-[11px] text-slate-400 text-center">
                Données illustratives · classement en temps réel sur le simulateur
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Top movers BRVM live */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-14 md:py-20">
        <SectionHeader
          kicker="Marchés"
          title="Les valeurs qui bougent aujourd'hui"
          description="Performances annuelles des actions BRVM. Cliquez pour analyser une valeur en détail."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-10">
          <MoversBlock title="Top hausses YTD" tone="up" stocks={topGainers} />
          <MoversBlock title="Top baisses YTD" tone="down" stocks={topLosers} />
        </div>
        <div className="text-center mt-8">
          <Link
            href="/marches/actions"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"
          >
            Voir toutes les valeurs cotées →
          </Link>
        </div>
      </section>

      {/* Académie + Magazine spotlight */}
      <section className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-14 md:py-20">
          <SectionHeader
            kicker="Apprendre"
            title="L'Académie qui parle vraiment de l'UEMOA"
            description="Des contenus pédagogiques contextualisés sur la BRVM, les obligations souveraines, la BCEAO et les FCP. Formations gratuites pour démarrer, parcours certifiant pour aller loin."
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-10 md:mt-12">
            {/* Article featured */}
            {featuredArticle && (
              <Link
                href={`/academie/magazine/article/${featuredArticle.slug}`}
                className="lg:col-span-2 group bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition overflow-hidden flex flex-col"
              >
                <div
                  className="h-40 md:h-48 relative"
                  style={{
                    background: `linear-gradient(135deg, ${featuredArticle.accent} 0%, ${featuredArticle.accent}cc 100%)`,
                  }}
                >
                  <div className="absolute top-4 left-4 text-[10px] uppercase tracking-wide font-semibold text-white bg-black/20 px-2 py-0.5 rounded">
                    Magazine · {latestIssue?.monthLabel ?? ""}
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

            {/* Mini menu */}
            <div className="space-y-4">
              <Link
                href="/academie/formations"
                className="group block bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md rounded-xl p-5 transition"
              >
                <div className="text-[10px] uppercase tracking-wide font-semibold text-purple-700">
                  Formations
                </div>
                <div className="text-base font-bold text-slate-900 mt-1 group-hover:text-blue-700 transition">
                  {catalog.total} formations · {catalog.freeCount} gratuites
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Du débutant à la certification niveau 1
                </div>
              </Link>
              <Link
                href="/academie/glossaire"
                className="group block bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md rounded-xl p-5 transition"
              >
                <div className="text-[10px] uppercase tracking-wide font-semibold text-blue-700">
                  Glossaire
                </div>
                <div className="text-base font-bold text-slate-900 mt-1 group-hover:text-blue-700 transition">
                  65+ termes contextualisés
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  YTM, OAT, BCEAO, EBITDA, ROCE…
                </div>
              </Link>
              <Link
                href="/academie/magazine"
                className="group block bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md rounded-xl p-5 transition"
              >
                <div className="text-[10px] uppercase tracking-wide font-semibold text-rose-700">
                  Magazine
                </div>
                <div className="text-base font-bold text-slate-900 mt-1 group-hover:text-blue-700 transition">
                  {issuesCount} numéros publiés
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {articlesCount} articles signés
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Tarifs */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-14 md:py-20">
        <SectionHeader
          kicker="Plans"
          title="Choisissez votre niveau d'accès"
          description="Membre gratuit pour démarrer. Premium pour aller plus loin. Pro pour les institutions."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10 md:mt-14">
          <PricingCard
            name="Membre"
            price="Gratuit"
            tagline="Pour découvrir le marché UEMOA"
            features={[
              "Marchés BRVM : cours quotidiens, indices, top mouvements",
              "Obligations · souverains UMOA-Titres · FCP · sociétés de gestion",
              "Macro UEMOA : BCEAO, inflation, immobilier, matières premières",
              `Académie : ${catalog.freeCount} formation${catalog.freeCount > 1 ? "s" : ""} gratuite${catalog.freeCount > 1 ? "s" : ""} + glossaire 65+ termes + suivi compte titre`,
              "Simulateur Ligue Azimut avec classement saisonnier",
              "Magazine éditorial · articles libres",
              "Newsletter",
            ]}
            cta="Créer un compte"
            ctaHref="/inscription"
          />
          <PricingCard
            name="Premium"
            price={`${premiumDisplay.priceFcfa.toLocaleString("fr-FR")} FCFA`}
            priceSuffix={premiumDisplay.suffix}
            tagline="Pour investir avec méthode"
            highlighted
            features={[
              "Tout le plan Membre",
              "Analyses approfondies et recommandations",
              "Courbe des taux souverains UEMOA · analyse obligataire approfondie",
              "Pricing élaboré et simulateur avancé pour les obligations",
              "Fiches détaillées FCP / OPCVM (perf vs catégorie, quartiles, AUM)",
              "Fiches détaillées sociétés de gestion (league table, qualité)",
              "Graphiques avancés (chandeliers OHLC + indicateurs techniques)",
              "Magazine éditorial complet",
            ]}
            cta={premiumCta}
            ctaHref="/premium"
          />
          <PricingCard
            name="Pro"
            price="Sur devis"
            tagline="Pour les institutions financières"
            features={[
              "Tout le plan Premium",
              "Pro Terminal : tableau de bord marché professionnel",
              "Place de marché OTC",
              "Multiple data au format excel",
              "Private equity database",
              "Screener actions avec quadrants stratégiques et risk-return",
              "Screener FCP comparatif (catégorie, AUM, performance)",
              "Watchlists pro",
              "Etudes sectorielles",
              "Studios d'analyse de données",
              "Support dédié et accompagnement personnalisé",
            ]}
            cta="Demander une démo"
            ctaHref="/demande-demo-pro"
          />
        </div>
      </section>

      {/* Témoignages */}
      <section className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-14 md:py-20">
          <SectionHeader
            kicker="Ils utilisent AzimutFinance"
            title="Investisseurs, étudiants, professionnels."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
            <Testimonial
              quote="Enfin un portail qui explique le marché obligataire UEMOA sans détour. Le calculateur YTM m'a fait gagner un temps fou."
              author="Aïssatou D."
              role="Gérante de portefeuille, Dakar"
            />
            <Testimonial
              quote="J'ai construit ma stratégie BRVM en 6 mois grâce aux formations et au simulateur. Le magazine est ma lecture du dimanche."
              author="Mamadou K."
              role="Investisseur particulier, Abidjan"
            />
            <Testimonial
              quote="Les données sont propres, le glossaire est solide, les outils sont pertinents. AzimutFinance comble un vrai vide."
              author="Pierre M."
              role="Analyste sell-side, Cotonou"
            />
          </div>
        </div>
      </section>

      {/* CTA final + newsletter — uniquement pour les visiteurs */}
      {!memberContext && (
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900" />
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative max-w-4xl mx-auto px-4 md:px-6 py-14 md:py-20 text-center text-white">
          <h2 className="text-3xl md:text-5xl font-bold leading-tight">
            Prêt à investir avec méthode ?
          </h2>
          <p className="text-base md:text-lg text-blue-100 mt-4 max-w-2xl mx-auto leading-relaxed">
            Inscription gratuite en 30 secondes.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 justify-center">
            <Link
              href="/inscription"
              className="bg-white text-blue-900 hover:bg-blue-50 font-semibold px-6 py-3 rounded-md text-sm md:text-base transition shadow-lg"
            >
              Créer mon compte gratuit →
            </Link>
            <Link
              href="/communaute/newsletter"
              className="bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium px-6 py-3 rounded-md text-sm md:text-base transition"
            >
              S&apos;abonner à la newsletter
            </Link>
          </div>
          <div className="mt-6 text-[11px] text-blue-200/70">
            En vous inscrivant, vous acceptez nos CGU et notre politique de confidentialité.
          </div>
        </div>
      </section>
      )}
    </div>
  );
}

// =============================================================================
// SOUS-COMPONENTS
// =============================================================================

function BrvmCard({
  href,
  kicker,
  title,
  value,
  delta,
  positive,
}: {
  href: string;
  kicker: string;
  title: string;
  value: string;
  delta: string;
  positive: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/25 rounded-lg p-3 md:p-3.5 transition"
    >
      <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">
        {kicker}
      </div>
      <div className="text-sm md:text-base font-semibold text-white mt-1 leading-tight truncate">
        {title}
      </div>
      <div className="text-xs md:text-sm tabular-nums text-slate-300 mt-0.5 truncate">
        {value}
      </div>
      <div
        className={`text-[11px] tabular-nums font-medium mt-0.5 ${
          positive ? "text-emerald-400" : "text-rose-400"
        }`}
      >
        {delta}
      </div>
      <span
        className="absolute top-2.5 right-2.5 text-slate-500 group-hover:text-white transition"
        aria-hidden
      >
        →
      </span>
    </Link>
  );
}

function BigNumber({
  number,
  label,
  sub,
}: {
  number: string;
  label: string;
  sub: string;
}) {
  return (
    <div>
      <div className="text-3xl md:text-4xl font-bold tabular-nums text-slate-900">
        {number}
      </div>
      <div className="text-sm font-medium text-slate-700 mt-1">{label}</div>
      <div className="text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function SectionHeader({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-blue-700">
        {kicker}
      </div>
      <h2
        className="text-2xl md:text-4xl font-bold text-slate-900 mt-2 leading-tight"
        style={{ letterSpacing: "-0.02em" }}
      >
        {title}
      </h2>
      {description && (
        <p className="text-sm md:text-base text-slate-600 mt-3 leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

function FeatureCard({
  color,
  kicker,
  title,
  description,
  href,
}: {
  color: string;
  kicker: string;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block bg-white border border-slate-200 hover:border-slate-300 hover:shadow-lg rounded-xl overflow-hidden transition"
    >
      <div
        className="h-1 w-full"
        style={{ background: color }}
      />
      <div className="p-5 md:p-6">
        <div
          className="text-[10px] uppercase tracking-widest font-bold mb-1.5"
          style={{ color }}
        >
          {kicker}
        </div>
        <h3 className="text-lg md:text-xl font-bold text-slate-900 group-hover:text-blue-700 transition">
          {title}
        </h3>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">{description}</p>
        <div className="mt-3 text-xs font-semibold text-slate-500 group-hover:text-blue-700 group-hover:translate-x-0.5 transition inline-flex items-center gap-1">
          Découvrir
          <span>→</span>
        </div>
      </div>
    </Link>
  );
}

function Stat({
  darkLabel,
  darkValue,
}: {
  darkLabel: string;
  darkValue: string;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">
        {darkLabel}
      </div>
      <div className="text-base font-semibold text-white tabular-nums mt-0.5">
        {darkValue}
      </div>
    </div>
  );
}

function MoversBlock({
  title,
  tone,
  stocks,
}: {
  title: string;
  tone: "up" | "down";
  /** ytdChange en pourcentage (ex 12.5 = +12,5 %) */
  stocks: { code: string; name: string; sector: string; ytdChange: number }[];
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
          {tone === "up" ? "↑ Hausses" : "↓ Baisses"}
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {stocks.length === 0 ? (
          <li className="px-5 py-4 text-xs text-slate-400">Pas de données.</li>
        ) : (
          stocks.map((s) => (
            <li key={s.code}>
              <Link
                href={`/titre/${s.code}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 group"
              >
                <div className="w-12 text-sm font-bold text-slate-900">{s.code}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 group-hover:text-blue-700 truncate">
                    {s.name.trim()}
                  </div>
                  <div className="text-[10px] text-slate-500">{s.sector}</div>
                </div>
                <div
                  className={`text-base font-bold tabular-nums ${
                    s.ytdChange >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {s.ytdChange >= 0 ? "+" : ""}
                  {s.ytdChange.toFixed(1).replace(".", ",")} %
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function PricingCard({
  name,
  price,
  priceSuffix,
  tagline,
  features,
  cta,
  ctaHref,
  highlighted,
}: {
  name: string;
  price: string;
  priceSuffix?: string;
  tagline: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`relative rounded-xl p-6 md:p-8 transition ${
        highlighted
          ? "bg-gradient-to-br from-blue-50 via-white to-blue-50 border-2 border-blue-700 shadow-lg shadow-blue-100"
          : "bg-white border border-slate-200"
      }`}
    >
      {highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-700 text-white text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded">
          Le plus choisi
        </span>
      )}
      <div className="text-sm font-bold text-slate-900 uppercase tracking-wide">{name}</div>
      <p className="text-xs text-slate-500 mt-1">{tagline}</p>
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="text-4xl font-bold text-slate-900 tabular-nums">{price}</span>
        {priceSuffix && (
          <span className="text-sm text-slate-500">{priceSuffix}</span>
        )}
      </div>
      <ul className="mt-6 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`shrink-0 mt-0.5 ${highlighted ? "text-blue-700" : "text-emerald-600"}`}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref}
        className={`block w-full mt-7 text-center font-semibold py-3 rounded-md text-sm transition ${
          highlighted
            ? "bg-blue-700 hover:bg-blue-800 text-white shadow-md"
            : "bg-slate-900 hover:bg-slate-700 text-white"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

function Testimonial({
  quote,
  author,
  role,
}: {
  quote: string;
  author: string;
  role: string;
}) {
  return (
    <figure className="bg-white border border-slate-200 rounded-xl p-5 md:p-6">
      <div className="text-blue-700 text-3xl leading-none font-serif" aria-hidden>
        &ldquo;
      </div>
      <blockquote
        className="text-sm md:text-base text-slate-800 leading-relaxed mt-1"
        style={{ fontFamily: "Georgia, serif" }}
      >
        {quote}
      </blockquote>
      <figcaption className="mt-4 pt-4 border-t border-slate-100">
        <div className="text-sm font-semibold text-slate-900">{author}</div>
        <div className="text-[11px] text-slate-500">{role}</div>
      </figcaption>
    </figure>
  );
}

// =============================================================================
// HERO MEMBRE CONNECTE (dashboard)
// =============================================================================

type MemberContext = {
  displayName: string;
  season: Awaited<ReturnType<typeof getCurrentSeason>>;
  snapshot: Awaited<ReturnType<typeof getPortfolioSnapshot>>;
  rank: number | null;
  totalPlayers: number;
  unread: number;
};

function MemberDashboardHero({
  context,
  featuredArticle,
}: {
  context: MemberContext;
  featuredArticle: Awaited<ReturnType<typeof listPublishedArticles>>[number] | undefined;
}) {
  const { displayName, season, snapshot, rank, totalPlayers, unread } = context;

  // Calcul jours restants saison
  let daysToEnd: number | null = null;
  if (season) {
    const today = new Date();
    const end = new Date(season.ends_at + "T00:00:00Z");
    daysToEnd = Math.max(
      0,
      Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    );
  }

  // Couleur perf selon valeur
  const perf = snapshot?.totalReturn ?? null;
  const perfColor =
    perf === null
      ? "text-slate-300"
      : perf >= 0
      ? "text-emerald-300"
      : "text-rose-300";

  return (
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
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 md:px-6 pt-10 md:pt-14 pb-10 md:pb-14">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-7">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-blue-300">
              Espace membre
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mt-1.5 leading-tight">
              Bonjour {displayName} 👋
            </h1>
            <p className="text-sm md:text-base text-slate-300 mt-2">
              {season
                ? `Saison ${season.name.toLowerCase()} en cours${
                    daysToEnd !== null ? ` · clôture dans ${daysToEnd} jours` : ""
                  }`
                : "Tout est prêt pour votre prochain investissement."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/messagerie"
              className="relative bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium px-4 py-2 rounded-md text-sm transition flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Messagerie
              {unread > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <Link
              href="/compte"
              className="bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium px-4 py-2 rounded-md text-sm transition"
            >
              Mon compte
            </Link>
          </div>
        </div>

        {/* Tiles dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {/* Tile 1 : portefeuille */}
          {snapshot && season ? (
            <Link
              href="/academie/simulateur"
              className="group bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl p-5 backdrop-blur transition"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                  Mon portefeuille simulateur
                </div>
                {rank !== null && (
                  <div className="text-xs text-slate-300">
                    Rang <span className="font-bold text-white">#{rank}</span>
                    {totalPlayers > 0 && (
                      <span className="text-slate-400">/{totalPlayers}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="text-3xl md:text-4xl font-bold tabular-nums">
                {fmtFCFAShort(snapshot.totalValue)}
                <span className="text-sm text-slate-400 font-normal ml-1.5">FCFA</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-base font-semibold tabular-nums ${perfColor}`}>
                  {fmtPct(perf, 2)}
                </span>
                <span className="text-[11px] text-slate-400">
                  vs {fmtFCFAShort(snapshot.initialCapital)} initial
                </span>
              </div>
              <div className="mt-3 text-xs text-blue-300 group-hover:underline">
                Passer un ordre →
              </div>
            </Link>
          ) : season ? (
            <Link
              href="/academie/simulateur"
              className="group bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-5 backdrop-blur transition"
            >
              <div className="text-[11px] uppercase tracking-wide text-emerald-300 font-semibold">
                ★ Saison ouverte
              </div>
              <div className="text-xl md:text-2xl font-bold mt-2 leading-tight">
                Rejoindre la saison
              </div>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                Recevez {fmtFCFAShort(season.initial_capital)} FCFA virtuels et défiez les autres
                membres sur la BRVM.
              </p>
              <div className="mt-3 text-xs text-emerald-300 group-hover:underline">
                Commencer à jouer →
              </div>
            </Link>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                Simulateur
              </div>
              <div className="text-base font-semibold mt-1.5">
                Aucune saison active
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Une nouvelle saison ouvrira prochainement.
              </p>
            </div>
          )}

          {/* Tile 2 : messagerie */}
          <Link
            href="/messagerie"
            className="group bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl p-5 backdrop-blur transition"
          >
            <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
              Messagerie
            </div>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-3xl md:text-4xl font-bold tabular-nums">
                {unread}
              </span>
              <span className="text-sm text-slate-300">
                {unread === 0
                  ? "Aucun nouveau message"
                  : unread === 1
                  ? "message non lu"
                  : "messages non lus"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Échangez en privé avec les autres membres : analyses, idées, opportunités.
            </p>
            <div className="mt-3 text-xs text-blue-300 group-hover:underline">
              Ouvrir la messagerie →
            </div>
          </Link>

          {/* Tile 3 : article featured */}
          {featuredArticle ? (
            <Link
              href={`/academie/magazine/article/${featuredArticle.slug}`}
              className="group bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl p-5 backdrop-blur transition flex flex-col"
            >
              <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                À la une du magazine
              </div>
              <div
                className="text-base md:text-lg font-bold mt-2 leading-snug line-clamp-3"
                style={{ fontFamily: "Georgia, serif" }}
              >
                {featuredArticle.title}
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed line-clamp-3 flex-1">
                {featuredArticle.excerpt}
              </p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {featuredArticle.readingTimeMinutes} min de lecture
                </span>
                <span className="text-blue-300 group-hover:underline">Lire →</span>
              </div>
            </Link>
          ) : null}
        </div>

        {/* Quick links horizontaux */}
        <div className="mt-6 flex flex-wrap gap-2">
          <QuickPill href="/marches/actions" icon="📊">
            Marchés BRVM
          </QuickPill>
          <QuickPill href="/marche-monetaire" icon="💱">
            Marché monétaire
          </QuickPill>
          <QuickPill href="/macro/matieres-premieres" icon="🌾">
            Matières premières
          </QuickPill>
          <QuickPill href="/macro/devises" icon="💵">
            Devises &amp; FX
          </QuickPill>
          <QuickPill href="/academie/formations" icon="🎓">
            Formations
          </QuickPill>
          <QuickPill href="/academie/glossaire" icon="📖">
            Glossaire
          </QuickPill>
        </div>
      </div>
    </section>
  );
}

function QuickPill({
  href,
  icon,
  children,
}: {
  href: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-medium px-3 py-1.5 rounded-full transition flex items-center gap-1.5"
    >
      <span>{icon}</span>
      <span>{children}</span>
    </Link>
  );
}


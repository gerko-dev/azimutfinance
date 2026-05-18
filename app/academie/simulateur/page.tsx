import Link from "next/link";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import EquityCurveChart from "@/components/academie/simulateur/EquityCurveChart";
import IntroPhaseView from "@/components/academie/simulateur/IntroPhaseView";
import JoinSeasonButton from "@/components/academie/simulateur/JoinSeasonButton";
import Leaderboard from "@/components/academie/simulateur/Leaderboard";
import PositionsTable from "@/components/academie/simulateur/PositionsTable";
import SeasonBanner from "@/components/academie/simulateur/SeasonBanner";
import SimulatorShell from "@/components/academie/simulateur/SimulatorShell";
import TransactionsLog from "@/components/academie/simulateur/TransactionsLog";
import { fmtDateFr, fmtFCFA } from "@/components/academie/simulateur/format";
import { getLatestPrices } from "@/lib/simulator/pricing";
import {
  getCurrentSeason,
  getEquityCurve,
  getIntroSnapshot,
  getLeaderboard,
  getMyOrders,
  getMyPortfolio,
  getPortfolioSnapshot,
  getTransactions,
  listSeasons,
} from "@/lib/simulator/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Ligue Azimut — AzimutFinance",
  description:
    "Compétition de portefeuille BRVM par saisons : capital virtuel, achats/ventes, valorisation quotidienne et classement général. Réservée aux membres AzimutFinance.",
  path: "/academie/simulateur",
});

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth gate
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <div className="bg-white rounded-lg border border-slate-200 p-6 md:p-10 text-center">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
              Académie · Ligue Azimut
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mt-2">
              Ligue Azimut — réservée aux membres
            </h1>
            <p className="text-sm text-slate-600 mt-3 max-w-xl mx-auto leading-relaxed">
              La Ligue Azimut est une compétition saisonnière de portefeuille : capital virtuel,
              ordres d&apos;achat et de vente sur la BRVM, valorisation au jour le jour et
              classement général en fin de saison. Connectez-vous pour participer.
            </p>
            <div className="mt-6 flex justify-center gap-3 flex-wrap">
              <Link
                href="/connexion?redirect=/academie/simulateur"
                className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-5 py-2.5 rounded transition"
              >
                Se connecter
              </Link>
              <Link
                href="/inscription?redirect=/academie/simulateur"
                className="text-sm bg-white hover:bg-slate-50 text-slate-900 font-medium px-5 py-2.5 rounded border border-slate-300 transition"
              >
                Créer un compte
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Saison courante (intro ou active)
  const season = await getCurrentSeason();
  if (!season) {
    // Aucune saison ouverte : on remplit la page avec un vrai teaser de la
    // Ligue Azimut plutôt qu'un simple message d'attente.
    const pastSeasons = (await listSeasons()).filter(
      (s) => s.status === "ended",
    );
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <PageHero
          breadcrumb={[
            { label: "Accueil", href: "/" },
            { label: "Académie" },
            { label: "Ligue Azimut" },
          ]}
          title="La Ligue Azimut"
          subtitle="La compétition de portefeuille sur la BRVM : capital virtuel, vraies valeurs cotées, valorisation quotidienne et classement saisonnier."
        >
          <span className="inline-block text-[11px] uppercase tracking-wider font-semibold bg-white/10 text-slate-200 border border-white/20 px-2.5 py-1 rounded">
            ○ Aucune saison ouverte actuellement
          </span>
        </PageHero>

        <main className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-14 space-y-12 md:space-y-16">
          {/* Accroche */}
          <section className="text-center max-w-2xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">
              Affrontez la BRVM avec du capital virtuel
            </h2>
            <p className="text-sm md:text-base text-slate-600 mt-3 leading-relaxed">
              La Ligue Azimut est un jeu de portefeuille saisonnier : à chaque
              saison, tous les participants démarrent avec le même capital
              virtuel et investissent sur les vraies actions cotées à la BRVM.
              Le meilleur portefeuille à la clôture remporte la saison.{" "}
              <span className="text-slate-900 font-medium">
                Aucune saison n&apos;est ouverte pour l&apos;instant
              </span>{" "}
              — la prochaine sera annoncée bientôt.
            </p>
          </section>

          {/* Comment ça marche */}
          <section>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 text-center">
              Comment ça marche
            </div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 text-center mt-1">
              Quatre étapes, une saison
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              {[
                {
                  n: "1",
                  t: "Recevez un capital virtuel",
                  d: "À l'ouverture de chaque saison, chaque participant démarre avec le même capital en FCFA virtuels.",
                },
                {
                  n: "2",
                  t: "Investissez sur la BRVM",
                  d: "Passez vos ordres d'achat et de vente sur les vraies actions cotées, aux cours réels du marché.",
                },
                {
                  n: "3",
                  t: "Suivez votre performance",
                  d: "Portefeuille valorisé chaque jour : courbe d'équité, P&L réalisé et latent, positions détaillées.",
                },
                {
                  n: "4",
                  t: "Grimpez au classement",
                  d: "Un classement général en temps réel. À la clôture, le meilleur portefeuille remporte la saison.",
                },
              ].map((step) => (
                <div
                  key={step.n}
                  className="bg-white rounded-lg border border-slate-200 p-5"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-sm">
                    {step.n}
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-3">
                    {step.t}
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    {step.d}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Pourquoi participer */}
          <section>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 text-center">
              Pourquoi participer
            </div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 text-center mt-1">
              Apprendre les marchés en jouant
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              {[
                {
                  icon: "🛡️",
                  t: "Apprenez sans risque",
                  d: "Le capital est entièrement virtuel : testez vos stratégies, vos erreurs ne coûtent rien.",
                },
                {
                  icon: "📊",
                  t: "Conditions de marché réelles",
                  d: "Cours BRVM réels, frais de transaction, valorisation quotidienne — comme un vrai compte-titres.",
                },
                {
                  icon: "🏆",
                  t: "Esprit de compétition",
                  d: "Mesurez-vous aux autres membres et suivez votre progression dans le classement général.",
                },
                {
                  icon: "🚀",
                  t: "La Course à l'introduction",
                  d: "Chaque saison s'ouvre par une phase spéciale d'allocation du pool, avant le coup d'envoi.",
                },
              ].map((c) => (
                <div
                  key={c.t}
                  className="bg-white rounded-lg border border-slate-200 p-5 flex gap-4"
                >
                  <div className="text-2xl shrink-0">{c.icon}</div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {c.t}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {c.d}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Saisons précédentes (si historique) */}
          {pastSeasons.length > 0 && (
            <section>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 text-center">
                Palmarès
              </div>
              <h2 className="text-lg md:text-xl font-bold text-slate-900 text-center mt-1">
                Saisons précédentes
              </h2>
              <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 mt-6 max-w-2xl mx-auto">
                {pastSeasons.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {s.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        Du {fmtDateFr(s.starts_at)} au {fmtDateFr(s.ends_at)}
                      </div>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded shrink-0">
                      Terminée
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* CTA — en attendant la prochaine saison */}
          <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white rounded-xl p-6 md:p-10 text-center">
            <h2 className="text-xl md:text-2xl font-bold">
              En attendant la prochaine saison
            </h2>
            <p className="text-sm text-slate-300 mt-2 max-w-xl mx-auto leading-relaxed">
              Préparez-vous : explorez le marché BRVM, révisez les fondamentaux
              avec l&apos;Académie et affûtez votre stratégie pour le coup
              d&apos;envoi.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/marches/actions"
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold px-5 py-2.5 rounded-md text-sm transition"
              >
                Explorer le marché BRVM →
              </Link>
              <Link
                href="/academie/formations"
                className="bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium px-5 py-2.5 rounded-md text-sm transition"
              >
                Voir les formations
              </Link>
              <Link
                href="/academie/glossaire"
                className="bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium px-5 py-2.5 rounded-md text-sm transition"
              >
                Glossaire financier
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const existingPortfolio = await getMyPortfolio(season.id);
  const allLatestPrices = getLatestPrices().sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  const stockNames: Record<string, string> = {};
  for (const s of allLatestPrices) stockNames[s.code] = s.name;

  // === COURSE À L'INTRODUCTION ===
  // Vue dédiée focalisée, SANS sidebar.
  if (season.status === "intro") {
    if (!existingPortfolio) {
      return (
        <div className="min-h-screen bg-slate-50">
          <Header />
          <main className="max-w-3xl mx-auto px-4 md:px-6 py-12 text-center">
            <div className="bg-white rounded-lg border border-slate-200 p-6 md:p-10">
              <h1 className="text-2xl font-semibold text-slate-900">
                Inscriptions closes pour cette saison
              </h1>
              <p className="text-sm text-slate-600 mt-3">
                La Course à l&apos;introduction de la saison &laquo;&nbsp;{season.name}
                &nbsp;&raquo; est déjà lancée — rendez-vous à la prochaine saison.
              </p>
            </div>
          </main>
        </div>
      );
    }
    const intro = await getIntroSnapshot(season.id);
    if (!intro) {
      return (
        <div className="min-h-screen bg-slate-50">
          <Header />
          <main className="max-w-3xl mx-auto px-4 py-12 text-center">
            <h1 className="text-xl font-semibold">Course à l&apos;introduction indisponible</h1>
          </main>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-6 space-y-5">
          <div className="text-xs text-slate-500">
            Accueil &rsaquo; Académie &rsaquo; Ligue Azimut
          </div>
          <IntroPhaseView
            season={intro.season}
            pool={intro.pool}
            myCash={intro.myCash}
            myPositions={intro.myPositions}
            myTotalSpent={intro.myTotalSpent}
            myTotalUnits={intro.myTotalUnits}
            myPoolTransactions={intro.myPoolTransactions}
            totalPoolValue={intro.totalPoolValue}
            totalRemainingValue={intro.totalRemainingValue}
            stockNames={stockNames}
          />
        </main>
      </div>
    );
  }

  // === SAISON ACTIVE SANS PORTEFEUILLE ===
  // Écran d'invitation à rejoindre, SANS sidebar.
  if (!existingPortfolio) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-5">
          <SeasonBanner season={season} />
          <div className="bg-white rounded-lg border border-slate-200 p-6 md:p-10 text-center">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
              Bienvenue dans la Ligue Azimut
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mt-2">
              Rejoignez la saison en cours
            </h1>
            <p className="text-sm text-slate-600 mt-3 max-w-xl mx-auto leading-relaxed">
              Vous recevrez {fmtFCFA(season.initial_capital)} FCFA virtuels pour acheter et vendre
              des actions cotées à la BRVM jusqu&apos;au {fmtDateFr(season.ends_at)}.
            </p>
            <div className="mt-6 max-w-md mx-auto">
              <JoinSeasonButton
                seasonId={season.id}
                initialCapital={season.initial_capital}
              />
            </div>
          </div>
        </main>
      </div>
    );
  }

  // === SAISON ACTIVE AVEC PORTEFEUILLE ===
  // Vue Aperçu dans la shell.
  const snapshot = await getPortfolioSnapshot(season.id);
  if (!snapshot) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-12 text-center">
          <h1 className="text-xl font-semibold">Erreur de chargement</h1>
        </main>
      </div>
    );
  }
  const transactions = await getTransactions(existingPortfolio.id);
  const [leaderboard, equityCurve, orders] = await Promise.all([
    getLeaderboard(season.id),
    getEquityCurve(existingPortfolio, season.initial_capital, transactions),
    getMyOrders(season.id),
  ]);
  const myRank = leaderboard.find((e) => e.userId === user.id)?.rank ?? null;

  return (
    <SimulatorShell
      season={season}
      cash={snapshot.cash}
      marketValue={snapshot.marketValue}
      totalValue={snapshot.totalValue}
      initialCapital={snapshot.initialCapital}
      myRank={myRank}
      totalPlayers={leaderboard.length}
      openOrdersCount={orders.open.length}
      realizedPL={snapshot.realizedPL}
      unrealizedPL={snapshot.unrealizedPL}
    >
      <div className="p-4 md:p-6 space-y-5">
        {/* En-tête */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
            Vue d&apos;ensemble
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            Bonjour 👋
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Saison &laquo;&nbsp;{season.name}&nbsp;&raquo; · clôture le{" "}
            {fmtDateFr(season.ends_at)}
          </p>
        </div>

        {/* Equity curve grande */}
        <EquityCurveChart
          data={equityCurve}
          initialCapital={season.initial_capital}
        />

        {/* Layout 2 colonnes */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
          <div className="space-y-5 min-w-0">
            <PositionsTable positions={snapshot.positions} stockNames={stockNames} />
            <TransactionsLog transactions={transactions.slice(0, 10)} />
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <Leaderboard entries={leaderboard.slice(0, 10)} currentUserId={user.id} />
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-[11px] text-slate-600 leading-relaxed">
              <div className="text-xs font-semibold text-slate-900 mb-1.5">Raccourcis</div>
              <ul className="space-y-1.5">
                <li>
                  <Link
                    href="/academie/simulateur/carnet"
                    className="text-amber-700 hover:underline font-medium"
                  >
                    Carnet d&apos;ordres →
                  </Link>{" "}
                  ladder, depth, tape, chandelier
                </li>
                <li>
                  <Link
                    href="/academie/simulateur/marche"
                    className="text-amber-700 hover:underline font-medium"
                  >
                    Marché →
                  </Link>{" "}
                  tous les titres BRVM
                </li>
                <li>
                  <Link
                    href="/academie/simulateur/performance"
                    className="text-amber-700 hover:underline font-medium"
                  >
                    Performance →
                  </Link>{" "}
                  attribution par titre
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </SimulatorShell>
  );
}

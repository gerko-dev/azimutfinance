import Link from "next/link";
import Header from "@/components/Header";
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
} from "@/lib/simulator/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Ligue Azimut — AzimutFinance",
  description:
    "Compétition de portefeuille BRVM par saisons : capital virtuel, achats/ventes, valorisation quotidienne et classement général. Réservée aux membres AzimutFinance.",
};

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
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <div className="bg-white rounded-lg border border-slate-200 p-6 md:p-10 text-center">
            <h1 className="text-2xl font-semibold text-slate-900">
              Aucune saison active pour le moment
            </h1>
            <p className="text-sm text-slate-600 mt-3">
              Une nouvelle saison sera ouverte prochainement. Restez à l&apos;écoute.
            </p>
          </div>
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

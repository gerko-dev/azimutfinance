import Link from "next/link";
import Header from "@/components/Header";
import EquityCurveChart from "@/components/academie/simulateur/EquityCurveChart";
import JoinSeasonButton from "@/components/academie/simulateur/JoinSeasonButton";
import Leaderboard from "@/components/academie/simulateur/Leaderboard";
import OrderPanel from "@/components/academie/simulateur/OrderPanel";
import PortfolioHeader from "@/components/academie/simulateur/PortfolioHeader";
import PositionsTable from "@/components/academie/simulateur/PositionsTable";
import SeasonBanner from "@/components/academie/simulateur/SeasonBanner";
import TransactionsLog from "@/components/academie/simulateur/TransactionsLog";
import { fmtDateFr, fmtFCFA } from "@/components/academie/simulateur/format";
import { getLatestPrices } from "@/lib/simulator/pricing";
import {
  getCurrentSeason,
  getEquityCurve,
  getLeaderboard,
  getMyPortfolio,
  getPortfolioSnapshot,
  getTransactions,
} from "@/lib/simulator/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Simulateur de portefeuille — AzimutFinance",
  description:
    "Jeu de portefeuille BRVM avec saisons, achats/ventes, valorisation quotidienne et classement général. Réservé aux membres AzimutFinance.",
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
              Académie · Simulateur
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mt-2">
              Simulateur de portefeuille — réservé aux membres
            </h1>
            <p className="text-sm text-slate-600 mt-3 max-w-xl mx-auto leading-relaxed">
              Le simulateur est un jeu de portefeuille avec saisons : capital virtuel, ordres
              d&apos;achat et de vente sur la BRVM, valorisation au jour le jour et classement
              général en fin de saison. Connectez-vous pour participer.
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
            <p className="text-[11px] text-slate-400 mt-4">
              Inscription gratuite · pas d&apos;argent réel · clôture saison en {/* placeholder */}
              quelques semaines.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Saison active
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

  // Verifier si l'utilisateur a deja un portefeuille pour cette saison
  const existingPortfolio = await getMyPortfolio(season.id);

  // Liste des stocks (pour pickers + noms)
  const allLatestPrices = getLatestPrices().sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  const stockNames: Record<string, string> = {};
  for (const s of allLatestPrices) stockNames[s.code] = s.name;

  if (!existingPortfolio) {
    // Pas encore inscrit a cette saison : ecran d'invitation
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-5">
          <SeasonBanner season={season} />
          <div className="bg-white rounded-lg border border-slate-200 p-6 md:p-10 text-center">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
              Bienvenue dans le simulateur
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mt-2">
              Rejoignez la saison en cours
            </h1>
            <p className="text-sm text-slate-600 mt-3 max-w-xl mx-auto leading-relaxed">
              Vous recevrez {fmtFCFA(season.initial_capital)} FCFA virtuels pour acheter et vendre
              des actions cotées à la BRVM jusqu&apos;au {fmtDateFr(season.ends_at)}. Frais de
              transaction : {(season.transaction_fee_pct * 100).toFixed(2).replace(".", ",")} %.
              Classement publié en temps réel. À la clôture, le portefeuille avec la meilleure
              valeur totale est sacré champion de la saison.
            </p>
            <div className="mt-6 max-w-md mx-auto">
              <JoinSeasonButton
                seasonId={season.id}
                initialCapital={season.initial_capital}
              />
            </div>
            <ul className="text-xs text-slate-600 mt-6 max-w-md mx-auto space-y-1.5 text-left">
              <Bullet>Achetez ou vendez n&apos;importe quelle valeur BRVM disponible</Bullet>
              <Bullet>Exécution au dernier cours de clôture connu</Bullet>
              <Bullet>Frais réalistes prélevés à chaque transaction</Bullet>
              <Bullet>Valorisation quotidienne automatique</Bullet>
              <Bullet>Classement actualisé en continu</Bullet>
            </ul>
          </div>
        </main>
      </div>
    );
  }

  // Tableau de bord complet
  const snapshot = await getPortfolioSnapshot(season.id);
  if (!snapshot) {
    // Edge case : portefeuille supprime entre les deux requetes
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-12 text-center">
          <h1 className="text-xl font-semibold">Erreur de chargement</h1>
          <p className="text-sm text-slate-600 mt-2">Recharger la page.</p>
        </main>
      </div>
    );
  }
  const transactions = await getTransactions(existingPortfolio.id);
  const leaderboard = await getLeaderboard(season.id);
  const equityCurve = await getEquityCurve(
    existingPortfolio,
    season.initial_capital,
    transactions,
  );

  const myRank = leaderboard.find((e) => e.userId === user.id)?.rank ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-6 space-y-5">
        <div className="text-xs text-slate-500">
          Accueil &rsaquo; Académie &rsaquo; Simulateur de portefeuille
        </div>

        {/* Bandeau saison */}
        <SeasonBanner
          season={season}
          myRank={myRank}
          totalPlayers={leaderboard.length}
        />

        {/* KPIs portefeuille */}
        <PortfolioHeader snapshot={snapshot} />

        {/* Layout principal : col gauche (gestion) + col droite (classement) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
          <div className="space-y-5 min-w-0">
            {/* Ordre + courbe d'equity */}
            <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-5">
              <OrderPanel
                seasonId={season.id}
                cash={snapshot.cash}
                positions={snapshot.positions}
                feePct={season.transaction_fee_pct}
                stocks={allLatestPrices}
              />
              <EquityCurveChart
                data={equityCurve}
                initialCapital={season.initial_capital}
              />
            </div>

            {/* Positions */}
            <PositionsTable positions={snapshot.positions} stockNames={stockNames} />

            {/* Journal des transactions */}
            <TransactionsLog transactions={transactions} />
          </div>

          {/* Aside : leaderboard sticky */}
          <aside className="lg:sticky lg:top-4 lg:self-start space-y-4">
            <Leaderboard entries={leaderboard} currentUserId={user.id} />

            {/* Aide rapide */}
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-[11px] text-slate-600 leading-relaxed">
              <div className="text-xs font-semibold text-slate-900 mb-1.5">Règles rapides</div>
              <ul className="space-y-1">
                <li>· Capital initial : {fmtFCFA(season.initial_capital)} FCFA</li>
                <li>
                  · Frais : {(season.transaction_fee_pct * 100).toFixed(2).replace(".", ",")} %
                  par ordre
                </li>
                <li>· Exécution au dernier cours de clôture connu</li>
                <li>· Une saison = 1 portefeuille par membre</li>
                <li>· Classement par valeur totale (cash + titres)</li>
                <li>· Clôture : {fmtDateFr(season.ends_at)}</li>
              </ul>
            </div>
          </aside>
        </div>

        {/* Methodologie */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-sm font-semibold mb-2">Comment ça marche</h3>
          <div className="text-xs text-slate-600 space-y-1.5">
            <p>
              <strong>Saisons :</strong> chaque saison a une date de début, une date de clôture
              et un capital initial uniforme. À la clôture, le portefeuille avec la valeur totale
              la plus élevée est sacré champion.
            </p>
            <p>
              <strong>Ordres :</strong> achats et ventes sont exécutés au dernier cours de clôture
              connu pour la valeur. Pas de cours intra-séance ni d&apos;ordres limites — c&apos;est
              voulu pour rester simple et juste entre joueurs.
            </p>
            <p>
              <strong>Frais :</strong> chaque transaction (achat ou vente) prélève un frais en
              pourcentage du brut. Pour la saison en cours :{" "}
              {(season.transaction_fee_pct * 100).toFixed(2).replace(".", ",")} %. Le frais est
              ajouté au coût d&apos;un achat et déduit du produit d&apos;une vente.
            </p>
            <p>
              <strong>Valorisation :</strong> votre portefeuille est revalorisé en continu
              (cash + somme des unités × dernier cours). La courbe d&apos;équité est échantillonnée
              hebdomadairement pour la lisibilité.
            </p>
            <p>
              <strong>Plus-value latente vs réalisée :</strong> latente = différence entre valeur
              de marché et coût d&apos;achat des positions ouvertes. Réalisée = gains/pertes des
              positions vendues, calculés au PRU (prix de revient unitaire) du moment de la vente.
            </p>
            <p>
              <strong>Limites :</strong> pas de dividendes ni de splits dans le simulateur ;
              certains titres peu liquides peuvent ne pas avoir de cours sur certaines dates
              (forward-fill du dernier prix connu) ; le marché secondaire des obligations cotées
              n&apos;est pas modélisé pour l&apos;instant.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-emerald-600 mt-0.5">✓</span>
      <span>{children}</span>
    </li>
  );
}

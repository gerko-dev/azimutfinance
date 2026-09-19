import Lien from "@/components/NavigationProgress";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAccountEquityCurve,
  getAccountSnapshot,
  getMarketFees,
  getMyAccount,
  getTpsRates,
  listAccountTransactions,
} from "@/lib/comptetitre/queries";
import AccountKPIs from "@/components/outils/portefeuille/AccountKPIs";
import AllocationCard from "@/components/outils/portefeuille/AllocationCard";
import EquityCurveChart from "@/components/outils/portefeuille/EquityCurveChart";
import PositionsTable from "@/components/outils/portefeuille/PositionsTable";
import TransactionsLog from "@/components/outils/portefeuille/TransactionsLog";
import AccountTabs from "@/components/outils/portefeuille/AccountTabs";
import AnalysisPanel from "@/components/outils/portefeuille/AnalysisPanel";
import OptimalPanel from "@/components/outils/portefeuille/OptimalPanel";
import OptimalGate from "@/components/outils/portefeuille/OptimalGate";
import { fetchUserRole } from "@/lib/auth/userRole";
import {
  analyserPortefeuille,
  rendementMarche5Ans,
  tauxSansRisqueBceao,
} from "@/lib/comptetitre/analyse";
import { optimiserPortefeuille } from "@/lib/comptetitre/optimisation";
import { fmtDateFr } from "@/components/outils/portefeuille/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await getMyAccount(id);
  if (!account) return { title: "Compte titre — AzimutFinance" };
  return {
    title: `${account.name} — Mon portefeuille — AzimutFinance`,
  };
}

export default async function CompteDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?redirect=/outils/portefeuille/${id}`);

  const [snapshot, transactions, equity, marketFees, tpsRates, userRole] =
    await Promise.all([
      getAccountSnapshot(id),
      listAccountTransactions(id),
      getAccountEquityCurve(id),
      getMarketFees(),
      getTpsRates(),
      fetchUserRole(),
    ]);
  if (!snapshot) notFound();

  const account = snapshot.account;

  // Hypotheses du MEDAF, tirees des donnees du site et non codees en dur : le
  // taux directeur BCEAO publie sur /marche-monetaire, et la performance
  // annualisee du BRVM Composite sur cinq ans. Elles ne sont ni affichees ni
  // modifiables — le lecteur voit leur resultat, pas leurs rouages.
  const [rfBceao, rmMarche] = await Promise.all([
    tauxSansRisqueBceao(),
    Promise.resolve(rendementMarche5Ans()),
  ]);
  const analyse = analyserPortefeuille(
    snapshot.positions,
    rfBceao ?? 0,
    rmMarche ?? 0,
  );
  // Le portefeuille optimal est reserve aux membres Premium — et il n'est meme
  // pas calcule pour les autres : l'optimisation lit une quarantaine
  // d'historiques et resout un moyenne-variance, autant de travail inutile
  // derriere un mur.
  //
  // Les ordres simules sont chiffres avec la grille tarifaire reelle du compte
  // — courtage SGI, BRVM, DCBR et TPS — et non avec un forfait : sur une
  // rotation complete de la cote, les frais pesent plus que l'ecart de
  // rendement attendu que l'optimisation cherche a capter. La tresorerie du
  // compte entre dans le budget, conformement a la regle « tout est investi ».
  const isPremium = userRole === "premium" || userRole === "pro";
  const optimisation = isPremium
    ? await optimiserPortefeuille(
        snapshot.positions,
        snapshot.cash,
        account,
        marketFees,
        tpsRates,
        rfBceao ?? 0,
        rmMarche ?? 0,
      )
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Mon portefeuille", href: "/outils/portefeuille" },
          { label: account.name },
        ]}
        title={account.name}
        subtitle={`${account.broker ? `${account.broker} · ` : ""}ouvert le ${fmtDateFr(
          account.openingDate,
        )} · devise ${account.currency}`}
      >
        <div className="flex items-center gap-2">
          <Lien
            href={`/outils/portefeuille/${id}/parametres`}
            className="text-xs bg-white/10 text-white hover:bg-white/20 border border-white/20 font-medium px-3 py-1.5 rounded"
          >
            Paramètres
          </Lien>
          <Lien
            href={`/outils/portefeuille/${id}/transactions/nouvelle`}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded"
          >
            + Transaction
          </Lien>
        </div>
      </PageHero>
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-6 space-y-5">
        <AccountKPIs snapshot={snapshot} />

        <AccountTabs
          suivi={
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 pt-5">
              <div className="space-y-5 min-w-0">
                <EquityCurveChart data={equity} />
                <PositionsTable positions={snapshot.positions} />
                <TransactionsLog transactions={transactions} accountId={id} />
              </div>
              <aside className="lg:sticky lg:top-4 lg:self-start space-y-4">
                <AllocationCard snapshot={snapshot} />
                {account.notes && (
                  <div className="bg-white rounded-lg border border-slate-200 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                      Notes
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {account.notes}
                    </p>
                  </div>
                )}
              </aside>
            </div>
          }
          analyse={
            <div className="pt-5">
              <AnalysisPanel analyse={analyse} />
            </div>
          }
          optimal={
            <div className="pt-5">
              {optimisation ? (
                <OptimalPanel optimisation={optimisation} />
              ) : (
                <OptimalGate
                  isMember={userRole !== null}
                  retour={`/outils/portefeuille/${id}`}
                />
              )}
            </div>
          }
        />

      </main>
    </div>
  );
}

import Link from "next/link";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLatestPrices } from "@/lib/simulator/pricing";
import { listMyAccounts } from "@/lib/comptetitre/queries";
import { listAccountTransactions } from "@/lib/comptetitre/queries";
import { computeSnapshot } from "@/lib/comptetitre/engine";
import {
  fmtDateFr,
  fmtFCFA,
  fmtPct,
  pnlColor,
} from "@/components/academie/compte-titre/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Suivi de compte titre — AzimutFinance",
  description:
    "Suivez votre compte titre BRVM au quotidien : positions, PRU, plus-values latentes et réalisées, courbe de valorisation et allocation. Réservé aux membres.",
  path: "/academie/compte-titre",
});

export const dynamic = "force-dynamic";

export default async function ComptesTitresPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <div className="bg-white rounded-lg border border-slate-200 p-6 md:p-10 text-center">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
              Académie · Suivi de compte titre
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mt-2">
              Suivez votre compte titre BRVM — réservé aux membres
            </h1>
            <p className="text-sm text-slate-600 mt-3 max-w-xl mx-auto leading-relaxed">
              Saisissez vos transactions au fil du temps (achats, ventes, dépôts, dividendes,
              splits) et obtenez un tableau de bord complet de votre portefeuille réel :
              positions, PRU, plus-values, courbe de valorisation et allocation par classe
              d&apos;actif et secteur.
            </p>
            <div className="mt-6 flex justify-center gap-3 flex-wrap">
              <Link
                href="/connexion?redirect=/academie/compte-titre"
                className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-5 py-2.5 rounded transition"
              >
                Se connecter
              </Link>
              <Link
                href="/inscription?redirect=/academie/compte-titre"
                className="text-sm bg-white hover:bg-slate-50 text-slate-900 font-medium px-5 py-2.5 rounded border border-slate-300 transition"
              >
                Créer un compte
              </Link>
            </div>
            <p className="text-[11px] text-slate-400 mt-4">
              Inscription gratuite · données privées (visibles par vous uniquement)
            </p>
          </div>
        </main>
      </div>
    );
  }

  const accounts = await listMyAccounts();

  // Calcul rapide des KPIs par compte (cours derniers + transactions)
  const latestArr = getLatestPrices();
  const latest = new Map<string, (typeof latestArr)[number]>();
  for (const p of latestArr) latest.set(p.code, p);

  const summaries = await Promise.all(
    accounts.map(async (a) => {
      const txs = await listAccountTransactions(a.id);
      const snap = computeSnapshot(a, txs, latest);
      return {
        account: a,
        snapshot: snap,
        txCount: txs.length,
      };
    }),
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Académie" },
          { label: "Suivi de compte titre" },
        ]}
        title="Suivi de compte titre"
        subtitle="Vos comptes-titres réels, leurs positions et leur performance."
      >
        <Link
          href="/academie/compte-titre/nouveau"
          className="inline-block text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-2 rounded"
        >
          + Nouveau compte
        </Link>
      </PageHero>
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-5 md:py-6 space-y-5">
        {summaries.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
            <div className="text-base text-slate-700 font-medium">
              Aucun compte-titre encore enregistré.
            </div>
            <p className="text-sm text-slate-500 mt-2 max-w-xl mx-auto">
              Créez votre premier compte (broker, date d&apos;ouverture, frais par défaut),
              puis enregistrez vos transactions au fil du temps. Le tableau de bord se construit
              automatiquement.
            </p>
            <Link
              href="/academie/compte-titre/nouveau"
              className="inline-block mt-5 text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded"
            >
              Créer mon premier compte
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {summaries.map(({ account, snapshot, txCount }) => (
              <Link
                key={account.id}
                href={`/academie/compte-titre/${account.id}`}
                className="block bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-300 hover:shadow-sm transition"
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <h2 className="text-base font-semibold text-slate-900 truncate">
                    {account.name}
                  </h2>
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold shrink-0">
                    {account.broker || "—"}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Ouvert le {fmtDateFr(account.openingDate)} · {txCount} transaction
                  {txCount > 1 ? "s" : ""}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                      Valeur
                    </div>
                    <div className="text-sm font-bold tabular-nums text-slate-900">
                      {fmtFCFA(snapshot.totalValue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                      Perf totale
                    </div>
                    <div
                      className={`text-sm font-bold tabular-nums ${pnlColor(snapshot.totalReturnPct)}`}
                    >
                      {fmtPct(snapshot.totalReturnPct)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                      Cash
                    </div>
                    <div className="text-sm font-bold tabular-nums text-slate-700">
                      {fmtFCFA(snapshot.cash)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">
            Comment ça fonctionne
          </h3>
          <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
            <li>
              <strong>1. Créez un compte</strong> par broker / intermédiaire. Renseignez la date
              d&apos;ouverture et vos frais par défaut (courtage, taxes).
            </li>
            <li>
              <strong>2. Saisissez vos transactions</strong> au fil de l&apos;eau : dépôts,
              retraits, achats, ventes, dividendes, frais, splits. Le ticker auto-suggère le
              nom et le dernier cours connu.
            </li>
            <li>
              <strong>3. Consultez le dashboard</strong> : valeur totale, P&amp;L latente et
              réalisée, courbe de valorisation, positions, allocation par classe d&apos;actif et
              secteur.
            </li>
            <li>
              <strong>Vos données sont privées</strong> — protégées par RLS Supabase et visibles
              uniquement par vous.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}

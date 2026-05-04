import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAccountEquityCurve,
  getAccountSnapshot,
  getMyAccount,
  listAccountTransactions,
} from "@/lib/comptetitre/queries";
import AccountKPIs from "@/components/academie/compte-titre/AccountKPIs";
import AllocationCard from "@/components/academie/compte-titre/AllocationCard";
import EquityCurveChart from "@/components/academie/compte-titre/EquityCurveChart";
import PositionsTable from "@/components/academie/compte-titre/PositionsTable";
import TransactionsLog from "@/components/academie/compte-titre/TransactionsLog";
import { fmtDateFr } from "@/components/academie/compte-titre/format";

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
    title: `${account.name} — Suivi compte titre — AzimutFinance`,
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
  if (!user) redirect(`/connexion?redirect=/academie/compte-titre/${id}`);

  const [snapshot, transactions, equity] = await Promise.all([
    getAccountSnapshot(id),
    listAccountTransactions(id),
    getAccountEquityCurve(id),
  ]);
  if (!snapshot) notFound();

  const account = snapshot.account;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-6 space-y-5">
        <div className="text-xs text-slate-500">
          <Link href="/academie/compte-titre" className="hover:text-slate-700">
            Suivi de compte titre
          </Link>{" "}
          &rsaquo; {account.name}
        </div>

        <header className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
              {account.name}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {account.broker ? `${account.broker} · ` : ""}
              ouvert le {fmtDateFr(account.openingDate)} · devise{" "}
              {account.currency}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/academie/compte-titre/${id}/parametres`}
              className="text-xs bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-1.5 rounded border border-slate-300"
            >
              Paramètres
            </Link>
            <Link
              href={`/academie/compte-titre/${id}/transactions/nouvelle`}
              className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
            >
              + Transaction
            </Link>
          </div>
        </header>

        <AccountKPIs snapshot={snapshot} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
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
      </main>
    </div>
  );
}

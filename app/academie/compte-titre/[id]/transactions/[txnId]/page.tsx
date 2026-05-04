import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import TransactionForm from "@/components/academie/compte-titre/TransactionForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLatestPrices } from "@/lib/simulator/pricing";
import {
  getAccountAvailability,
  getMyAccount,
  getTransactionById,
  listMarketFees,
  listTpsRates,
} from "@/lib/comptetitre/queries";

export const dynamic = "force-dynamic";

const CREATE_KEYWORDS = new Set(["nouvelle", "nouveau", "new"]);

export default async function TransactionPage({
  params,
}: {
  params: Promise<{ id: string; txnId: string }>;
}) {
  const { id, txnId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/connexion?redirect=/academie/compte-titre/${id}/transactions/${txnId}`);
  }

  const account = await getMyAccount(id);
  if (!account) notFound();

  const isCreate = CREATE_KEYWORDS.has(txnId.toLowerCase());
  const txn = isCreate ? null : await getTransactionById(txnId);
  if (!isCreate && (!txn || txn.accountId !== id)) notFound();

  const [marketFees, tpsRates, avail] = await Promise.all([
    listMarketFees(),
    listTpsRates(),
    getAccountAvailability(id),
  ]);

  // Pour edition : on retire la transaction en cours du calcul de dispo
  // (sinon on ne pourrait pas modifier une vente sans être en court)
  let availability = avail ?? { cash: 0, unitsByCode: new Map<string, number>() };
  if (!isCreate && txn) {
    const adjusted = new Map(availability.unitsByCode);
    let cashAdj = availability.cash;
    cashAdj -= txn.netAmount;
    if (txn.type === "buy" && txn.securityCode) {
      adjusted.set(
        txn.securityCode,
        (adjusted.get(txn.securityCode) ?? 0) - (txn.quantity ?? 0),
      );
    } else if (txn.type === "sell" && txn.securityCode) {
      adjusted.set(
        txn.securityCode,
        (adjusted.get(txn.securityCode) ?? 0) + (txn.quantity ?? 0),
      );
    }
    availability = { cash: cashAdj, unitsByCode: adjusted };
  }

  const stocks = getLatestPrices().sort((a, b) => a.code.localeCompare(b.code));

  // Convertir Map en Record pour passer au client component
  const unitsRecord: Record<string, number> = {};
  for (const [k, v] of availability.unitsByCode) unitsRecord[k] = v;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-5 md:py-6 space-y-4">
        <div className="text-xs text-slate-500">
          <Link href="/academie/compte-titre" className="hover:text-slate-700">
            Suivi de compte titre
          </Link>{" "}
          &rsaquo;{" "}
          <Link
            href={`/academie/compte-titre/${id}`}
            className="hover:text-slate-700"
          >
            {account.name}
          </Link>{" "}
          &rsaquo; {isCreate ? "Nouvelle transaction" : "Éditer transaction"}
        </div>
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">
            {isCreate ? "Nouvelle transaction" : "Modifier une transaction"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isCreate
              ? "Enregistrez un mouvement : achat, vente, dépôt, dividende, frais, split, etc."
              : "Toute modification recalcule le portefeuille automatiquement."}
          </p>
        </header>
        <TransactionForm
          mode={isCreate ? "create" : "edit"}
          account={account}
          initial={txn ?? undefined}
          stocks={stocks}
          marketFees={marketFees}
          tpsRates={tpsRates}
          availability={{ cash: availability.cash, unitsByCode: unitsRecord }}
        />
      </main>
    </div>
  );
}

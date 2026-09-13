import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import TransactionForm from "@/components/outils/portefeuille/TransactionForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLatestPrices } from "@/lib/simulator/pricing";
import { loadListedBonds, loadListedBondPrices } from "@/lib/dataLoader";
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
    redirect(`/connexion?redirect=/outils/portefeuille/${id}/transactions/${txnId}`);
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

  // Referentiel obligataire : le formulaire propose les titres de la categorie
  // choisie, et une obligation ne figure pas dans la cote des actions. Seules
  // les lignes en vie sont proposees — on ne passe pas un ordre sur un titre
  // echu. Le dernier cours connu prerremplit le prix, comme pour les actions.
  const dernierCours = new Map<string, { date: string; prix: number }>();
  for (const p of loadListedBondPrices()) {
    if (!Number.isFinite(p.cleanPrice) || p.cleanPrice <= 0) continue;
    const vu = dernierCours.get(p.isin);
    // Comparaison de dates, pas premier arrive : le fichier est trie par date
    // croissante, garder la premiere ligne donnerait le cours le plus ancien.
    if (!vu || p.date > vu.date) {
      dernierCours.set(p.isin, { date: p.date, prix: p.cleanPrice });
    }
  }
  const bonds = loadListedBonds()
    .filter((b) => b.yearsToMaturity > 0 && b.code)
    .map((b) => ({
      code: b.code.toUpperCase(),
      name: b.name || b.issuer,
      sector: b.issuerType,
      price: dernierCours.get(b.isin)?.prix ?? 0,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // Convertir Map en Record pour passer au client component
  const unitsRecord: Record<string, number> = {};
  for (const [k, v] of availability.unitsByCode) unitsRecord[k] = v;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Mon portefeuille", href: "/outils/portefeuille" },
          { label: account.name, href: `/outils/portefeuille/${id}` },
          { label: isCreate ? "Nouvelle transaction" : "Éditer transaction" },
        ]}
        title={isCreate ? "Nouvelle transaction" : "Modifier une transaction"}
        subtitle={
          isCreate
            ? "Enregistrez un mouvement : achat, vente, dépôt, dividende, frais, split, etc."
            : "Toute modification recalcule le portefeuille automatiquement."
        }
      />
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-5 md:py-6 space-y-4">
        <TransactionForm
          mode={isCreate ? "create" : "edit"}
          account={account}
          initial={txn ?? undefined}
          stocks={stocks}
          bonds={bonds}
          marketFees={marketFees}
          tpsRates={tpsRates}
          availability={{ cash: availability.cash, unitsByCode: unitsRecord }}
        />
      </main>
    </div>
  );
}

import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import StockDetailView from "@/components/StockDetailView";
import { getStockDetails, loadPriceHistory } from "@/lib/dataLoader";

export default async function TitrePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const codeUpper = code.toUpperCase();

  const stock = getStockDetails(codeUpper);

  if (!stock) {
    notFound();
  }

  // Charge l'historique (peut etre vide si pas de donnees pour ce titre)
  const priceHistory = loadPriceHistory(codeUpper);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <StockDetailView stock={stock} priceHistory={priceHistory} />
    </div>
  );
}
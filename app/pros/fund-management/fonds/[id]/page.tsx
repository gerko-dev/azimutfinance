import { notFound } from "next/navigation";
import FundManager from "@/components/pros/fund-management/FundManager";
import { loadFundById } from "../../data";
import { loadFundPortfolios } from "../../portfolio-data";
import { loadNavHistory } from "../../nav-data";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fund = await loadFundById(id);
  return { title: fund ? `${fund.nom} — Fund management` : "Fonds introuvable — Fund management" };
}

export default async function FundManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fund = await loadFundById(id);
  if (!fund) notFound();

  const [initialPortfolios, initialNav] = await Promise.all([
    loadFundPortfolios(id),
    loadNavHistory(id),
  ]);

  return (
    <FundManager fund={fund} initialPortfolios={initialPortfolios} initialNav={initialNav} />
  );
}

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import FundManager from "@/components/gestion-portefeuille/FundManager";
import { loadFundById } from "../../data";
import { loadFundPortfolios } from "../../portfolio-data";
import { loadNavHistory } from "../../nav-data";

export const dynamic = "force-dynamic";

/**
 * Fiche d'un fonds : son identité, et la performance de sa VL.
 *
 * QUATRE VOLETS ONT QUITTÉ CETTE PAGE pour des modules du menu de gauche —
 * importation, allocation, analyse de marché, référentiel. Aucun n'était
 * vraiment une affaire de fonds, et la page payait leurs calculs à chaque
 * ouverture : allocation, plan d'opérations, proposition et anticipations
 * étaient construits AVANT le premier rendu, même pour consulter une
 * dénomination. Six lectures pour afficher une fiche.
 *
 * Il en reste deux, et elles servent les onglets restants.
 */
export default async function FundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(1);
  const { id } = await params;
  const fund = await loadFundById(id);
  if (!fund) notFound();

  const [initialPortfolios, initialNav] = await Promise.all([
    loadFundPortfolios(id),
    loadNavHistory(id),
  ]);

  return (
    <FundManager
      fund={fund}
      initialPortfolios={initialPortfolios}
      initialNav={initialNav}
    />
  );
}

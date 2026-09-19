import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import FundManager from "@/components/gestion-portefeuille/FundManager";
import { loadFundById } from "../../data";
import { loadFundPortfolios } from "../../portfolio-data";
import { loadNavHistory } from "../../nav-data";
import { construireTableauAllocation } from "../../allocation-data";
import { construirePlanOperations } from "../../operations-data";
import { construireAnticipations } from "../../anticipation-data";
import { construireProposition } from "../../proposition-data";
import { construirePointTresorerie } from "../../tresorerie-data";
import { loadOperationsMarche } from "../../operations-marche-data";

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

  // La garde du layout ne suffit PAS ici : layout et page sont rendus en
  // parallele. Si la session a expire, le `redirect()` du layout et le
  // `notFound()` ci-dessous partent en meme temps, et c'est le 404 qui gagne
  // la course — le gerant lit « Page introuvable » alors qu'il devait
  // simplement se reconnecter. En repassant la garde AVANT toute lecture, la
  // redirection est deterministe, et le retour se fait sur ce fonds precis.
  await requireAdmin(1, `/gestion-portefeuille/fonds/${id}`);

  const fund = await loadFundById(id);
  if (!fund) notFound();

  // L'allocation est calculee au SERVEUR et passee en props, comme les
  // inventaires et la VL : le lint du projet interdit un setState dans un
  // effet, donc aucun panneau ne charge ses donnees au montage.
  const [
    initialPortfolios,
    initialNav,
    initialAllocation,
    initialOperations,
    initialAnticipations,
    initialProposition,
    initialTresorerie,
    initialOperationsMarche,
  ] = await Promise.all([
    loadFundPortfolios(id),
    loadNavHistory(id),
    construireTableauAllocation(id, "classe"),
    construirePlanOperations(id),
    construireAnticipations(id, fund.objectifPerf),
    construireProposition(id, {}, { ratios: fund.ratios }),
    construirePointTresorerie(id, fund.nom),
    loadOperationsMarche(id),
  ]);

  return (
    <FundManager
      fund={fund}
      initialPortfolios={initialPortfolios}
      initialNav={initialNav}
      initialAllocation={initialAllocation}
      initialOperations={initialOperations}
      initialAnticipations={initialAnticipations}
      initialProposition={initialProposition}
      initialTresorerie={initialTresorerie}
      initialOperationsMarche={initialOperationsMarche}
    />
  );
}

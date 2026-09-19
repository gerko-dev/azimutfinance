import Lien from "@/components/NavigationProgress";
import { requireAdmin } from "@/lib/admin/auth";
import { listPricingPlans } from "@/lib/premium/pricingQueries";
import PricingPlansManager from "./PricingPlansManager";

export const dynamic = "force-dynamic";

export default async function AdminPricingPlansPage() {
  await requireAdmin(1);
  const plans = await listPricingPlans({ includeInactive: true });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plans Premium</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure les plans visibles sur <code>/premium</code>. Les plans
            désactivés ne sont plus proposés mais les abonnements en cours
            restent valides.
          </p>
        </div>
        <Lien
          href="/admin/tarification"
          className="text-xs text-blue-700 hover:underline"
        >
          ← Retour
        </Lien>
      </div>

      <PricingPlansManager plans={plans} />
    </div>
  );
}

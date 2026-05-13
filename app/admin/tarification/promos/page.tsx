import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listPricingPlans,
  listPromoCodes,
} from "@/lib/premium/pricingQueries";
import PromoCodesManager from "./PromoCodesManager";

export const dynamic = "force-dynamic";

export default async function AdminPromoCodesPage() {
  await requireAdmin(1);
  const [promos, plans] = await Promise.all([
    listPromoCodes(),
    listPricingPlans({ includeInactive: true }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Codes de réduction
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Codes promotionnels avec % ou montant fixe en FCFA. Définis la
            validité (date, nombre d&apos;usages total, par utilisateur) et
            limite éventuellement à certains plans.
          </p>
        </div>
        <Link
          href="/admin/tarification"
          className="text-xs text-blue-700 hover:underline"
        >
          ← Retour
        </Link>
      </div>

      <PromoCodesManager promos={promos} allPlans={plans} />
    </div>
  );
}

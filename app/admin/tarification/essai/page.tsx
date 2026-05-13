import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listTrialConfigs,
  listUserTrials,
} from "@/lib/premium/pricingQueries";
import TrialManager from "./TrialManager";

export const dynamic = "force-dynamic";

export default async function AdminTrialPage() {
  await requireAdmin(1);
  const [configs, users] = await Promise.all([
    listTrialConfigs(),
    listUserTrials(200),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Essai gratuit</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure la durée de l&apos;essai Premium gratuit (en jours) et son
            mode d&apos;attribution. Un utilisateur ne peut consommer qu&apos;un
            seul essai.
          </p>
        </div>
        <Link
          href="/admin/tarification"
          className="text-xs text-blue-700 hover:underline"
        >
          ← Retour
        </Link>
      </div>

      <TrialManager configs={configs} users={users} />
    </div>
  );
}

import PresenceTabs from "@/components/admin/PresenceTabs";
import { requireAdmin } from "@/lib/admin/auth";
import { listPresence } from "@/lib/admin/queries";
import {
  getPresenceLive,
  listPresenceSnapshots,
} from "@/lib/admin/presenceAnalytics";

export const dynamic = "force-dynamic";

export default async function PresencePage() {
  await requireAdmin(3);

  const [entries, live, snapshots] = await Promise.all([
    listPresence(90),
    getPresenceLive(),
    listPresenceSnapshots(90),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Présence en ligne</h1>
        <p className="text-sm text-slate-500 mt-1">
          Trafic du site en temps réel (visiteurs anonymes inclus), dispatching
          par page et historique par snapshots de 8 h. La page se rafraîchit
          automatiquement toutes les 30 secondes.
        </p>
      </div>

      <PresenceTabs entries={entries} live={live} snapshots={snapshots} />
    </div>
  );
}

import PresenceList from "@/components/admin/PresenceList";
import { requireAdmin } from "@/lib/admin/auth";
import { listPresence } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function PresencePage() {
  await requireAdmin(3);
  const entries = await listPresence(90);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Présence en ligne</h1>
        <p className="text-sm text-slate-500 mt-1">
          Membres connectés (heartbeat &lt; 90 s) et hors ligne (avec « depuis combien de
          temps »). La page se rafraîchit automatiquement toutes les 30 secondes.
        </p>
      </div>

      <PresenceList entries={entries} />
    </div>
  );
}

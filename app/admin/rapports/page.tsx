import RapportsPanel from "@/components/admin/RapportsPanel";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function RapportsPage() {
  // Éditeur (N3+) — placé dans le groupe Éditeur de la sidebar.
  await requireAdmin(3);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Rapports</h1>
        <p className="text-sm text-slate-500 mt-1">
          Génération de rapports de marché à partir des données live du site.
          Cliquez pour produire le document ; les données sont rafraîchies à
          chaque génération.
        </p>
      </div>

      <RapportsPanel />
    </div>
  );
}

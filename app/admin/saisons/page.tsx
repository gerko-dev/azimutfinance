import SeasonsManager from "@/components/admin/SeasonsManager";
import { requireAdmin } from "@/lib/admin/auth";
import { listSeasons } from "@/lib/admin/queries";

export default async function SeasonsAdminPage() {
  // level 2 minimum (gestion des saisons)
  await requireAdmin(2);
  const seasons = await listSeasons();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Saisons du simulateur</h1>
        <p className="text-sm text-slate-500 mt-1">
          Créer une nouvelle saison, activer/clôturer une saison existante. Le statut détermine
          si les membres peuvent rejoindre et passer des ordres.
        </p>
      </div>

      <SeasonsManager seasons={seasons} />
    </div>
  );
}

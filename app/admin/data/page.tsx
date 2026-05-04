import DataFilesPanel from "@/components/admin/DataFilesPanel";
import { requireAdmin } from "@/lib/admin/auth";
import { listDataFiles } from "@/lib/admin/dataFiles";

export const dynamic = "force-dynamic";

export default async function DataFilesPage() {
  // L1 only — capacité de modification du data layer
  await requireAdmin(1);

  const result = await listDataFiles();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Fichiers de données</h1>
        <p className="text-sm text-slate-500 mt-1">
          Mise à jour des CSV qui alimentent les pages Marchés, Macro, Académie, etc.
          Réservé au super-admin (niveau 1).
        </p>
      </div>

      {result.ok ? (
        <DataFilesPanel files={result.data} />
      ) : (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded p-4 text-sm">
          {result.error}
        </div>
      )}
    </div>
  );
}

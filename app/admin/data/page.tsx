import DataFilesPanel from "@/components/admin/DataFilesPanel";
import { requireAdmin } from "@/lib/admin/auth";
import { listDataFiles } from "@/lib/admin/dataFiles";

export const dynamic = "force-dynamic";

export default async function DataFilesPage() {
  // Editeur (N3+) : page placee dans le groupe Editeur de la sidebar.
  await requireAdmin(3);

  const result = await listDataFiles();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Fichiers de données</h1>
        <p className="text-sm text-slate-500 mt-1">
          Documents à importer manuellement (CSV + PDF BCEAO). Les fichiers
          rafraîchis automatiquement par les workflows GitHub Actions (cours
          BRVM, commodities, FX, émissions UMOA-Titres…) ne sont pas listés ici.
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

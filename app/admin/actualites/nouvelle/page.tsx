import Lien from "@/components/NavigationProgress";
import ActualiteForm from "@/components/admin/ActualiteForm";
import { requireAdmin } from "@/lib/admin/auth";

export default async function NewActualitePage() {
  await requireAdmin(3);

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500">
        <Lien href="/admin/actualites" className="hover:text-slate-700">
          Actualités
        </Lien>{" "}
        &rsaquo; Nouvelle
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Nouvelle actualité</h1>
      <ActualiteForm mode="create" />
    </div>
  );
}

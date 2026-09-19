import Lien from "@/components/NavigationProgress";
import FormationForm from "@/components/admin/FormationForm";
import { requireAdmin } from "@/lib/admin/auth";

export default async function NewFormationPage() {
  await requireAdmin(3);

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500">
        <Lien href="/admin/formations" className="hover:text-slate-700">
          Formations
        </Lien>{" "}
        &rsaquo; Nouvelle
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Nouvelle formation</h1>
      <FormationForm mode="create" />
    </div>
  );
}

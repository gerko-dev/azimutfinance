import IssueForm from "@/components/admin/IssueForm";
import { listAuthors } from "@/lib/magazine/queries";

export default async function NewIssuePage() {
  const authors = await listAuthors();
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">Nouveau numéro</h2>
      <IssueForm mode="create" authors={authors} />
    </div>
  );
}

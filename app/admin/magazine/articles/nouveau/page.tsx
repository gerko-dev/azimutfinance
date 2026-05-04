import ArticleForm from "@/components/admin/ArticleForm";
import { listAllIssues, listAuthors } from "@/lib/magazine/queries";

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ issue?: string }>;
}) {
  const sp = await searchParams;
  const [issues, authors] = await Promise.all([
    listAllIssues({ limit: 100 }),
    listAuthors(),
  ]);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">Nouvel article</h2>
      <ArticleForm
        mode="create"
        issues={issues}
        authors={authors}
        defaultIssueId={sp.issue}
      />
    </div>
  );
}

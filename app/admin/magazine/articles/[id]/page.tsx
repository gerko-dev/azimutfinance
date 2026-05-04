import Link from "next/link";
import { notFound } from "next/navigation";
import ArticleForm from "@/components/admin/ArticleForm";
import {
  getArticleById,
  listAllIssues,
  listAuthors,
} from "@/lib/magazine/queries";

export const dynamic = "force-dynamic";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [article, issues, authors] = await Promise.all([
    getArticleById(id),
    listAllIssues({ limit: 100 }),
    listAuthors(),
  ]);
  if (!article) notFound();

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{article.title}</h2>
        {article.publishedAt && (
          <Link
            href={`/academie/magazine/article/${article.slug}`}
            target="_blank"
            className="text-xs text-slate-600 hover:text-slate-900 underline"
          >
            Voir sur le site →
          </Link>
        )}
      </div>
      <ArticleForm mode="edit" initial={article} issues={issues} authors={authors} />
    </div>
  );
}

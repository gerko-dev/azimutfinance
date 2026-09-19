import Link from "next/link";
import { notFound } from "next/navigation";
import IssueForm from "@/components/admin/IssueForm";
import {
  getIssueById,
  listAllArticles,
  listAuthors,
} from "@/lib/magazine/queries";
import { ARTICLE_CATEGORY_META } from "@/lib/magazine";
import { fmtDateTime } from "@/components/admin/format";

export const dynamic = "force-dynamic";

export default async function EditIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [issue, authors, articles] = await Promise.all([
    getIssueById(id),
    listAuthors(),
    listAllArticles({ issueId: id, limit: 200 }),
  ]);
  if (!issue) notFound();

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-slate-900">
          N° {String(issue.number).padStart(2, "0")} · {issue.theme}
        </h2>
        {issue.publishedAt && (
          <Link
            href={`/academie/magazine/numero/${issue.slug}`}
            target="_blank"
            className="text-xs text-slate-600 hover:text-slate-900 underline"
          >
            Voir la page publique →
          </Link>
        )}
      </div>

      <IssueForm mode="edit" initial={issue} authors={authors} />

      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">
            Articles de ce numéro
          </h3>
          <Link
            href={`/admin/magazine/articles/nouveau?issue=${issue.id}`}
            className="text-xs bg-slate-900 hover:bg-slate-700 text-white font-medium px-2.5 py-1 rounded"
          >
            + Nouvel article
          </Link>
        </div>
        {articles.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-8">
            Aucun article dans ce numéro.
          </div>
        ) : (
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase">
                <th className="text-left font-medium py-2 pl-4 pr-2">Titre</th>
                <th className="text-left font-medium py-2 px-2">Catégorie</th>
                <th className="text-left font-medium py-2 px-2">Auteur</th>
                <th className="text-right font-medium py-2 px-2">Lecture</th>
                <th className="text-left font-medium py-2 px-2">Statut</th>
                <th className="text-left font-medium py-2 px-2">Mise à jour</th>
                <th className="text-right font-medium py-2 pr-4 pl-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => {
                const cat = ARTICLE_CATEGORY_META[a.category];
                return (
                  <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pl-4 pr-2 text-slate-900 max-w-md">
                      <div className="font-medium">{a.title}</div>
                      {a.featured && (
                        <span className="text-[10px] text-amber-700 font-medium">
                          ★ Mise en avant
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: cat.color + "15", color: cat.color }}
                      >
                        {cat.label}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-slate-700">
                      {a.authorName ?? "—"}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                      {a.readingTimeMinutes} min
                    </td>
                    <td className="py-2 px-2">
                      {a.publishedAt ? (
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Publié
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          Brouillon
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-slate-500 tabular-nums">
                      {fmtDateTime(a.updatedAt)}
                    </td>
                    <td className="py-2 pr-4 pl-2 text-right">
                      <Link
                        href={`/admin/magazine/articles/${a.id}`}
                        className="text-[11px] text-blue-700 hover:underline"
                      >
                        Éditer
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

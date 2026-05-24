import Link from "next/link";
import { listAllArticles, listAllIssues } from "@/lib/magazine/queries";
import { ARTICLE_CATEGORY_META } from "@/lib/magazine";
import { fmtDateTime } from "@/components/admin/format";

export const dynamic = "force-dynamic";

export default async function ArticlesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; issue?: string }>;
}) {
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  const issueId = sp.issue || undefined;

  const [articles, issues] = await Promise.all([
    listAllArticles({ search: search || undefined, issueId, limit: 200 }),
    listAllIssues({ limit: 100 }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-600">
          Tous les articles, brouillons inclus. Le bouton &laquo; Voir &raquo; sur le site public mène ici à l&apos;édition.
        </p>
        <Link
          href="/admin/magazine/articles/nouveau"
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
        >
          + Nouvel article
        </Link>
      </div>

      <form
        className="flex flex-wrap gap-2 items-end bg-white rounded-lg border border-slate-200 p-3"
        action="/admin/magazine/articles"
        method="get"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] text-slate-500 mb-1">Recherche</label>
          <input
            type="text"
            name="q"
            defaultValue={search}
            placeholder="Titre, slug, extrait…"
            className="w-full text-sm border border-slate-300 rounded px-3 py-1.5"
          />
        </div>
        <div className="min-w-[260px]">
          <label className="block text-[11px] text-slate-500 mb-1">Numéro</label>
          <select
            name="issue"
            defaultValue={issueId ?? ""}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="">Tous les numéros</option>
            {issues.map((i) => (
              <option key={i.id} value={i.id}>
                N° {String(i.number).padStart(2, "0")} · {i.monthLabel}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
        >
          Filtrer
        </button>
        {(search || issueId) && (
          <Link
            href="/admin/magazine/articles"
            className="text-xs text-slate-600 hover:text-slate-900 underline pb-1.5"
          >
            Réinitialiser
          </Link>
        )}
      </form>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {articles.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-8">
            Aucun article.
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
                      <div className="font-medium truncate">{a.title}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {a.slug}
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: cat.color + "15", color: cat.color }}
                      >
                        {cat.label}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-slate-700">{a.authorName ?? "—"}</td>
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
                    <td className="py-2 pr-4 pl-2 text-right whitespace-nowrap">
                      <Link
                        href={`/admin/magazine/articles/${a.id}`}
                        className="text-[11px] text-blue-700 hover:underline"
                      >
                        Éditer
                      </Link>
                      <span className="text-slate-300 mx-1.5">·</span>
                      <span className="text-[10px] text-slate-500">Flash</span>
                      <a
                        href={`/admin/magazine/articles/${a.id}/flash?format=png`}
                        className="text-[11px] text-blue-700 hover:underline ml-1.5"
                        title="Générer l'image flash (PNG)"
                      >
                        PNG
                      </a>
                      <a
                        href={`/admin/magazine/articles/${a.id}/flash?format=jpeg`}
                        className="text-[11px] text-blue-700 hover:underline ml-1.5"
                        title="Générer l'image flash (JPEG)"
                      >
                        JPG
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

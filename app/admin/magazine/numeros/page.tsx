import Link from "next/link";
import { listAllIssues, listAllArticles } from "@/lib/magazine/queries";
import { fmtDateTime } from "@/components/admin/format";

export const dynamic = "force-dynamic";

export default async function IssuesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();

  const [issues, articles] = await Promise.all([
    listAllIssues({ search: search || undefined, limit: 100 }),
    listAllArticles({ limit: 1000 }),
  ]);

  const articleCountByIssue = new Map<string, number>();
  for (const a of articles) {
    articleCountByIssue.set(a.issueId, (articleCountByIssue.get(a.issueId) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-600">
          Chaque numéro regroupe ~5 articles. Le numéro le plus récent fait la couverture du magazine.
        </p>
        <Link
          href="/admin/magazine/numeros/nouveau"
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
        >
          + Nouveau numéro
        </Link>
      </div>

      <form className="flex gap-2 max-w-md" action="/admin/magazine/numeros" method="get">
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Rechercher par thème ou mois..."
          className="flex-1 text-sm border border-slate-300 rounded px-3 py-1.5"
        />
        <button
          type="submit"
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
        >
          Chercher
        </button>
      </form>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {issues.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-8">
            Aucun numéro. Créez le premier.
          </div>
        ) : (
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase">
                <th className="text-left font-medium py-2 pl-4 pr-2">N°</th>
                <th className="text-left font-medium py-2 px-2">Mois</th>
                <th className="text-left font-medium py-2 px-2">Thème</th>
                <th className="text-right font-medium py-2 px-2">Articles</th>
                <th className="text-left font-medium py-2 px-2">Statut</th>
                <th className="text-left font-medium py-2 px-2">Mise à jour</th>
                <th className="text-right font-medium py-2 pr-4 pl-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => {
                const count = articleCountByIssue.get(i.id) ?? 0;
                return (
                  <tr key={i.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pl-4 pr-2 font-semibold text-slate-900 tabular-nums">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded"
                          style={{
                            background: `linear-gradient(135deg, ${i.coverGradient.from}, ${i.coverGradient.to})`,
                          }}
                        />
                        {String(i.number).padStart(2, "0")}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-slate-700">{i.monthLabel}</td>
                    <td className="py-2 px-2 text-slate-900 max-w-md truncate">{i.theme}</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {count > 0 ? (
                        <span className="font-semibold">{count}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {i.publishedAt ? (
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
                      {fmtDateTime(i.updatedAt)}
                    </td>
                    <td className="py-2 pr-4 pl-2 text-right">
                      <Link
                        href={`/admin/magazine/numeros/${i.id}`}
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
      </div>
    </div>
  );
}

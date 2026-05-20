import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listAllActualites } from "@/lib/actualites/queries";
import { fmtDateTime } from "@/components/admin/format";
import { NEWS_TYPE_LABELS } from "@/lib/newsTypes";

export const dynamic = "force-dynamic";

export default async function ActualitesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin(3);
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  const items = await listAllActualites({ search: search || undefined, limit: 100 });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Actualités BRVM</h1>
          <p className="text-sm text-slate-500 mt-1">
            Articles d&apos;actualité par valeur cotée.
          </p>
        </div>
        <Link
          href="/admin/actualites/nouvelle"
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
        >
          + Nouvelle actualité
        </Link>
      </div>

      <form className="flex gap-2 max-w-md" action="/admin/actualites" method="get">
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Rechercher par ticker ou titre..."
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
        {items.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-8">
            Aucune actualité.
          </div>
        ) : (
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase">
                <th className="text-left font-medium py-2 pl-4 pr-2">Ticker</th>
                <th className="text-left font-medium py-2 px-2">Catégorie</th>
                <th className="text-left font-medium py-2 px-2">Titre</th>
                <th className="text-left font-medium py-2 px-2">Statut</th>
                <th className="text-left font-medium py-2 px-2">Pièce jointe</th>
                <th className="text-left font-medium py-2 px-2">Mise à jour</th>
                <th className="text-right font-medium py-2 pr-4 pl-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pl-4 pr-2 font-mono font-semibold text-slate-900">
                    {a.ticker}
                  </td>
                  <td className="py-2 px-2">
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                      {NEWS_TYPE_LABELS[a.category] ?? a.category}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-slate-900 max-w-md truncate">
                    {a.title}
                  </td>
                  <td className="py-2 px-2">
                    {a.published_at ? (
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        Publié
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        Brouillon
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-slate-600">
                    {a.attachment_name ? (
                      <span title={a.attachment_name}>📎</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 px-2 text-slate-500 tabular-nums">
                    {fmtDateTime(a.updated_at)}
                  </td>
                  <td className="py-2 pr-4 pl-2 text-right">
                    <Link
                      href={`/admin/actualites/${a.id}`}
                      className="text-[11px] text-blue-700 hover:underline"
                    >
                      Éditer
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listAllFormations, listInscriptions } from "@/lib/formations/queries";
import {
  CATEGORY_META,
  LEVEL_META,
  pricingLabel,
  totalDurationLabel,
} from "@/lib/formations";
import { fmtDateTime } from "@/components/admin/format";

export const dynamic = "force-dynamic";

export default async function FormationsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin(3);
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();

  const [formations, allInscriptions] = await Promise.all([
    listAllFormations({ search: search || undefined, limit: 200 }),
    listInscriptions({ limit: 1000 }),
  ]);

  // Comptage rapide d'inscriptions par formation
  const countByFormation = new Map<string, number>();
  for (const i of allInscriptions) {
    countByFormation.set(i.formation_id, (countByFormation.get(i.formation_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Formations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Catalogue de formations Académie. Création/édition réservée à l&apos;admin L2+.
          </p>
        </div>
        <Link
          href="/admin/formations/nouvelle"
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
        >
          + Nouvelle formation
        </Link>
      </div>

      <form className="flex gap-2 max-w-md" action="/admin/formations" method="get">
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Rechercher par titre ou slug..."
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
        {formations.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-8">
            Aucune formation. Créez la première via &laquo; Nouvelle formation &raquo;.
          </div>
        ) : (
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase">
                <th className="text-left font-medium py-2 pl-4 pr-2">Titre</th>
                <th className="text-left font-medium py-2 px-2">Catégorie</th>
                <th className="text-left font-medium py-2 px-2">Niveau</th>
                <th className="text-right font-medium py-2 px-2">Tarif</th>
                <th className="text-right font-medium py-2 px-2">Durée</th>
                <th className="text-right font-medium py-2 px-2">Inscrits</th>
                <th className="text-left font-medium py-2 px-2">Statut</th>
                <th className="text-left font-medium py-2 px-2">Mise à jour</th>
                <th className="text-right font-medium py-2 pr-4 pl-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {formations.map((f) => {
                const cat = CATEGORY_META[f.category];
                const lvl = LEVEL_META[f.level];
                const inscritsCount = countByFormation.get(f.id) ?? 0;
                return (
                  <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pl-4 pr-2 text-slate-900 max-w-md">
                      <div className="font-medium">{f.title}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {f.slug}
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
                    <td className="py-2 px-2">
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: lvl.color }}
                      >
                        {lvl.label}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                      {pricingLabel(f)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                      {totalDurationLabel(f)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {inscritsCount > 0 ? (
                        <span className="font-semibold text-slate-900">
                          {inscritsCount}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {f.publishedAt ? (
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
                      {fmtDateTime(f.updatedAt)}
                    </td>
                    <td className="py-2 pr-4 pl-2 text-right">
                      <Link
                        href={`/admin/formations/${f.id}`}
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

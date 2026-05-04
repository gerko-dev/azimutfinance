import { requireAdmin } from "@/lib/admin/auth";
import { listAudit } from "@/lib/admin/queries";
import { fmtDateTime } from "@/components/admin/format";
import { ROLE_COLOR, ROLE_LABEL } from "@/lib/admin/types";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin(2);
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const pageSize = 100;
  const entries = await listAudit({ limit: pageSize, offset: page * pageSize });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Journal d&apos;audit</h1>
        <p className="text-sm text-slate-500 mt-1">
          Toutes les actions administratives sont enregistrées avec leur acteur, leur cible et
          leur raison. Lecture seule, immutable.
        </p>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left font-medium py-2 pl-4 pr-2">Date</th>
              <th className="text-left font-medium py-2 px-2">Acteur</th>
              <th className="text-left font-medium py-2 px-2">Action</th>
              <th className="text-left font-medium py-2 px-2">Cible</th>
              <th className="text-left font-medium py-2 px-2">Raison</th>
              <th className="text-left font-medium py-2 pr-4 pl-2">Détails</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  Aucune action enregistrée.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50 align-top">
                  <td className="py-2 pl-4 pr-2 text-slate-500 tabular-nums whitespace-nowrap">
                    {fmtDateTime(e.created_at)}
                  </td>
                  <td className="py-2 px-2">
                    <div className="text-slate-900 font-medium">
                      {e.actor_username
                        ? `@${e.actor_username}`
                        : e.actor_email ?? "Système"}
                    </div>
                    {e.actor_role && (
                      <span
                        className="text-[9px] uppercase font-semibold px-1 py-0.5 rounded mt-0.5 inline-block"
                        style={{
                          background: ROLE_COLOR[e.actor_role] + "15",
                          color: ROLE_COLOR[e.actor_role],
                        }}
                      >
                        {ROLE_LABEL[e.actor_role]}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 font-mono text-slate-700">{e.action}</td>
                  <td className="py-2 px-2 text-slate-600">
                    {e.target_type ? (
                      <>
                        <span className="font-medium text-slate-700">{e.target_type}</span>
                        {e.target_id && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {e.target_id.slice(0, 16)}…
                          </div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 px-2 text-slate-700 italic max-w-xs">
                    {e.reason || "—"}
                  </td>
                  <td className="py-2 pr-4 pl-2 text-[10px] text-slate-500 font-mono max-w-xs truncate">
                    {e.metadata ? JSON.stringify(e.metadata) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-xs">
        <span className="text-slate-500">
          {entries.length} entrée{entries.length > 1 ? "s" : ""} affichée
          {entries.length > 1 ? "s" : ""}
        </span>
        <div className="flex gap-2">
          {page > 0 && (
            <a
              href={`/admin/audit?page=${page - 1}`}
              className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50"
            >
              ← Précédent
            </a>
          )}
          {entries.length === pageSize && (
            <a
              href={`/admin/audit?page=${page + 1}`}
              className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50"
            >
              Suivant →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

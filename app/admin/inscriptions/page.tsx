import { requireAdmin } from "@/lib/admin/auth";
import { listAllFormations, listInscriptions } from "@/lib/formations/queries";
import InscriptionsTable from "@/components/admin/InscriptionsTable";
import { INSCRIPTION_STATUS_LABEL } from "@/lib/formations";
import type { InscriptionStatus } from "@/lib/formations/types";

export const dynamic = "force-dynamic";

const STATUSES: InscriptionStatus[] = ["en_attente", "confirmee", "payee", "annulee"];

export default async function InscriptionsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ formation?: string; status?: string }>;
}) {
  await requireAdmin(3);
  const sp = await searchParams;
  const formationId = sp.formation || undefined;
  const status = (STATUSES as string[]).includes(sp.status ?? "")
    ? (sp.status as InscriptionStatus)
    : undefined;

  const [formations, inscriptions] = await Promise.all([
    listAllFormations({ limit: 200 }),
    listInscriptions({ formationId, status, limit: 500 }),
  ]);

  // Stats par statut sur l'ensemble selectionne
  const statsByStatus: Record<string, number> = {
    en_attente: 0,
    confirmee: 0,
    payee: 0,
    annulee: 0,
  };
  for (const i of inscriptions) {
    statsByStatus[i.status] = (statsByStatus[i.status] ?? 0) + 1;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inscriptions</h1>
        <p className="text-sm text-slate-500 mt-1">
          Inscriptions aux formations. Filtrez par formation ou par statut, et changez le statut depuis le bouton « Gérer ».
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATUSES.map((s) => (
          <div
            key={s}
            className="bg-white border border-slate-200 rounded-lg p-3"
          >
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              {INSCRIPTION_STATUS_LABEL[s]}
            </div>
            <div className="text-xl font-bold tabular-nums mt-1 text-slate-900">
              {statsByStatus[s] ?? 0}
            </div>
          </div>
        ))}
      </div>

      <form
        className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-end gap-3"
        action="/admin/inscriptions"
        method="get"
      >
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Formation</label>
          <select
            name="formation"
            defaultValue={formationId ?? ""}
            className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white min-w-[260px]"
          >
            <option value="">Toutes les formations</option>
            {formations.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Statut</label>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="">Tous</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {INSCRIPTION_STATUS_LABEL[s]}
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
        {(formationId || status) && (
          <a
            href="/admin/inscriptions"
            className="text-xs text-slate-600 hover:text-slate-900 underline"
          >
            Réinitialiser
          </a>
        )}
      </form>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <InscriptionsTable inscriptions={inscriptions} />
      </div>
    </div>
  );
}

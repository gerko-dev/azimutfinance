import MembersTable from "@/components/admin/MembersTable";
import { requireAdmin } from "@/lib/admin/auth";
import { listMembers } from "@/lib/admin/queries";

export default async function MembersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { userId, level } = await requireAdmin(3);
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const pageSize = 50;
  const members = await listMembers({
    search: search || undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Membres</h1>
          <p className="text-sm text-slate-500 mt-1">
            Liste des comptes inscrits sur la plateforme
            {level === 1
              ? " · vous pouvez modifier les rôles et supprimer des comptes."
              : " · lecture seule pour votre niveau."}
          </p>
        </div>
      </div>

      <form className="flex gap-2 max-w-md" action="/admin/membres" method="get">
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Rechercher par email, pseudo ou nom..."
          className="flex-1 text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:border-slate-500"
        />
        <button
          type="submit"
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
        >
          Chercher
        </button>
      </form>

      <MembersTable members={members} myLevel={level} myUserId={userId} />

      {/* Pagination simple */}
      <div className="flex justify-between items-center text-xs">
        <span className="text-slate-500">
          {members.length} membre{members.length > 1 ? "s" : ""} affiché
          {members.length > 1 ? "s" : ""}
        </span>
        <div className="flex gap-2">
          {page > 0 && (
            <a
              href={`/admin/membres?q=${encodeURIComponent(search)}&page=${page - 1}`}
              className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50"
            >
              ← Précédent
            </a>
          )}
          {members.length === pageSize && (
            <a
              href={`/admin/membres?q=${encodeURIComponent(search)}&page=${page + 1}`}
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

import NewsletterTable from "@/components/admin/NewsletterTable";
import { listNewsletterSubscribers } from "@/lib/magazine/queries";
import type { NewsletterStatus } from "@/lib/magazine/types";

export const dynamic = "force-dynamic";

export default async function NewsletterAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  const statusFilter = (["active", "unsubscribed"] as string[]).includes(sp.status ?? "")
    ? (sp.status as NewsletterStatus)
    : undefined;

  const subscribers = await listNewsletterSubscribers({
    search: search || undefined,
    status: statusFilter,
    limit: 1000,
  });

  const counts = {
    active: subscribers.filter((s) => s.status === "active").length,
    unsubscribed: subscribers.filter((s) => s.status === "unsubscribed").length,
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Abonnés à la newsletter mensuelle d&apos;Azimut Magazine. Les inscriptions sont gratuites,
        avec désabonnement en 1 clic depuis ce tableau.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Actifs" value={counts.active.toString()} accent="text-emerald-700" />
        <Card label="Désabonnés" value={counts.unsubscribed.toString()} accent="text-slate-700" />
      </div>

      <form
        className="flex flex-wrap gap-2 items-end bg-white rounded-lg border border-slate-200 p-3"
        action="/admin/magazine/newsletter"
        method="get"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] text-slate-500 mb-1">Recherche</label>
          <input
            type="text"
            name="q"
            defaultValue={search}
            placeholder="Email, nom…"
            className="w-full text-sm border border-slate-300 rounded px-3 py-1.5"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Statut</label>
          <select
            name="status"
            defaultValue={statusFilter ?? ""}
            className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="">Tous</option>
            <option value="active">Actifs</option>
            <option value="unsubscribed">Désabonnés</option>
          </select>
        </div>
        <button
          type="submit"
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
        >
          Filtrer
        </button>
        {(search || statusFilter) && (
          <a
            href="/admin/magazine/newsletter"
            className="text-xs text-slate-600 hover:text-slate-900 underline pb-1.5"
          >
            Réinitialiser
          </a>
        )}
      </form>

      <NewsletterTable subscribers={subscribers} />
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </div>
      <div className={`text-xl font-bold tabular-nums mt-1 ${accent ?? "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

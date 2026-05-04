import Link from "next/link";
import { notFound } from "next/navigation";
import FormationForm from "@/components/admin/FormationForm";
import InscriptionsTable from "@/components/admin/InscriptionsTable";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getFormationById,
  listInscriptions,
} from "@/lib/formations/queries";

export const dynamic = "force-dynamic";

export default async function EditFormationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(2);
  const { id } = await params;
  const [formation, inscriptions] = await Promise.all([
    getFormationById(id),
    listInscriptions({ formationId: id, limit: 200 }),
  ]);

  if (!formation) notFound();

  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-500">
        <Link href="/admin/formations" className="hover:text-slate-700">
          Formations
        </Link>{" "}
        &rsaquo; <span className="text-slate-700">{formation.title}</span>
      </div>

      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-900">{formation.title}</h1>
        <Link
          href={`/academie/formations/${formation.slug}`}
          target="_blank"
          className="text-xs text-slate-600 hover:text-slate-900 underline"
        >
          Voir la page publique →
        </Link>
      </div>

      <FormationForm mode="edit" initial={formation} />

      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Inscrits sur cette formation
          </h2>
          <span className="text-[11px] text-slate-500">
            {inscriptions.length} inscription{inscriptions.length > 1 ? "s" : ""}
          </span>
        </div>
        <InscriptionsTable inscriptions={inscriptions} compact />
      </section>
    </div>
  );
}

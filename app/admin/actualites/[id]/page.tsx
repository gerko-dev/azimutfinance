import { notFound } from "next/navigation";
import Link from "next/link";
import ActualiteForm from "@/components/admin/ActualiteForm";
import DeleteActualiteButton from "@/components/admin/DeleteActualiteButton";
import { requireAdmin } from "@/lib/admin/auth";
import { getActualite } from "@/lib/actualites/queries";

export const dynamic = "force-dynamic";

export default async function EditActualitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(3);
  const { id } = await params;
  const actualite = await getActualite(id);
  if (!actualite) notFound();

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500">
        <Link href="/admin/actualites" className="hover:text-slate-700">
          Actualités
        </Link>{" "}
        &rsaquo; {actualite.ticker} &rsaquo; Édition
      </div>
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-900">
          Éditer · {actualite.ticker}
        </h1>
        <DeleteActualiteButton id={actualite.id} />
      </div>
      <ActualiteForm mode="edit" initial={actualite} />
    </div>
  );
}

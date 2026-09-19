import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EMAIL_TEMPLATE_DESCRIPTIONS,
  EMAIL_TEMPLATE_LABELS,
  EMAIL_TEMPLATE_SLUGS,
} from "@/lib/email/defaults";

export const dynamic = "force-dynamic";

type Row = { slug: string; subject: string; updated_at: string };

export default async function EmailTemplatesPage() {
  await requireAdmin(2);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("email_templates")
    .select("slug, subject, updated_at")
    .order("slug");

  const rows = (data ?? []) as Row[];
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Templates emails</h1>
        <p className="text-sm text-slate-500 mt-1">
          Modifie le contenu des emails transactionnels envoyés aux
          utilisateurs. Ajoute des images, change la couleur d&apos;accent,
          réorganise les blocs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EMAIL_TEMPLATE_SLUGS.map((slug) => {
          const row = bySlug.get(slug);
          const isInDb = !!row;
          return (
            <Link
              key={slug}
              href={`/admin/email-templates/${slug}`}
              className="block bg-white border border-slate-200 rounded-lg p-5 hover:border-slate-300 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="text-sm font-semibold text-slate-900">
                  {EMAIL_TEMPLATE_LABELS[slug]}
                </div>
                {isInDb ? (
                  <span className="text-[10px] uppercase font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                    En DB
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                    Défaut (code)
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mb-3">
                {EMAIL_TEMPLATE_DESCRIPTIONS[slug]}
              </div>
              <div className="text-xs text-slate-700">
                <span className="text-slate-500">Sujet : </span>
                <span className="font-medium">{row?.subject ?? "—"}</span>
              </div>
              {row?.updated_at && (
                <div className="text-[11px] text-slate-400 mt-2">
                  Modifié le{" "}
                  {new Date(row.updated_at).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              )}
              <div className="text-xs text-blue-700 mt-3 font-medium">
                Éditer →
              </div>
            </Link>
          );
        })}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600">
        <strong className="text-slate-900">Variables disponibles :</strong> tu
        peux insérer <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{`{{full_name}}`}</code>,{" "}
        <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{`{{plan_label}}`}</code>,{" "}
        <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{`{{amount}}`}</code>,{" "}
        <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{`{{premium_until}}`}</code>,{" "}
        <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{`{{account_url}}`}</code>,{" "}
        <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{`{{rejection_reason}}`}</code> dans le sujet ou n&apos;importe quel
        bloc de texte. Elles sont remplacées au moment de l&apos;envoi.
      </div>
    </div>
  );
}

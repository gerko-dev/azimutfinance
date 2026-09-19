import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { loadEmailTemplate } from "@/lib/email/load";
import {
  EMAIL_TEMPLATE_LABELS,
  EMAIL_TEMPLATE_SLUGS,
} from "@/lib/email/defaults";
import { EMAIL_VARIABLE_HINTS } from "@/lib/email/blocks";
import EmailTemplateEditor from "./EmailTemplateEditor";

export const dynamic = "force-dynamic";

export default async function EmailTemplateEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin(2);
  const { slug } = await params;

  if (!EMAIL_TEMPLATE_SLUGS.includes(slug)) notFound();

  const template = await loadEmailTemplate(slug);
  const variables = EMAIL_VARIABLE_HINTS[slug] ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/admin/email-templates" className="hover:text-slate-900">
          Templates emails
        </Link>
        <span>›</span>
        <span className="text-slate-900">{EMAIL_TEMPLATE_LABELS[slug]}</span>
      </div>

      <EmailTemplateEditor template={template} variables={variables} />
    </div>
  );
}

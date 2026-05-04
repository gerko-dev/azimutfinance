import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import {
  attachmentPublicUrl,
  getActualite,
  listPublishedActualites,
} from "@/lib/actualites/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const a = await getActualite(id);
  if (!a) return { title: "Actualité — AzimutFinance" };
  return {
    title: `${a.title} — Actualités ${a.ticker}`,
    description: a.excerpt || a.body.slice(0, 160),
  };
}

function fmtSize(bytes: number | null): string {
  if (bytes === null || !isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function fmtDateLong(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default async function ActualitePublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const a = await getActualite(id);
  if (!a) notFound();
  // Si brouillon, on n'affiche pas (sauf admin via la page admin)
  if (!a.published_at) notFound();

  const downloadUrl = attachmentPublicUrl(a.attachment_path);

  // Articles liés (même ticker, hors le courant)
  const related = (await listPublishedActualites({ ticker: a.ticker, limit: 4 })).filter(
    (r) => r.id !== a.id,
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="text-xs text-slate-500 mb-3">
          <Link href="/" className="hover:text-slate-700">Accueil</Link> &rsaquo;{" "}
          <Link href="/actualites" className="hover:text-slate-700">Actualités</Link>{" "}
          &rsaquo;{" "}
          <Link
            href={`/actualites?ticker=${a.ticker}`}
            className="hover:text-slate-700 font-mono"
          >
            {a.ticker}
          </Link>
        </div>

        <article>
          <span className="text-[11px] uppercase tracking-wider font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded inline-block">
            {a.ticker}
          </span>
          <h1
            className="text-3xl md:text-4xl font-bold text-slate-900 mt-3 leading-tight"
            style={{ fontFamily: "Georgia, serif" }}
          >
            {a.title}
          </h1>
          {a.excerpt && (
            <p className="text-base md:text-lg text-slate-600 mt-3 leading-relaxed">
              {a.excerpt}
            </p>
          )}
          <div className="text-xs text-slate-500 mt-4">
            Publié le {fmtDateLong(a.published_at)}
          </div>

          <div
            className="prose-content mt-6 text-base text-slate-800 leading-relaxed whitespace-pre-wrap"
            style={{ fontFamily: "Georgia, serif" }}
          >
            {a.body}
          </div>

          {a.source_url && (
            <p className="mt-5 text-sm">
              <a
                href={a.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 hover:underline"
              >
                Source externe ↗
              </a>
            </p>
          )}

          {/* Pièce jointe */}
          {downloadUrl && a.attachment_name && (
            <div className="mt-8 p-4 md:p-5 border border-slate-200 rounded-lg bg-white">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                Document à télécharger
              </div>
              <a
                href={downloadUrl}
                download={a.attachment_name}
                className="flex items-center gap-3 text-slate-900 hover:text-blue-700 group"
              >
                <span className="text-2xl">📎</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium group-hover:underline">
                    {a.attachment_name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {fmtSize(a.attachment_size_bytes)}
                  </div>
                </div>
                <span className="text-sm text-blue-700 group-hover:underline">
                  Télécharger ↓
                </span>
              </a>
            </div>
          )}
        </article>

        {related.length > 0 && (
          <section className="mt-10 pt-6 border-t border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900 mb-3 uppercase tracking-wide">
              Autres actualités · {a.ticker}
            </h2>
            <ul className="space-y-2.5">
              {related.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/actualites/${r.id}`}
                    className="block text-sm text-slate-900 hover:text-blue-700 hover:underline"
                  >
                    {r.title}
                  </Link>
                  <div className="text-[11px] text-slate-500">
                    {fmtDateLong(r.published_at)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 pt-6 border-t border-slate-200">
          <Link
            href="/actualites"
            className="inline-flex items-center gap-2 text-sm text-slate-700 hover:text-blue-700 hover:underline"
          >
            ← Toutes les actualités
          </Link>
        </div>
      </main>
    </div>
  );
}

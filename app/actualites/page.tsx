import Link from "next/link";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import { listPublishedActualites } from "@/lib/actualites/queries";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Actualités BRVM — AzimutFinance",
  description: "Actualités sur les valeurs cotées à la BRVM par AzimutFinance.",
  path: "/actualites",
});

export const dynamic = "force-dynamic";

function fmtDateShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default async function ActualitesListPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const sp = await searchParams;
  const ticker = sp.ticker?.trim().toUpperCase() || undefined;
  const items = await listPublishedActualites({ ticker, limit: 100 });

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <PageHero
        breadcrumb={[{ label: "Accueil", href: "/" }, { label: "Actualités" }]}
        title={`Actualités BRVM${ticker ? ` · ${ticker}` : ""}`}
        subtitle="Communications, résultats et annonces des sociétés cotées à la BRVM."
      />
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-10">
        {ticker && (
          <div className="mb-4">
            <Link href="/actualites" className="text-xs text-blue-700 hover:underline">
              ← Voir toutes les valeurs
            </Link>
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
            Aucune actualité publiée{ticker ? ` pour ${ticker}` : ""} pour le moment.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/actualites/${a.id}`}
                  className="block bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm rounded-lg p-4 transition group"
                >
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-[10px] uppercase tracking-wider font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono">
                      {a.ticker}
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {fmtDateShort(a.published_at)}
                    </span>
                    {a.attachment_name && (
                      <span
                        className="text-[10px] text-amber-700 font-medium"
                        title={a.attachment_name}
                      >
                        📎 doc joint
                      </span>
                    )}
                  </div>
                  <h2
                    className="text-base md:text-lg font-bold text-slate-900 group-hover:text-blue-700 transition leading-snug"
                    style={{ fontFamily: "Georgia, serif" }}
                  >
                    {a.title}
                  </h2>
                  {a.excerpt && (
                    <p className="text-sm text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
                      {a.excerpt}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

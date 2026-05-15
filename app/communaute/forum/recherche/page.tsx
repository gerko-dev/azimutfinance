import Link from "next/link";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import Footer from "@/components/Footer";
import { searchForum } from "@/lib/forum/queries";
import ForumSearchBar from "../ForumSearchBar";

export const metadata = {
  title: "Recherche — Forum AzimutFinance",
};

export const dynamic = "force-dynamic";

export default async function ForumSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const hits = q ? await searchForum(q, 50) : [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Forum", href: "/communaute/forum" },
          { label: "Recherche" },
        ]}
        title="Recherche dans le forum"
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 md:px-6 py-8 md:py-12">
        <ForumSearchBar initialQuery={q} />

        {q ? (
          <div className="mt-6">
            <div className="text-xs text-slate-500 mb-3">
              {hits.length} résultat{hits.length > 1 ? "s" : ""} pour «{" "}
              <span className="font-mono">{q}</span> »
            </div>
            {hits.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
                Aucune discussion ne correspond à cette recherche.
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                {hits.map((h) => (
                  <Link
                    key={h.topic_id}
                    href={`/communaute/forum/t/${h.topic_id}`}
                    className="block px-4 py-3 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-[10px] uppercase font-semibold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                        {h.category_slug}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 line-clamp-1">
                        {h.title}
                      </span>
                    </div>
                    {h.snippet && (
                      <div
                        className="text-xs text-slate-600 leading-relaxed line-clamp-2 [&_mark]:bg-yellow-100 [&_mark]:text-yellow-900 [&_mark]:rounded [&_mark]:px-0.5"
                        dangerouslySetInnerHTML={{ __html: h.snippet }}
                      />
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 text-sm text-slate-500">
            Saisissez un terme pour lancer la recherche.
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

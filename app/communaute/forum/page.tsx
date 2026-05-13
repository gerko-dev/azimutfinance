import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listCategoriesWithStats,
  listTopics,
} from "@/lib/forum/queries";
import ForumSearchBar from "./ForumSearchBar";
import TopicRow from "./TopicRow";

export const metadata = {
  title: "Forum investisseurs — AzimutFinance",
  description:
    "Discussions entre investisseurs UEMOA : actions BRVM, obligations, FCP, macro, stratégies. Posez vos questions, partagez vos idées.",
};

export const dynamic = "force-dynamic";

export default async function ForumIndexPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [cats, recentTopics] = await Promise.all([
    listCategoriesWithStats(),
    listTopics({ limit: 15 }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
              Forum investisseurs
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Échangez sur les marchés UEMOA : actions BRVM, obligations, FCP,
              macro, stratégies. La lecture est libre, la participation
              nécessite un compte gratuit.
            </p>
          </div>
          {user ? (
            <Link
              href="/communaute/forum/nouveau"
              className="px-4 py-2 rounded-md bg-blue-700 text-white text-sm font-medium hover:bg-blue-800"
            >
              + Nouvelle discussion
            </Link>
          ) : (
            <Link
              href="/connexion?redirect=/communaute/forum/nouveau"
              className="px-4 py-2 rounded-md bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 border border-slate-300"
            >
              Connectez-vous pour participer
            </Link>
          )}
        </div>

        <ForumSearchBar />

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Catégories
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {cats.map((c) => (
              <CategoryCard key={c.id} category={c} />
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Discussions récentes
            </h2>
            <span className="text-xs text-slate-400 tabular-nums">
              {recentTopics.length} dernières
            </span>
          </div>
          {recentTopics.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
              Aucune discussion pour le moment. Soyez le premier à lancer le
              débat !
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
              {recentTopics.map((t) => (
                <TopicRow key={t.id} topic={t} showCategory />
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

function CategoryCard({
  category,
}: {
  category: Awaited<ReturnType<typeof listCategoriesWithStats>>[number];
}) {
  return (
    <Link
      href={`/communaute/forum/c/${category.slug}`}
      className="block bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">
            {category.name}
          </div>
          {category.description && (
            <div className="text-xs text-slate-500 mt-1 leading-relaxed">
              {category.description}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-bold tabular-nums text-slate-900">
            {category.topic_count}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            sujets
          </div>
        </div>
      </div>
    </Link>
  );
}

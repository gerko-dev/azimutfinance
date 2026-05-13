import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countTopics, getCategoryBySlug, listTopics } from "@/lib/forum/queries";
import TopicRow from "../../TopicRow";
import Pager, { parsePage } from "../../Pager";

const PAGE_SIZE = 30;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) return { title: "Catégorie introuvable — Forum" };
  return {
    title: `${cat.name} — Forum AzimutFinance`,
    description: cat.description ?? undefined,
  };
}

export default async function ForumCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) notFound();

  const sp = await searchParams;
  const page = parsePage(sp.p);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [topics, total] = await Promise.all([
    listTopics({ categoryId: cat.id, limit: PAGE_SIZE, offset }),
    countTopics({ categoryId: cat.id }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-8 md:py-12">
        <nav className="text-xs text-slate-500 mb-4 flex flex-wrap items-center gap-2">
          <Link href="/communaute/forum" className="hover:text-slate-900">
            Forum
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700">{cat.name}</span>
        </nav>

        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
              {cat.name}
            </h1>
            {cat.description && (
              <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                {cat.description}
              </p>
            )}
          </div>
          {user ? (
            <Link
              href={`/communaute/forum/nouveau?categorie=${cat.slug}`}
              className="px-4 py-2 rounded-md bg-blue-700 text-white text-sm font-medium hover:bg-blue-800"
            >
              + Nouvelle discussion
            </Link>
          ) : (
            <Link
              href={`/connexion?redirect=/communaute/forum/c/${cat.slug}`}
              className="px-4 py-2 rounded-md bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 border border-slate-300"
            >
              Connectez-vous pour participer
            </Link>
          )}
        </div>

        {topics.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
            Aucune discussion dans cette catégorie pour le moment.
          </div>
        ) : (
          <>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
              {topics.map((t) => (
                <TopicRow key={t.id} topic={t} />
              ))}
            </div>
            <Pager
              baseHref={`/communaute/forum/c/${cat.slug}`}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
            />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

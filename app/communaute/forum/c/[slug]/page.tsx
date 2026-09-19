import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
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

      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Forum", href: "/communaute/forum" },
          { label: cat.name },
        ]}
        title={cat.name}
        subtitle={cat.description ?? undefined}
      >
        {user ? (
          <Link
            href={`/communaute/forum/nouveau?categorie=${cat.slug}`}
            className="inline-block px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            + Nouvelle discussion
          </Link>
        ) : (
          <Link
            href={`/connexion?redirect=/communaute/forum/c/${cat.slug}`}
            className="inline-block px-4 py-2 rounded-md bg-white/10 text-white text-sm font-medium hover:bg-white/20 border border-white/20"
          >
            Connectez-vous pour participer
          </Link>
        )}
      </PageHero>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-8 md:py-12">
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

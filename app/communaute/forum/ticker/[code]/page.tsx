import Link from "next/link";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import Footer from "@/components/Footer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countTopics, listTopics } from "@/lib/forum/queries";
import TopicRow from "../../TopicRow";
import Pager, { parsePage } from "../../Pager";

const PAGE_SIZE = 30;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upper = code.toUpperCase();
  return {
    title: `Forum · ${upper} — AzimutFinance`,
    description: `Discussions du forum AzimutFinance taguées ${upper}.`,
  };
}

export default async function ForumByTickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { code } = await params;
  const upper = code.toUpperCase();
  const sp = await searchParams;
  const page = parsePage(sp.p);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [topics, total] = await Promise.all([
    listTopics({ ticker: upper, limit: PAGE_SIZE, offset }),
    countTopics({ ticker: upper }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Forum", href: "/communaute/forum" },
          { label: `Ticker ${upper}` },
        ]}
        title={`Discussions taguées ${upper}`}
        subtitle="Tous les topics du forum qui mentionnent ce code dans leurs tags."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/titre/${code.toLowerCase()}`}
            className="text-xs text-blue-300 hover:text-blue-200 hover:underline"
          >
            Voir la fiche titre →
          </Link>
          {user && (
            <Link
              href="/communaute/forum/nouveau"
              className="inline-block px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              + Nouvelle discussion
            </Link>
          )}
        </div>
      </PageHero>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-8 md:py-12">
        {topics.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
            Aucune discussion ne tague {upper} pour le moment.
          </div>
        ) : (
          <>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
              {topics.map((t) => (
                <TopicRow key={t.id} topic={t} showCategory />
              ))}
            </div>
            <Pager
              baseHref={`/communaute/forum/ticker/${code.toLowerCase()}`}
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

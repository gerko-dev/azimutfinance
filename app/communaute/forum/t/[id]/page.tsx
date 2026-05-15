import { notFound } from "next/navigation";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import Footer from "@/components/Footer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAdminLevel } from "@/lib/admin/auth";
import { getTopicWithReplies } from "@/lib/forum/queries";
import { markTopicReadAction } from "@/lib/forum/actions";
import TopicView from "../../TopicView";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getTopicWithReplies(id);
  if (!data) return { title: "Discussion introuvable — Forum" };
  return {
    title: `${data.topic.title} — Forum AzimutFinance`,
    description: data.topic.body.slice(0, 160),
  };
}

export default async function ForumTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getTopicWithReplies(id);
  if (!data) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminLevel = user ? await getMyAdminLevel() : null;

  // Marque comme lu : si l'auteur du topic est l'utilisateur courant, il y a
  // peut-etre des notifications "nouvelle reponse" a marquer
  if (user && user.id === data.topic.author_id) {
    await markTopicReadAction(id);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Forum", href: "/communaute/forum" },
          ...(data.topic.category_slug
            ? [
                {
                  label: data.topic.category_name ?? "Catégorie",
                  href: `/communaute/forum/c/${data.topic.category_slug}`,
                },
              ]
            : []),
          { label: data.topic.title },
        ]}
        title={data.topic.title}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 md:px-6 py-8 md:py-12">
        <TopicView
          topic={data.topic}
          replies={data.replies}
          currentUserId={user?.id ?? null}
          adminLevel={adminLevel}
        />
      </main>

      <Footer />
    </div>
  );
}

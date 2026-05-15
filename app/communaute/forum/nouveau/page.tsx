import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import Footer from "@/components/Footer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/forum/queries";
import NewTopicForm from "./NewTopicForm";

export const metadata = {
  title: "Nouvelle discussion — Forum AzimutFinance",
};

export const dynamic = "force-dynamic";

export default async function NewTopicPage({
  searchParams,
}: {
  searchParams: Promise<{ categorie?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/connexion?redirect=" + encodeURIComponent("/communaute/forum/nouveau"),
    );
  }

  const sp = await searchParams;
  const categories = await listCategories();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Forum", href: "/communaute/forum" },
          { label: "Nouvelle discussion" },
        ]}
        title="Démarrer une discussion"
        subtitle="Restez constructif et respectueux. Les signalements abusifs entraînent des sanctions."
      />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 md:px-6 py-8 md:py-12">
        <NewTopicForm
          categories={categories}
          defaultCategorySlug={sp.categorie ?? null}
        />
      </main>

      <Footer />
    </div>
  );
}

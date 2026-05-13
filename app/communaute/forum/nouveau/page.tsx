import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
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

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 md:px-6 py-8 md:py-12">
        <nav className="text-xs text-slate-500 mb-4 flex flex-wrap items-center gap-2">
          <Link href="/communaute/forum" className="hover:text-slate-900">
            Forum
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700">Nouvelle discussion</span>
        </nav>

        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-1">
          Démarrer une discussion
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          Restez constructif et respectueux. Les signalements abusifs entraînent
          des sanctions.
        </p>

        <NewTopicForm
          categories={categories}
          defaultCategorySlug={sp.categorie ?? null}
        />
      </main>

      <Footer />
    </div>
  );
}

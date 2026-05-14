import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMyWatchlists, getMyWatchlist } from "@/lib/watchlists/queries";
import { enrichWatchlistItems } from "@/lib/watchlists/enrich";
import WatchlistManager from "./WatchlistManager";

export const metadata = {
  title: "Ma watchlist — AzimutFinance",
  description: "Suivez vos titres BRVM, obligations, indices et matières premières favoris.",
};

export const dynamic = "force-dynamic";

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion?redirect=/outils/watchlist");
  }

  const lists = await listMyWatchlists();
  const sp = await searchParams;
  const selectedId =
    (sp.id && lists.some((l) => l.id === sp.id) && sp.id) ||
    lists[0]?.id ||
    null;
  const selectedRaw = selectedId ? await getMyWatchlist(selectedId) : null;
  const selected = selectedRaw
    ? { ...selectedRaw, items: enrichWatchlistItems(selectedRaw.items) }
    : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            Accueil › Outils › <span className="text-slate-200">Watchlist</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold text-white">
            Mes watchlists
          </h1>
          <p className="text-sm md:text-base text-slate-300 mt-1 max-w-2xl">
            Organisez vos titres préférés en listes nommées (actions BRVM,
            obligations, indices, devises, matières premières). Passez ensuite
            sur <a className="underline hover:text-white" href="/outils/alertes">/outils/alertes</a> pour être averti aux moments
            qui comptent.
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-6 md:py-8">
        <WatchlistManager
          lists={lists}
          selected={selected}
          selectedId={selectedId}
        />
      </main>
    </div>
  );
}

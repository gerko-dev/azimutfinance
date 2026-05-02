import Link from "next/link";
import Header from "@/components/Header";
import MessagerieApp from "@/components/messagerie/MessagerieApp";
import {
  getConversation,
  getThread,
  listMyConversations,
} from "@/lib/messagerie/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Messagerie — AzimutFinance",
  description:
    "Messagerie instantanée entre membres d'AzimutFinance. Échangez en privé sur les marchés, vos analyses et idées d'investissement.",
};

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <div className="bg-white rounded-lg border border-slate-200 p-6 md:p-10 text-center">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
              Espace membre · Messagerie
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mt-2">
              Messagerie réservée aux membres
            </h1>
            <p className="text-sm text-slate-600 mt-3 max-w-xl mx-auto leading-relaxed">
              Échangez en privé avec les autres membres d&apos;AzimutFinance : partagez vos
              analyses, vos idées d&apos;investissement, organisez des échanges entre pros.
            </p>
            <div className="mt-6 flex justify-center gap-3 flex-wrap">
              <Link
                href="/connexion?redirect=/messagerie"
                className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-5 py-2.5 rounded transition"
              >
                Se connecter
              </Link>
              <Link
                href="/inscription?redirect=/messagerie"
                className="text-sm bg-white hover:bg-slate-50 text-slate-900 font-medium px-5 py-2.5 rounded border border-slate-300 transition"
              >
                Créer un compte
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const sp = await searchParams;
  const requestedConvId = sp?.c ?? null;

  const conversations = await listMyConversations();

  // Determiner la conv active : query param OU la plus recente
  let activeId = requestedConvId;
  if (
    activeId &&
    !conversations.find((c) => c.id === activeId)
  ) {
    activeId = null;
  }
  if (!activeId && conversations.length > 0) {
    activeId = conversations[0].id;
  }

  let initialMessages: Awaited<ReturnType<typeof getThread>> = [];
  let initialOther: NonNullable<Awaited<ReturnType<typeof getConversation>>>["other"] = null;
  if (activeId) {
    initialMessages = await getThread(activeId);
    const conv = await getConversation(activeId);
    initialOther = conv?.other ?? null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
        <div className="text-xs text-slate-500 mb-3">
          Accueil &rsaquo; <span className="text-slate-700">Messagerie</span>
        </div>

        <MessagerieApp
          currentUserId={user.id}
          conversations={conversations}
          initialActiveId={activeId}
          initialMessages={initialMessages}
          initialOther={initialOther}
        />

        <p className="text-[11px] text-slate-400 mt-3 text-center">
          Messagerie privée entre membres · pas de modération automatique · soyez courtois
          et respectez nos règles communautaires.
        </p>
      </main>
    </div>
  );
}

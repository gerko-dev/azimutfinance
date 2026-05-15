import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import AccountForm from "@/components/academie/compte-titre/AccountForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAccount, listTpsRates } from "@/lib/comptetitre/queries";

export const dynamic = "force-dynamic";

export default async function ParametresPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?redirect=/academie/compte-titre/${id}/parametres`);

  const [account, tpsRates] = await Promise.all([
    getMyAccount(id),
    listTpsRates(),
  ]);
  if (!account) notFound();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Suivi de compte titre", href: "/academie/compte-titre" },
          { label: account.name, href: `/academie/compte-titre/${id}` },
          { label: "Paramètres" },
        ]}
        title="Paramètres du compte"
        subtitle="Modifiez les paramètres ou supprimez le compte."
      />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-5 md:py-6 space-y-4">
        <AccountForm mode="edit" initial={account} tpsRates={tpsRates} />
      </main>
    </div>
  );
}

import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import AccountForm from "@/components/academie/compte-titre/AccountForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listTpsRates } from "@/lib/comptetitre/queries";

export const metadata = {
  title: "Nouveau compte titre — AzimutFinance",
};

export const dynamic = "force-dynamic";

export default async function NouveauComptePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?redirect=/academie/compte-titre/nouveau");

  const tpsRates = await listTpsRates();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Suivi de compte titre", href: "/academie/compte-titre" },
          { label: "Nouveau compte" },
        ]}
        title="Créer un compte titre"
        subtitle="Renseignez les paramètres une fois pour toutes ; vous pourrez les modifier plus tard."
      />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-5 md:py-6 space-y-4">
        <AccountForm mode="create" tpsRates={tpsRates} />
      </main>
    </div>
  );
}

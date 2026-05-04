import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
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
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-5 md:py-6 space-y-4">
        <div className="text-xs text-slate-500">
          <Link href="/academie/compte-titre" className="hover:text-slate-700">
            Suivi de compte titre
          </Link>{" "}
          &rsaquo; Nouveau compte
        </div>
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">
            Créer un compte titre
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Renseignez les paramètres une fois pour toutes ; vous pourrez les modifier plus tard.
          </p>
        </header>
        <AccountForm mode="create" tpsRates={tpsRates} />
      </main>
    </div>
  );
}

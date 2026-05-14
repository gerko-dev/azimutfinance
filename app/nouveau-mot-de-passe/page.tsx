import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NewPasswordForm from "./NewPasswordForm";

export const metadata = {
  title: "Nouveau mot de passe — AzimutFinance",
};

export default async function NouveauMotDePassePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // La page n'est utile qu'avec une session active : soit le lien de
  // réinitialisation a été suivi (/auth/callback a échangé le code contre une
  // session), soit l'utilisateur est déjà connecté. Sinon, on renvoie vers la
  // demande de lien.
  if (!user) {
    redirect("/mot-de-passe-oublie");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-md mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="bg-white border border-slate-200 rounded-lg p-6 md:p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900 mb-1">
            Nouveau mot de passe
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            Choisis un nouveau mot de passe pour ton compte AzimutFinance.
          </p>

          <NewPasswordForm />
        </div>
      </main>
    </div>
  );
}

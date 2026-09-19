import Link from "next/link";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import ResetForm from "./ResetForm";

export const metadata = {
  title: "Mot de passe oublié — AzimutFinance",
};

export default function MotDePasseOubliePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Connexion", href: "/connexion" },
          { label: "Mot de passe oublié" },
        ]}
        title="Mot de passe oublié"
        subtitle="Entre l'email associé à ton compte. Si un compte existe, tu recevras un lien pour définir un nouveau mot de passe."
      />
      <main className="max-w-md mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="bg-white border border-slate-200 rounded-lg p-6 md:p-8 shadow-sm">
          <ResetForm />

          <p className="mt-6 text-sm text-center text-slate-600">
            <Link href="/connexion" className="text-blue-700 hover:underline">
              ← Retour à la connexion
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

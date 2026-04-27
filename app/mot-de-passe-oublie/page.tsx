import Link from "next/link";
import Header from "@/components/Header";
import ResetForm from "./ResetForm";

export const metadata = {
  title: "Mot de passe oublié — AzimutFinance",
};

export default function MotDePasseOubliePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-md mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="bg-white border border-slate-200 rounded-lg p-6 md:p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900 mb-1">
            Mot de passe oublié
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            Entre l&apos;email associé à ton compte. Si un compte existe, tu recevras un
            lien pour définir un nouveau mot de passe.
          </p>

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

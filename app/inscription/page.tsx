import Link from "next/link";
import Header from "@/components/Header";
import SocialButtons from "@/components/auth/SocialButtons";
import SignupForm from "./SignupForm";

export const metadata = {
  title: "Inscription — AzimutFinance",
};

export default function InscriptionPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-md mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="bg-white border border-slate-200 rounded-lg p-6 md:p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900 mb-1">Inscription</h1>
          <p className="text-sm text-slate-500 mb-6">
            Crée ton compte AzimutFinance gratuitement.
          </p>

          <SocialButtons />

          <div className="flex items-center my-6">
            <div className="flex-1 border-t border-slate-200" />
            <span className="px-3 text-xs text-slate-400 uppercase">ou</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          <SignupForm />

          <p className="mt-6 text-sm text-center text-slate-600">
            Déjà inscrit ?{" "}
            <Link href="/connexion" className="text-blue-700 hover:underline font-medium">
              Connecte-toi
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

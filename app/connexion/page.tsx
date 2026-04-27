import Link from "next/link";
import Header from "@/components/Header";
import SocialButtons from "@/components/auth/SocialButtons";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "Connexion — AzimutFinance",
};

type SearchParams = Promise<{
  redirect?: string;
  error?: string;
}>;

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { redirect, error } = await searchParams;
  const redirectTo = redirect && redirect.startsWith("/") ? redirect : "/compte";

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-md mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="bg-white border border-slate-200 rounded-lg p-6 md:p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900 mb-1">Connexion</h1>
          <p className="text-sm text-slate-500 mb-6">
            Accède à ton espace membre AzimutFinance.
          </p>

          <SocialButtons />

          <div className="flex items-center my-6">
            <div className="flex-1 border-t border-slate-200" />
            <span className="px-3 text-xs text-slate-400 uppercase">ou</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          <LoginForm redirectTo={redirectTo} initialError={error} />

          <p className="mt-6 text-sm text-center text-slate-600">
            Pas encore de compte ?{" "}
            <Link href="/inscription" className="text-blue-700 hover:underline font-medium">
              Inscris-toi
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

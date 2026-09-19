import Link from "next/link";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
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
  // Sans cible explicite, on renvoie le membre sur sa page d'accueil ("/").
  const redirectTo = redirect && redirect.startsWith("/") ? redirect : "/";

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <PageHero
        breadcrumb={[{ label: "Accueil", href: "/" }, { label: "Connexion" }]}
        title="Connexion"
        subtitle="Accède à ton espace membre AzimutFinance."
      />
      <main className="max-w-md mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="bg-white border border-slate-200 rounded-lg p-6 md:p-8 shadow-sm">
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

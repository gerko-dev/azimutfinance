import Link from "next/link";
import Header from "@/components/Header";
import UnsubscribeForm from "./UnsubscribeForm";

export const metadata = {
  title: "Désinscription newsletter — AzimutFinance",
  description: "Retirer une adresse email de la newsletter AzimutFinance.",
};

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const sp = await searchParams;
  const presetEmail = (sp.email ?? "").trim();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs text-slate-400 mb-2 flex items-center gap-1.5 flex-wrap">
            <Link href="/" className="hover:text-white">
              Accueil
            </Link>
            <span>›</span>
            <Link
              href="/communaute/newsletter"
              className="hover:text-white"
            >
              Newsletter
            </Link>
            <span>›</span>
            <span className="text-slate-200">Désinscription</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold text-white">
            Se désinscrire de la newsletter
          </h1>
          <p className="text-xs md:text-sm text-slate-300 mt-1.5 max-w-2xl">
            Dis-nous au revoir en 1 clic. Tu peux toujours te réinscrire plus
            tard si tu changes d&apos;avis.
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 md:px-6 py-8 md:py-10">
        <UnsubscribeForm defaultEmail={presetEmail} />

        <p className="text-xs text-slate-500 mt-6 text-center">
          Souci avec la désinscription ? Écris à{" "}
          <a
            href="mailto:contact@azimutfinance.com"
            className="text-blue-700 hover:underline"
          >
            contact@azimutfinance.com
          </a>
          {" "}— retrait manuel sous 24 h.
        </p>
      </main>
    </div>
  );
}

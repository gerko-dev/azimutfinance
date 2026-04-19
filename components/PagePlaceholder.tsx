import Link from "next/link";
import Header from "./Header";
import Ticker from "./Ticker";

type Props = {
  title: string;
  description: string;
  badge?: "Premium" | "Pro" | "Bientôt";
};

export default function PagePlaceholder({ title, description, badge }: Props) {
  const badgeColors: Record<string, string> = {
    Premium: "bg-blue-100 text-blue-700",
    Pro: "bg-purple-100 text-purple-700",
    Bientôt: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-6xl mb-6">🚧</div>
          <div className="flex items-center justify-center gap-2 mb-3">
            <h1 className="text-2xl md:text-3xl font-semibold">{title}</h1>
            {badge && (
              <span className={`text-xs px-2 py-1 rounded font-medium ${badgeColors[badge]}`}>
                {badge}
              </span>
            )}
          </div>
          <p className="text-base md:text-lg text-slate-600 mb-6">{description}</p>
          <p className="text-sm text-slate-500 mb-8">
            Cette section est en cours de construction. Revenez bientôt pour découvrir ce contenu exclusif.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex justify-center items-center px-5 py-2.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
            >
              ← Retour à l&apos;accueil
            </Link>
            <Link
              href="/outils/ytm"
              className="inline-flex justify-center items-center px-5 py-2.5 text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800"
            >
              Essayer nos outils Pro
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
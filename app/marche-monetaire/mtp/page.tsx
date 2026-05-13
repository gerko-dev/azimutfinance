import Link from "next/link";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import RecapMTP from "@/components/marche-monetaire/RecapMTP";
import { loadUmoaEmissions } from "@/lib/dataLoader";

export const dynamic = "force-static";

export const metadata = {
  title: "Récapitulatif MTP — AzimutFinance",
  description:
    "Marché des Titres Publics UEMOA (UMOA-Titres) : récap des adjudications BAT et OAT sur 12 mois glissants — par pays, maturité, rendements moyens.",
};

export default function RecapMTPPage() {
  const emissions = loadUmoaEmissions();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />

      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            <Link href="/" className="hover:text-white hover:underline">
              Accueil
            </Link>{" "}
            ›{" "}
            <Link href="/marche-monetaire" className="hover:text-white hover:underline">
              Marché monétaire
            </Link>{" "}
            › <span className="text-slate-200">Récapitulatif MTP</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-white">
            Récapitulatif MTP
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            Marché des Titres Publics UEMOA — adjudications UMOA-Titres
            (Bons d&apos;Assimilation du Trésor à court terme et Obligations
            Assimilables du Trésor à moyen / long terme). Vue d&apos;ensemble par
            émetteur, maturité et type, sur 12 mois glissants.
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
        <RecapMTP emissions={emissions} />
      </main>
    </div>
  );
}

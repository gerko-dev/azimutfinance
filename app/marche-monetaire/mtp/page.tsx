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

      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="text-xs md:text-sm text-slate-500 mb-2">
            <Link href="/" className="hover:underline">
              Accueil
            </Link>{" "}
            ›{" "}
            <Link href="/marche-monetaire" className="hover:underline">
              Marché monétaire
            </Link>{" "}
            › Récapitulatif MTP
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2">
            Récapitulatif MTP
          </h1>
          <p className="text-sm md:text-base text-slate-600 max-w-3xl">
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

import { notFound } from "next/navigation";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import Ticker from "@/components/Ticker";
import SovereignDetailView from "@/components/SovereignDetailView";
import { loadUmoaEmissions } from "@/lib/dataLoader";
import {
  aggregateSovereignBonds,
  calculateSovereignSpread,
  getRelatedSovereignBonds,
  buildSovereignTheoreticalHistory,
  calculateInterCountrySpreads,
} from "@/lib/listedBondsTypes";
import { fetchUserRole } from "@/lib/auth/userRole";
import { pageMetadata } from "@/lib/seo";

// userRole lu via cookies → rendu dynamique.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const bond = aggregateSovereignBonds(loadUmoaEmissions()).find(
    (b) => b.id === decodedId,
  );
  if (!bond) {
    return pageMetadata({
      title: "Titre souverain introuvable — AzimutFinance",
      path: `/souverain/${id}`,
      noindex: true,
    });
  }
  const echeance = bond.maturityDate?.slice(0, 4);
  const label = `${bond.type} ${bond.countryName}${echeance ? ` ${echeance}` : ""}`;
  // noindex : ~2500 fiches d'adjudications historiques. Volontairement absentes
  // du sitemap pour preserver le budget de crawl ; on ajoute robots noindex
  // pour que Googlebot, qui les decouvre via /marches/souverains-non-cotes,
  // ne perde pas de temps a les reindexer en boucle. Cf. app/sitemap.ts.
  return pageMetadata({
    title: `${label} — Titre souverain UMOA-Titres`,
    description: `Fiche titre souverain ${bond.type} ${bond.countryName} (échéance ${bond.maturityDate}) : historique des adjudications UMOA-Titres, rendement, spread de signature et prix théorique.`,
    path: `/souverain/${id}`,
    noindex: true,
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Les ids OAT sont des ISIN; les ids BAT contiennent du caractere ":" / "-"
  // qu'il faut decoder depuis l'URL.
  const decodedId = decodeURIComponent(id);

  const emissions = loadUmoaEmissions();
  const bonds = aggregateSovereignBonds(emissions);
  const bond = bonds.find((b) => b.id === decodedId);
  if (!bond) notFound();

  const spread = calculateSovereignSpread(bond, emissions);
  const related = getRelatedSovereignBonds(bond, bonds, 6);
  const theoreticalHistory = buildSovereignTheoreticalHistory(bond, emissions, 24);
  const interCountrySpreads = calculateInterCountrySpreads(bond, emissions);
  const userRole = await fetchUserRole();

  const echeance = bond.maturityDate?.slice(0, 4);
  const heroTitle = `${bond.type} ${bond.countryName}${echeance ? ` · échéance ${echeance}` : ""}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <PageHero
        breadcrumb={[
          { label: "Marchés", href: "/" },
          { label: "Souverains non cotés", href: "/marches/souverains-non-cotes" },
          { label: heroTitle },
        ]}
        title={heroTitle}
        subtitle={`Trésor de ${bond.countryName} · UMOA-Titres${bond.isin ? ` · ISIN ${bond.isin}` : ""}`}
      />
      <SovereignDetailView
        bond={bond}
        spread={spread}
        related={related}
        theoreticalHistory={theoreticalHistory}
        interCountrySpreads={interCountrySpreads}
        userRole={userRole}
      />
    </div>
  );
}

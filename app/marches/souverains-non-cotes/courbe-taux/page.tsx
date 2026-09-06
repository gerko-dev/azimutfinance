import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import Link from "next/link";
import SovereignYieldCurve from "@/components/SovereignYieldCurve";
import BondsPaywallSection from "@/components/BondsPaywallSection";
import {
  loadUmoaEmissions,
  loadUmoaCourbesTaux,
  evalueCourbeUMOA,
} from "@/lib/dataLoader";
import {
  aggregateSovereignBonds,
  UMOA_COUNTRY_CODE,
} from "@/lib/listedBondsTypes";
import { fetchUserRole } from "@/lib/auth/userRole";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Courbe des taux souverains UMOA — AzimutFinance",
  path: "/marches/souverains-non-cotes/courbe-taux",
});

export const dynamic = "force-dynamic";

export default async function Page() {
  const userRole = await fetchUserRole();
  const isMember = userRole !== null;
  const isPremium = userRole === "premium" || userRole === "pro";

  if (!isPremium) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <Ticker />
        <BondsPaywallSection
          breadcrumb="Courbe des taux"
          title="Courbe des taux souverains UMOA"
          description="Les taux d'adjudication BAT et OAT par maturité résiduelle, comparables pays par pays ou instrument par instrument."
          features={[
            "Un point par ligne, issu de la dernière adjudication UMOA-Titres",
            "Courbes observées : médiane des taux par tranche de maturité",
            "Comparaison des signatures souveraines de la zone",
            "Mise à jour quotidienne avec les résultats d'adjudication",
          ]}
          isMember={isMember}
        />
      </div>
    );
  }

  const bonds = aggregateSovereignBonds(loadUmoaEmissions());

  // Un point = une ligne (un ISIN, sa derniere adjudication). Type, pays et
  // date sont conserves pour les filtres, la forme et la couleur.
  //
  // Abscisse = DUREE DE VIE MOYENNE et non maturite affichee, conformement a
  // la methodologie UMOA-Titres : une OAT amortissable rembourse son capital
  // par tranches, sa duration reelle est donc plus courte que son echeance.
  // La placer a sa maturite la decalerait vers la droite et deformerait la
  // courbe sur le segment 3-7 ans, ou se concentrent ces titres.
  const curveData = bonds
    .filter((b) => b.dvm > 0 && b.lastYield > 0)
    .map((b) => ({
      x: b.dvm,
      maturiteAffichee: b.maturity,
      y: b.lastYield * 100,
      type: b.type,
      country: b.country,
      isin: b.isin,
      amount: b.totalAmount,
      nbRounds: b.nbRounds,
      date: b.lastTradeDate,
    }));

  const availableCountries = Array.from(
    new Set(bonds.map((b) => b.country)),
  ).sort();

  // === METHODE STANDARD (Agence UMOA-Titres) ===
  //
  // Les courbes sont pre-calculees par scripts/build_umoa_yield_curves.py, qui
  // tourne apres chaque scraping des adjudications. La page ne fait plus que
  // lire le fichier : le demembrement des OAT et le balayage de tau1 sont trop
  // lourds pour etre refaits a chaque requete, et cette page est en
  // force-dynamic.
  const courbes = loadUmoaCourbesTaux();
  const standard: Record<
    string,
    {
      zc: { t: number; z: number }[];
      lisse: { x: number; y: number }[];
      table: { t: number; zc: number; lisse: number; source: string }[];
      tau1: number;
      rmse: number;
    }
  > = {};
  for (const [nomPays, courbe] of Object.entries(courbes)) {
    if (courbe.piliers.length < 4) continue;
    // Le fichier de courbes porte le nom complet du pays, alors que le reste du
    // code — et donc les groupes du graphique — raisonne en code ISO a deux
    // lettres. Sans cette conversion, standard["CI"] est introuvable et la
    // methode standard n'affiche rien, pour aucun pays.
    const pays = UMOA_COUNTRY_CODE[nomPays];
    if (!pays) continue;
    const tMin = courbe.piliers[0].t;
    const tMax = courbe.piliers[courbe.piliers.length - 1].t;
    standard[pays] = {
      zc: courbe.piliers.map((p) => ({ t: p.t, z: p.zc })),
      // 60 points entre le premier et le dernier pilier observe : la
      // fonctionnelle est continue, on ne l'extrapole pas au-dela du gisement.
      lisse: Array.from({ length: 60 }, (_, i) => {
        const t = tMin + ((tMax - tMin) * i) / 59;
        return { x: t, y: evalueCourbeUMOA(courbe, t) };
      }),
      table: courbe.piliers.map((p) => ({
        t: p.t,
        zc: p.zc,
        lisse: p.lisse,
        source: p.source,
      })),
      tau1: courbe.tau1,
      rmse: courbe.residuPb,
    };
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            <Link href="/" className="hover:text-white transition">
              Marchés
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <Link
              href="/marches/souverains-non-cotes"
              className="hover:text-white transition"
            >
              Souverains UMOA-Titres
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <span className="text-slate-200">Courbe des taux</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-white">
            Courbe des taux souverains UMOA
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            Taux d&apos;adjudication par maturité résiduelle, tous émetteurs
            souverains de la zone. Un point représente la dernière adjudication
            d&apos;une ligne.
          </p>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <SovereignYieldCurve
          curveData={curveData}
          availableCountries={availableCountries}
          standard={standard}
        />
      </main>
    </div>
  );
}

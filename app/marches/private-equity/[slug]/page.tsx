import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import PageHero from "@/components/PageHero";
import PeCompanyView from "@/components/pe/PeCompanyView";
import PremiumPaywall from "@/components/PremiumPaywall";
import { fetchUserRole } from "@/lib/auth/userRole";
import {
  getPeEntreprise,
  loadPeComptes,
  loadPeActionnaires,
  PE_BLOCS,
  PE_LIBELLES,
  PE_UNITES,
  PE_PAYS_LABEL,
  PE_PAYS_NOTE,
  PE_PAYS_SOURCE_LABEL,
  computePeSecteurStats,
  loadPePeers,
} from "@/lib/pe";
import { pageMetadata } from "@/lib/seo";

// Params asynchrones : convention Next 16.
type Params = { params: Promise<{ slug: string }> };

// Le role est lu via cookies pour la garde Premium : rendu dynamique impose.
// generateStaticParams n'aurait plus de sens ici — une page pre-rendue ne peut
// pas connaitre l'abonnement de qui la demande.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const e = getPeEntreprise(slug);
  if (!e) return pageMetadata({ title: "Entreprise introuvable — AzimutFinance", path: "/marches/private-equity" });
  return pageMetadata({
    title: `${e.nom} — comptes et actionnariat — AzimutFinance`,
    description: `États financiers de ${e.nom}${e.secteur ? ` (${e.secteur})` : ""} : chiffre d'affaires, résultat net, marges, bilan et actionnariat.`,
    path: `/marches/private-equity/${e.slug}`,
  });
}

export default async function Page({ params }: Params) {
  const { slug } = await params;
  const entreprise = getPeEntreprise(slug);
  if (!entreprise) notFound();

  const userRole = await fetchUserRole();
  const isMember = userRole !== null;
  const isPremium = userRole === "premium" || userRole === "pro";
  if (!isPremium) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <Ticker />
        <PremiumPaywall
          breadcrumb={[
            { label: "Marchés", href: "/" },
            { label: "Private equity", href: "/marches/private-equity" },
            { label: entreprise.nom },
          ]}
          title={`${entreprise.nom} — comptes détaillés`}
          description="Les états financiers des entreprises non cotées de la zone UEMOA sont réservés aux abonnés Premium : comptes de résultat, bilans, ratios, actionnariat et comparables sectoriels."
          features={[
            "Compte de résultat et bilan sur toute la profondeur publiée",
            "Ratios de marge, de rentabilité et de structure financière",
            "Positionnement face à la médiane du secteur",
            "Actionnariat détaillé et concentration du capital",
            "Entreprises comparables de taille voisine",
          ]}
          isMember={isMember}
          back={{ label: "Retour au private equity", href: "/marches/private-equity" }}
        />
      </div>
    );
  }

  const comptes = loadPeComptes(entreprise.slug);
  const actionnaires = loadPeActionnaires(entreprise.slug);

  const annees = Array.from(new Set(comptes.map((c) => c.annee))).sort(
    (a, b) => a - b,
  );

  // Indexation code -> annee -> valeur, pour que la vue lise en O(1) au lieu de
  // balayer la liste a chaque cellule.
  const valeurs: Record<string, Record<number, number>> = {};
  for (const c of comptes) {
    (valeurs[c.code] ??= {})[c.annee] = c.valeur;
  }

  const blocs = PE_BLOCS[entreprise.modele];
  const codesRatios =
    blocs.find((b) => b.titre === "Ratios financiers")?.codes ?? [];
  const stats = entreprise.secteur
    ? computePeSecteurStats(entreprise.secteur, codesRatios)
    : { secteur: "", effectif: 0, medianes: {} as Record<string, number | null> };
  const peers = loadPePeers(entreprise.slug);

  const derniereAnnee = annees.length ? annees[annees.length - 1] : null;
  const codeVedette = entreprise.modele === "banque" ? "pnb" : "ca";
  const revenu = derniereAnnee ? valeurs[codeVedette]?.[derniereAnnee] : undefined;
  const rn = derniereAnnee ? valeurs.resultat_net?.[derniereAnnee] : undefined;

  const fmtM = (v: number | undefined) =>
    v === undefined || !Number.isFinite(v)
      ? "—"
      : v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />

      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Private equity", href: "/marches/private-equity" },
          { label: entreprise.nom },
        ]}
        title={entreprise.nom}
        subtitle={
          entreprise.secteur
            ? `${entreprise.secteur} · entreprise non cotée`
            : "Entreprise non cotée"
        }
      >
        {derniereAnnee && (
          <div className="flex flex-wrap gap-6 mt-4">
            <div>
              <div className="text-2xl md:text-3xl font-semibold text-white tabular-nums">
                {fmtM(revenu)}
              </div>
              <div className="text-xs text-slate-400">
                {entreprise.modele === "banque"
                  ? "PNB"
                  : "Chiffre d'affaires"}{" "}
                {derniereAnnee} · M FCFA
              </div>
            </div>
            <div>
              <div
                className={`text-2xl md:text-3xl font-semibold tabular-nums ${
                  Number.isFinite(rn) && (rn as number) < 0
                    ? "text-rose-300"
                    : "text-white"
                }`}
              >
                {fmtM(rn)}
              </div>
              <div className="text-xs text-slate-400">
                Résultat net {derniereAnnee} · M FCFA
              </div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-semibold text-white tabular-nums">
                {annees.length}
              </div>
              <div className="text-xs text-slate-400">
                exercice{annees.length > 1 ? "s" : ""} publié
                {annees.length > 1 ? "s" : ""}
              </div>
            </div>
          </div>
        )}
      </PageHero>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <PeCompanyView
          nom={entreprise.nom}
          secteur={entreprise.secteur}
          modele={entreprise.modele}
          annees={annees}
          valeurs={valeurs}
          paysLabel={PE_PAYS_LABEL[entreprise.pays] ?? ""}
          paysNote={PE_PAYS_NOTE}
          paysSourceLabel={PE_PAYS_SOURCE_LABEL[entreprise.paysSource] ?? ""}
          blocs={blocs}
          libelles={PE_LIBELLES}
          unites={PE_UNITES}
          actionnaires={actionnaires}
          medianesSecteur={stats.medianes}
          effectifSecteur={stats.effectif}
          peers={peers}
        />
      </main>
    </div>
  );
}

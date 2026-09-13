import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import PageHero from "@/components/PageHero";
import PrivateEquityView from "@/components/pe/PrivateEquityView";
import PremiumPaywall from "@/components/PremiumPaywall";
import { fetchUserRole } from "@/lib/auth/userRole";
import {
  buildPeSynthese,
  loadPeSecteurs,
  loadPeEntreprises,
  loadPePays,
  PE_PAYS_LABEL,
  PE_PAYS_NOTE,
} from "@/lib/pe";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Private equity UEMOA — entreprises non cotées — AzimutFinance",
  description:
    "Comptes et actionnariat de plus de 1 700 entreprises non cotées de la zone UEMOA : chiffre d'affaires, résultat net, marges, rentabilité et structure de bilan.",
  path: "/marches/private-equity",
});

// Le role est lu via cookies pour la garde Premium : rendu dynamique impose.
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
        <PremiumPaywall
          breadcrumb={[
            { label: "Marchés", href: "/" },
            { label: "Private equity" },
          ]}
          title="Private equity UEMOA"
          description="Les comptes de plus de 1 700 entreprises non cotées de la zone — celles qu'aucune cote ne suit. Réservé aux abonnés Premium."
          features={[
            "1 737 entreprises, 21 secteurs, 8 pays",
            "Chiffre d'affaires, résultat net, marges et rentabilité",
            "Bilan : capitaux propres, dette nette, trésorerie",
            "Actionnariat et concentration du capital",
            "Comparables sectoriels et médianes de secteur",
          ]}
          isMember={isMember}
          back={{ label: "Retour aux marchés", href: "/marches/actions" }}
        />
      </div>
    );
  }

  const lignes = buildPeSynthese();
  const secteurs = loadPeSecteurs();
  const pays = loadPePays().map((code) => ({
    code,
    label: PE_PAYS_LABEL[code] ?? code,
  }));
  const entreprises = loadPeEntreprises();

  const avecComptes = lignes.filter((l) => l.anneeRef !== null).length;
  const banques = entreprises.filter((e) => e.modele === "banque").length;
  const dernierExercice = Math.max(
    ...lignes.map((l) => l.anneeRef ?? 0).filter((a) => a > 0),
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />

      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Marchés", href: "/marches/actions" },
          { label: "Private equity" },
        ]}
        title="Private equity UEMOA"
        subtitle={
          <>
            Les comptes des entreprises <strong>non cotées</strong> de la zone —
            celles qu&apos;aucune cote ne suit. Chiffre d&apos;affaires, marges,
            rentabilité, structure de bilan et actionnariat, à partir des états
            financiers déposés.
          </>
        }
      >
        <div className="flex flex-wrap gap-6 mt-4">
          <div>
            <div className="text-2xl md:text-3xl font-semibold text-white tabular-nums">
              {entreprises.length.toLocaleString("fr-FR")}
            </div>
            <div className="text-xs text-slate-400">entreprises</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-semibold text-white tabular-nums">
              {avecComptes.toLocaleString("fr-FR")}
            </div>
            <div className="text-xs text-slate-400">avec comptes publiés</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-semibold text-white tabular-nums">
              {secteurs.length}
            </div>
            <div className="text-xs text-slate-400">secteurs</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-semibold text-white tabular-nums">
              {banques}
            </div>
            <div className="text-xs text-slate-400">banques</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-semibold text-white tabular-nums">
              {dernierExercice}
            </div>
            <div className="text-xs text-slate-400">dernier exercice</div>
          </div>
        </div>
      </PageHero>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <PrivateEquityView lignes={lignes} secteurs={secteurs} pays={pays} />

        {/* L'unite n'est ecrite dans aucun classeur source : elle a ete etablie
            par recoupement avec les fondamentaux BRVM. Le dire ici evite qu'un
            lecteur prenne un chiffre d'affaires pour des FCFA bruts. */}
        <p className="mt-6 text-xs text-slate-500 leading-relaxed max-w-3xl">
          Tous les montants sont exprimés en <strong>millions de FCFA</strong>.
          Les données proviennent des états financiers déposés par les
          entreprises ; la profondeur d&apos;historique varie d&apos;une société
          à l&apos;autre, et {entreprises.length - avecComptes} entreprises du
          référentiel ne publient aucun exercice. Les banques présentent un
          produit net bancaire là où les sociétés présentent un chiffre
          d&apos;affaires : la colonne « CA / PNB » affiche l&apos;un ou
          l&apos;autre selon le modèle.
        </p>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed max-w-3xl">
          {PE_PAYS_NOTE}
        </p>
      </main>
    </div>
  );
}

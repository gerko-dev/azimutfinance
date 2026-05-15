import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";

export const metadata: Metadata = {
  title: "Politique de cookies — AzimutFinance",
  description:
    "Politique de cookies d'AzimutFinance : types de cookies utilisés, finalités, durée et gestion du consentement.",
};

const LAST_UPDATE = "13 mai 2026";

type CookieRow = {
  name: string;
  category: "Nécessaire" | "Fonctionnel" | "Mesure d'audience" | "Tiers";
  purpose: string;
  duration: string;
};

const COOKIES: CookieRow[] = [
  {
    name: "sb-access-token / sb-refresh-token",
    category: "Nécessaire",
    purpose:
      "Authentification Supabase. Maintient la session de l'utilisateur connecté.",
    duration: "Session + 7 jours",
  },
  {
    name: "az_consent",
    category: "Nécessaire",
    purpose:
      "Mémorise les choix de l'utilisateur concernant la bannière de consentement aux cookies.",
    duration: "6 mois",
  },
  {
    name: "az_theme / az_pref_*",
    category: "Fonctionnel",
    purpose:
      "Préférences d'affichage (mode, devises, marchés favoris, filtres sauvegardés).",
    duration: "12 mois",
  },
  {
    name: "az_audience",
    category: "Mesure d'audience",
    purpose:
      "Mesure anonyme de la fréquentation du site (pages vues, sections visitées). Aucun profil publicitaire.",
    duration: "13 mois",
  },
];

export default function CookiesPage() {
  return (
    <>
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Politique de cookies" },
        ]}
        title="Politique de cookies"
      />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <article className="bg-white border border-slate-200 rounded-lg px-6 md:px-10 py-8 md:py-12 text-slate-800 leading-relaxed">
          <p className="text-sm text-slate-500 mb-10">
            Dernière mise à jour&nbsp;: {LAST_UPDATE}
          </p>

      <Section title="1. Qu'est-ce qu'un cookie ?">
        <p>
          Un cookie est un petit fichier texte déposé sur le terminal de
          l&apos;Utilisateur (ordinateur, smartphone, tablette) lors de la
          consultation d&apos;un site web. Il permet au site de reconnaître le
          terminal, de mémoriser certaines informations relatives à la
          navigation ou de mesurer la fréquentation.
        </p>
        <p className="mt-3">
          La présente politique couvre l&apos;ensemble des traceurs utilisés
          sur AzimutFinance, qu&apos;il s&apos;agisse de cookies HTTP au sens
          strict, de stockage local (<em>localStorage</em>, <em>sessionStorage</em>)
          ou de pixels invisibles.
        </p>
      </Section>

      <Section title="2. Catégories de cookies utilisés">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Cookies strictement nécessaires&nbsp;:</strong>{" "}
            indispensables au fonctionnement du site, notamment à
            l&apos;authentification, à la sécurité et à la mémorisation du
            consentement. Ils ne peuvent pas être désactivés.
          </li>
          <li>
            <strong>Cookies fonctionnels&nbsp;:</strong> améliorent
            l&apos;expérience en mémorisant les préférences (marchés favoris,
            filtres, langue, devise).
          </li>
          <li>
            <strong>Cookies de mesure d&apos;audience&nbsp;:</strong>{" "}
            permettent de mesurer de manière agrégée la fréquentation du site
            et de comprendre les usages, sans profilage publicitaire.
          </li>
          <li>
            <strong>Cookies tiers&nbsp;:</strong> déposés par des prestataires
            (Supabase pour l&apos;authentification, prestataires de paiement
            pour la souscription Premium, intégrations vidéo éventuelles). Ils
            sont soumis à la politique de cookies de leurs émetteurs.
          </li>
        </ul>
      </Section>

      <Section title="3. Détail des cookies déposés">
        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-sm border border-slate-200 mt-2">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2 border-b border-slate-200">
                  Nom
                </th>
                <th className="text-left p-2 border-b border-slate-200">
                  Catégorie
                </th>
                <th className="text-left p-2 border-b border-slate-200">
                  Finalité
                </th>
                <th className="text-left p-2 border-b border-slate-200">
                  Durée
                </th>
              </tr>
            </thead>
            <tbody>
              {COOKIES.map((c) => (
                <tr
                  key={c.name}
                  className="border-b border-slate-100 last:border-0 align-top"
                >
                  <td className="p-2 font-mono text-[11px] md:text-xs">
                    {c.name}
                  </td>
                  <td className="p-2">{c.category}</td>
                  <td className="p-2 text-slate-600">{c.purpose}</td>
                  <td className="p-2 whitespace-nowrap text-slate-600">
                    {c.duration}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Cette liste est susceptible d&apos;évoluer en fonction des
          fonctionnalités ajoutées au site. La version en vigueur est toujours
          celle publiée sur cette page.
        </p>
      </Section>

      <Section title="4. Consentement et gestion">
        <p>
          Lors de la première visite, une bannière de consentement permet à
          l&apos;Utilisateur d&apos;accepter, de refuser ou de paramétrer le
          dépôt des cookies non strictement nécessaires. Le choix est
          mémorisé pendant 6&nbsp;mois.
        </p>
        <p className="mt-3">
          L&apos;Utilisateur peut à tout moment&nbsp;:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>
            modifier ses préférences en cliquant sur le lien «&nbsp;Gérer mes
            cookies&nbsp;» disponible en pied de page&nbsp;;
          </li>
          <li>
            supprimer les cookies déjà déposés via les paramètres de son
            navigateur&nbsp;;
          </li>
          <li>
            paramétrer son navigateur pour refuser tout ou partie des cookies
            par défaut.
          </li>
        </ul>
        <p className="mt-3">
          Liens utiles pour la gestion des cookies dans les navigateurs les
          plus courants&nbsp;:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>
            <a
              href="https://support.google.com/chrome/answer/95647"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 hover:underline"
            >
              Google Chrome
            </a>
          </li>
          <li>
            <a
              href="https://support.mozilla.org/fr/kb/protection-renforcee-contre-le-pistage-firefox-ordinateur"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 hover:underline"
            >
              Mozilla Firefox
            </a>
          </li>
          <li>
            <a
              href="https://support.apple.com/fr-fr/guide/safari/sfri11471/mac"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 hover:underline"
            >
              Apple Safari
            </a>
          </li>
          <li>
            <a
              href="https://support.microsoft.com/fr-fr/microsoft-edge"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 hover:underline"
            >
              Microsoft Edge
            </a>
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Le refus des cookies strictement nécessaires peut empêcher le bon
          fonctionnement du site (impossibilité de se connecter, perte des
          préférences, etc.).
        </p>
      </Section>

      <Section title="5. Durée de conservation">
        <p>
          La durée maximale de conservation des cookies non strictement
          nécessaires est de 13&nbsp;mois, conformément aux recommandations
          des autorités de protection des données. Au terme de cette période,
          le consentement de l&apos;Utilisateur est à nouveau sollicité.
        </p>
      </Section>

      <Section title="6. Articulation avec la Politique de confidentialité">
        <p>
          Les données collectées via les cookies peuvent constituer des données
          personnelles. Leur traitement est décrit plus largement dans notre{" "}
          <Link
            href="/legal/confidentialite"
            className="text-blue-700 hover:underline"
          >
            Politique de confidentialité
          </Link>
          , qui précise notamment les destinataires, les durées de conservation
          et les droits de l&apos;Utilisateur.
        </p>
      </Section>

      <Section title="7. Modifications">
        <p>
          La présente politique peut être amenée à évoluer en fonction des
          évolutions techniques, réglementaires ou des services proposés. La
          date de dernière mise à jour est indiquée en tête de page.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          Pour toute question relative aux cookies&nbsp;:{" "}
          <a
            href="mailto:contact@azimutfinance.com"
            className="text-blue-700 hover:underline"
          >
            contact@azimutfinance.com
          </a>
          .
        </p>
      </Section>
      </article>
    </main>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg md:text-xl font-semibold text-slate-900 mb-3">
        {title}
      </h2>
      <div className="text-sm md:text-[15px] text-slate-700 space-y-1">
        {children}
      </div>
    </section>
  );
}

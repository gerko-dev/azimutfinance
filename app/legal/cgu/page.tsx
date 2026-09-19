import Link from "next/link";
import PageHero from "@/components/PageHero";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Conditions Générales d'Utilisation — AzimutFinance",
  description:
    "Conditions Générales d'Utilisation du site AzimutFinance : compte, services, contenus Premium, responsabilité.",
  path: "/legal/cgu",
});

const LAST_UPDATE = "17 mai 2026";

export default function CGUPage() {
  return (
    <>
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Conditions Générales d'Utilisation" },
        ]}
        title="Conditions Générales d'Utilisation"
      />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <article className="bg-white border border-slate-200 rounded-lg px-6 md:px-10 py-8 md:py-12 text-slate-800 leading-relaxed">
          <p className="text-sm text-slate-500 mb-10">
            Dernière mise à jour&nbsp;: {LAST_UPDATE}
          </p>

      <Section title="1. Objet">
        <p>
          Les présentes Conditions Générales d&apos;Utilisation (ci-après
          «&nbsp;CGU&nbsp;») régissent l&apos;accès et l&apos;utilisation du
          site <strong>AzimutFinance</strong>, accessible à l&apos;adresse{" "}
          <a
            href="https://azimutfinance.com"
            className="text-blue-700 hover:underline"
          >
            azimutfinance.com
          </a>
          , ainsi que de l&apos;ensemble des services proposés (consultation
          des données de marché, outils d&apos;analyse, formations, magazine,
          communauté, espace Premium et espace Pros).
        </p>
        <p className="mt-3">
          Toute utilisation du site implique l&apos;acceptation pleine et
          entière des présentes CGU. Si l&apos;Utilisateur n&apos;accepte pas
          ces conditions, il doit cesser d&apos;utiliser le site.
        </p>
      </Section>

      <Section title="2. Définitions">
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>Site&nbsp;:</strong> le portail AzimutFinance et
            l&apos;ensemble de ses pages et sous-domaines.
          </li>
          <li>
            <strong>Éditeur&nbsp;:</strong> la personne identifiée dans les{" "}
            <Link
              href="/legal/mentions"
              className="text-blue-700 hover:underline"
            >
              mentions légales
            </Link>
            .
          </li>
          <li>
            <strong>Utilisateur&nbsp;:</strong> toute personne accédant au site,
            qu&apos;elle dispose ou non d&apos;un compte.
          </li>
          <li>
            <strong>Membre&nbsp;:</strong> Utilisateur disposant d&apos;un
            compte enregistré.
          </li>
          <li>
            <strong>Premium&nbsp;:</strong> Membre ayant souscrit à un abonnement
            payant ouvrant l&apos;accès à des fonctionnalités étendues.
          </li>
          <li>
            <strong>Contenus&nbsp;:</strong> ensemble des textes, données,
            graphiques, analyses, simulations, formations, messages et
            contributions disponibles sur le site.
          </li>
        </ul>
      </Section>

      <Section title="3. Accès au site">
        <p>
          Le site est accessible gratuitement, en tout lieu, à tout Utilisateur
          disposant d&apos;un accès Internet. Les frais d&apos;équipement et de
          connexion nécessaires à l&apos;accès au site sont à la charge
          exclusive de l&apos;Utilisateur.
        </p>
        <p className="mt-3">
          L&apos;Éditeur met en œuvre les moyens raisonnables pour assurer la
          disponibilité du site, sans pour autant être tenu à une obligation
          d&apos;y parvenir. Il pourra suspendre l&apos;accès à tout ou partie
          du site pour des raisons techniques, de maintenance, de mise à jour,
          de sécurité ou pour toute autre raison, sans préavis ni indemnité.
        </p>
      </Section>

      <Section title="4. Création de compte">
        <p>
          Certaines fonctionnalités du site (commentaires, alertes,
          portefeuille, messagerie, formations, espace Premium, espace Pros)
          nécessitent la création d&apos;un compte.
        </p>
        <p className="mt-3">L&apos;Utilisateur s&apos;engage à&nbsp;:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>
            fournir des informations exactes, à jour et complètes lors de la
            création du compte&nbsp;;
          </li>
          <li>
            conserver la confidentialité de son mot de passe et ne pas le
            communiquer à des tiers&nbsp;;
          </li>
          <li>
            informer sans délai l&apos;Éditeur de toute utilisation non
            autorisée de son compte.
          </li>
        </ul>
        <p className="mt-3">
          Le compte est strictement personnel. La création de comptes multiples
          ou le partage d&apos;un même compte entre plusieurs personnes est
          interdit.
        </p>
      </Section>

      <Section title="5. Abonnements Premium et paiement">
        <p>
          Le site propose des abonnements Premium ouvrant l&apos;accès à des
          contenus et outils supplémentaires. Les prix, durées et modalités de
          chaque offre sont précisés sur la page{" "}
          <Link href="/premium" className="text-blue-700 hover:underline">
            /premium
          </Link>{" "}
          au moment de la souscription.
        </p>
        <p className="mt-3">
          Le paiement s&apos;effectue via les prestataires de paiement
          référencés. L&apos;abonnement prend effet dès confirmation du
          paiement.
        </p>
        <p className="mt-3">
          Conformément à la nature numérique du service, immédiatement
          accessible à compter de la confirmation de paiement, l&apos;Utilisateur
          reconnaît renoncer expressément à tout droit de rétractation sur les
          contenus déjà consommés. En cas de dysfonctionnement imputable à
          l&apos;Éditeur, l&apos;Utilisateur peut demander un remboursement en
          écrivant à{" "}
          <a
            href="mailto:contact@azimutfinance.com"
            className="text-blue-700 hover:underline"
          >
            contact@azimutfinance.com
          </a>
          .
        </p>
        <p className="mt-3">
          Le non-paiement ou l&apos;échec du renouvellement entraîne la
          suspension automatique des fonctionnalités Premium.
        </p>
      </Section>

      <Section title="6. Contenus publiés par l'Utilisateur">
        <p>
          Le site permet aux Membres de publier des commentaires, des messages
          dans la communauté ou la messagerie, et d&apos;échanger entre eux.
          Le Membre est seul responsable des contenus qu&apos;il publie.
        </p>
        <p className="mt-3">Il s&apos;engage notamment à ne pas publier&nbsp;:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>
            de contenus illicites, diffamatoires, injurieux, racistes,
            xénophobes, sexistes, homophobes ou incitant à la haine&nbsp;;
          </li>
          <li>
            de contenus portant atteinte aux droits de tiers (droit
            d&apos;auteur, droit à l&apos;image, vie privée, etc.)&nbsp;;
          </li>
          <li>
            de recommandations d&apos;investissement personnalisées en
            l&apos;absence d&apos;agrément délivré par une autorité
            compétente&nbsp;;
          </li>
          <li>
            d&apos;informations privilégiées au sens de la réglementation
            boursière&nbsp;;
          </li>
          <li>
            de contenus à caractère publicitaire ou promotionnel non
            autorisés&nbsp;;
          </li>
          <li>de spam, contenus automatisés ou manipulations de marché.</li>
        </ul>
        <p className="mt-3">
          En publiant un contenu, le Membre concède à l&apos;Éditeur, à titre
          gracieux, un droit non exclusif de reproduction, de représentation et
          d&apos;adaptation aux fins d&apos;exploitation du site, pour la durée
          de protection légale des droits.
        </p>
        <p className="mt-3">
          L&apos;Éditeur se réserve le droit de modérer, supprimer ou masquer
          tout contenu non conforme aux présentes CGU, et de suspendre ou
          fermer le compte concerné, sans préavis ni indemnité.
        </p>
      </Section>

      <Section title="7. Modération et sanctions">
        <p>
          En cas de manquement aux présentes CGU, l&apos;Éditeur peut, selon la
          gravité du manquement&nbsp;:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>adresser un avertissement au Membre&nbsp;;</li>
          <li>supprimer le contenu litigieux&nbsp;;</li>
          <li>
            suspendre temporairement le compte (impossibilité d&apos;accéder au
            site au-delà de la page de suspension)&nbsp;;
          </li>
          <li>bannir définitivement le compte.</li>
        </ul>
        <p className="mt-3">
          Le Membre peut contester une sanction en écrivant à{" "}
          <a
            href="mailto:contact@azimutfinance.com"
            className="text-blue-700 hover:underline"
          >
            contact@azimutfinance.com
          </a>
          .
        </p>
      </Section>

      <Section title="8. Avertissement financier">
        <p>
          Les informations, données, analyses, outils, simulations et contenus
          de formation publiés sur AzimutFinance sont fournis à titre{" "}
          <strong>informatif et pédagogique</strong>. Ils ne constituent ni un
          conseil en investissement, ni une recommandation personnalisée, ni
          une offre, ni une sollicitation d&apos;achat ou de vente d&apos;un
          instrument financier.
        </p>
        <p className="mt-3">
          Investir comporte un risque de perte en capital. Les performances
          passées ne préjugent pas des performances futures. Avant toute
          décision d&apos;investissement, l&apos;Utilisateur s&apos;engage à
          consulter un conseiller agréé et à apprécier l&apos;adéquation de la
          décision à sa situation financière, ses objectifs et son horizon
          d&apos;investissement.
        </p>
      </Section>

      <Section title="9. Propriété intellectuelle">
        <p>
          L&apos;ensemble des éléments composant le site (code, identité
          visuelle, contenus rédactionnels, bases de données structurées,
          simulateurs, graphiques produits par AzimutFinance) est protégé par
          le droit d&apos;auteur et constitue la propriété de l&apos;Éditeur,
          sauf mention contraire. Toute reproduction sans autorisation écrite
          est interdite.
        </p>
      </Section>

      <Section title="10. Extraction automatisée et entraînement d'IA">
        <p>
          Sont expressément <strong>interdits</strong> sans autorisation écrite
          préalable de l&apos;Éditeur&nbsp;:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>
            l&apos;extraction massive, le <em>scraping</em> ou la copie
            systématique de tout ou partie des Contenus, par moyen automatisé
            ou non&nbsp;;
          </li>
          <li>
            l&apos;utilisation des Contenus pour entraîner, valider ou évaluer
            tout modèle d&apos;intelligence artificielle, modèle de langage,
            modèle prédictif ou système d&apos;apprentissage automatique&nbsp;;
          </li>
          <li>
            la constitution d&apos;une base de données dérivée à des fins
            commerciales ou de redistribution&nbsp;;
          </li>
          <li>
            le contournement des mesures techniques de protection mises en
            place (<em>robots.txt</em>, en-têtes <em>X-Robots-Tag</em>,
            blocage par <em>User-Agent</em>, etc.).
          </li>
        </ul>
        <p className="mt-3">
          L&apos;Éditeur se réserve le droit de bloquer toute adresse IP, tout
          réseau ou tout agent utilisateur identifié comme procédant à des
          collectes automatisées, et d&apos;engager toute action légale en
          réparation du préjudice subi.
        </p>
      </Section>

      <Section title="11. Téléchargement des données">
        <p>
          Certaines pages permettent aux Membres de télécharger des fichiers
          (CSV, PDF) reprenant des données de marché présentées sur le site
          (historiques de cours d&apos;actions, d&apos;indices, fiches
          fondamentales, états financiers…).
        </p>
        <p className="mt-3">
          Ces fichiers sont fournis pour un <strong>usage personnel,
          d&apos;analyse interne ou pédagogique</strong>. Toute redistribution,
          republication, revente, intégration dans un produit commercial ou
          incorporation dans un jeu de données diffusé publiquement est
          interdite sans accord écrit préalable de l&apos;Éditeur.
        </p>
        <p className="mt-3">
          Les sources primaires des données (BRVM, UMOA-Titres, BCEAO,
          publications financières SYSCOHADA des sociétés cotées, etc.)
          conservent leur propre régime de propriété et de réutilisation, qu&apos;il
          appartient à l&apos;Utilisateur de respecter au-delà des présentes CGU.
        </p>
      </Section>

      <Section title="12. Responsabilité">
        <p>
          L&apos;Éditeur s&apos;efforce d&apos;assurer l&apos;exactitude et la
          mise à jour des informations diffusées sur le site, sans garantir
          leur exhaustivité, leur exactitude, leur actualité ni leur
          disponibilité.
        </p>
        <p className="mt-3">
          L&apos;Éditeur ne saurait être tenu responsable&nbsp;:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>
            des erreurs, omissions ou retards dans les données publiées&nbsp;;
          </li>
          <li>
            des décisions d&apos;investissement prises par l&apos;Utilisateur
            sur la base des informations du site&nbsp;;
          </li>
          <li>
            des interruptions, indisponibilités, dysfonctionnements techniques
            ou pertes de données&nbsp;;
          </li>
          <li>
            des dommages directs ou indirects résultant de l&apos;utilisation
            du site ou de l&apos;impossibilité d&apos;y accéder.
          </li>
        </ul>
        <p className="mt-3">
          En particulier, les <strong>cours cibles, anticipations,
          projections</strong> et tout résultat produit par les outils
          d&apos;analyse (notamment l&apos;onglet «&nbsp;Anticipation&nbsp;» sur
          les fiches action, les simulateurs d&apos;obligations, les
          classifications «&nbsp;Cash cow / Hidden gem&nbsp;») sont des
          indicateurs <strong>purement informatifs</strong>, basés sur des
          hypothèses méthodologiques publiques pouvant être contestées,
          incomplètes ou rapidement obsolètes. Ils ne sauraient se substituer à
          l&apos;analyse personnelle de l&apos;Utilisateur ni à un conseil
          professionnel agréé.
        </p>
      </Section>

      <Section title="13. Données personnelles">
        <p>
          Le traitement des données personnelles est détaillé dans la{" "}
          <Link
            href="/legal/confidentialite"
            className="text-blue-700 hover:underline"
          >
            Politique de confidentialité
          </Link>
          . L&apos;utilisation des cookies est précisée dans la{" "}
          <Link
            href="/legal/cookies"
            className="text-blue-700 hover:underline"
          >
            Politique de cookies
          </Link>
          .
        </p>
      </Section>

      <Section title="14. Évolution des CGU">
        <p>
          L&apos;Éditeur se réserve le droit de modifier les présentes CGU à
          tout moment. Les modifications entrent en vigueur dès leur
          publication sur le site. Il appartient à l&apos;Utilisateur de
          consulter régulièrement la version en vigueur. La poursuite de
          l&apos;utilisation du site après modification vaut acceptation des
          nouvelles CGU.
        </p>
      </Section>

      <Section title="15. Droit applicable et juridiction">
        <p>
          Les présentes CGU sont régies par le droit ivoirien. Tout litige
          relatif à leur interprétation ou à leur exécution relèvera de la
          compétence exclusive des tribunaux d&apos;Abidjan, Côte
          d&apos;Ivoire, à défaut de résolution amiable préalable.
        </p>
      </Section>

      <Section title="16. Contact">
        <p>
          Pour toute question relative aux présentes CGU&nbsp;:{" "}
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

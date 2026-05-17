import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";

export const metadata: Metadata = {
  title: "Mentions légales — AzimutFinance",
  description:
    "Mentions légales du site AzimutFinance : éditeur, hébergeur, propriété intellectuelle et contact.",
};

const LAST_UPDATE = "17 mai 2026";

export default function MentionsLegalesPage() {
  return (
    <>
      <PageHero
        breadcrumb={[{ label: "Accueil", href: "/" }, { label: "Mentions légales" }]}
        title="Mentions légales"
      />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <article className="bg-white border border-slate-200 rounded-lg px-6 md:px-10 py-8 md:py-12 text-slate-800 leading-relaxed">
          <p className="text-sm text-slate-500 mb-10">
            Dernière mise à jour&nbsp;: {LAST_UPDATE}
          </p>

      <Section title="1. Éditeur du site">
        <p>
          Le site <strong>AzimutFinance</strong>, accessible à l&apos;adresse{" "}
          <a
            href="https://azimutfinance.com"
            className="text-blue-700 hover:underline"
          >
            azimutfinance.com
          </a>
          , est édité à titre individuel par&nbsp;:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>
            <strong>Éditeur&nbsp;:</strong> KOUAME N&apos;Guessan Brou Germain
          </li>
          <li>
            <strong>Statut&nbsp;:</strong> Entreprise individuelle / projet
            personnel
          </li>
          <li>
            <strong>Adresse&nbsp;:</strong> 23 BP 3684 Abidjan 23, Côte
            d&apos;Ivoire
          </li>
          <li>
            <strong>Email&nbsp;:</strong>{" "}
            <a
              href="mailto:contact@azimutfinance.com"
              className="text-blue-700 hover:underline"
            >
              contact@azimutfinance.com
            </a>
          </li>
          <li>
            <strong>Directeur de la publication&nbsp;:</strong> KOUAME
            N&apos;Guessan Brou Germain
          </li>
        </ul>
      </Section>

      <Section title="2. Hébergement">
        <p>Le site est hébergé par&nbsp;:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>
            <strong>Vercel Inc.</strong>
          </li>
          <li>440 N Barranca Ave #4133, Covina, CA 91723, États-Unis</li>
          <li>
            Site web&nbsp;:{" "}
            <a
              href="https://vercel.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 hover:underline"
            >
              vercel.com
            </a>
          </li>
        </ul>
      </Section>

      <Section title="3. Propriété intellectuelle">
        <p>
          L&apos;ensemble des contenus présents sur AzimutFinance (textes,
          analyses, graphiques, logos, code source, mise en page, identité
          visuelle) est protégé par le droit d&apos;auteur et constitue la
          propriété exclusive de l&apos;éditeur, sauf mention contraire
          explicite (sources tierces, données publiques de la BRVM, UMOA-Titres,
          BCEAO, etc.).
        </p>
        <p className="mt-3">
          Toute reproduction, représentation, modification, publication ou
          adaptation, totale ou partielle, des éléments du site, quel que soit
          le moyen ou le procédé utilisé, est interdite sans autorisation
          écrite préalable de l&apos;éditeur.
        </p>
        <p className="mt-3">
          Les marques, noms commerciaux et logos cités sur le site appartiennent
          à leurs détenteurs respectifs.
        </p>
      </Section>

      <Section title="4. Sources des données">
        <p>
          Les données de marché publiées sur AzimutFinance proviennent de
          sources publiques&nbsp;: Bourse Régionale des Valeurs Mobilières
          (BRVM), Dépositaire Central / Banque de Règlement (DC/BR),
          UMOA-Titres, Banque Centrale des États de l&apos;Afrique de
          l&apos;Ouest (BCEAO), Instituts nationaux de statistique des États
          membres de l&apos;UEMOA, et autres sources institutionnelles.
        </p>
        <p className="mt-3">
          Bien que l&apos;éditeur s&apos;efforce de vérifier la qualité et
          l&apos;actualité des informations diffusées, aucune garantie
          d&apos;exactitude, d&apos;exhaustivité ou de disponibilité ne peut
          être accordée.
        </p>
      </Section>

      <Section title="5. Avertissement sur les contenus financiers">
        <p>
          Les informations, analyses, simulations et outils proposés sur
          AzimutFinance sont diffusés à titre <strong>informatif et
          pédagogique</strong> uniquement. Ils ne constituent en aucun cas un
          conseil en investissement, une recommandation personnalisée, une
          offre, une sollicitation ou une incitation à acheter, vendre ou
          souscrire à un quelconque instrument financier.
        </p>
        <p className="mt-3">
          Investir sur les marchés financiers comporte un risque de perte en
          capital. Les performances passées ne préjugent pas des performances
          futures. Avant toute décision d&apos;investissement, l&apos;utilisateur
          est invité à consulter un conseiller en investissement agréé par
          l&apos;Autorité des Marchés Financiers de l&apos;UMOA (AMF-UMOA).
        </p>
      </Section>

      <Section title="6. Liens hypertextes">
        <p>
          Le site peut contenir des liens vers des sites tiers. L&apos;éditeur
          n&apos;exerce aucun contrôle sur le contenu de ces sites et décline
          toute responsabilité quant aux informations qui y sont publiées et à
          leur utilisation.
        </p>
      </Section>

      <Section title="7. Données personnelles et cookies">
        <p>
          Le traitement des données personnelles fait l&apos;objet d&apos;une
          politique dédiée. Pour en savoir plus, consulter notre{" "}
          <Link
            href="/legal/confidentialite"
            className="text-blue-700 hover:underline"
          >
            Politique de confidentialité
          </Link>{" "}
          et notre{" "}
          <Link
            href="/legal/cookies"
            className="text-blue-700 hover:underline"
          >
            Politique de cookies
          </Link>
          .
        </p>
      </Section>

      <Section title="8. Droit applicable">
        <p>
          Les présentes mentions légales sont régies par le droit ivoirien.
          Tout litige relatif à l&apos;utilisation du site relèvera de la
          compétence exclusive des tribunaux d&apos;Abidjan, Côte d&apos;Ivoire.
        </p>
      </Section>

      <Section title="9. Contact">
        <p>
          Pour toute question relative aux présentes mentions légales ou au
          fonctionnement du site, vous pouvez écrire à&nbsp;:{" "}
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

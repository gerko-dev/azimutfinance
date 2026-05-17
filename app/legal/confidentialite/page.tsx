import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";

export const metadata: Metadata = {
  title: "Politique de confidentialité — AzimutFinance",
  description:
    "Politique de confidentialité d'AzimutFinance : données collectées, finalités, base légale, durée de conservation et droits des utilisateurs.",
};

const LAST_UPDATE = "17 mai 2026";

export default function ConfidentialitePage() {
  return (
    <>
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Politique de confidentialité" },
        ]}
        title="Politique de confidentialité"
      />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <article className="bg-white border border-slate-200 rounded-lg px-6 md:px-10 py-8 md:py-12 text-slate-800 leading-relaxed">
          <p className="text-sm text-slate-500 mb-10">
            Dernière mise à jour&nbsp;: {LAST_UPDATE}
          </p>

      <Section title="1. Préambule">
        <p>
          La présente Politique de confidentialité décrit la manière dont
          <strong> AzimutFinance</strong> (ci-après «&nbsp;l&apos;Éditeur&nbsp;»)
          collecte, utilise, partage et protège les données personnelles des
          utilisateurs de son site{" "}
          <a
            href="https://azimutfinance.com"
            className="text-blue-700 hover:underline"
          >
            azimutfinance.com
          </a>
          .
        </p>
        <p className="mt-3">
          Elle s&apos;applique dans le respect du droit ivoirien — en
          particulier de la loi n°&nbsp;2013-450 du 19&nbsp;juin 2013 relative
          à la protection des données à caractère personnel — et, lorsque le
          Règlement européen sur la protection des données (RGPD) est
          applicable (utilisateurs situés dans l&apos;Union européenne), des
          dispositions de ce dernier.
        </p>
      </Section>

      <Section title="2. Responsable du traitement">
        <p>
          Le responsable du traitement est l&apos;éditeur du site, identifié
          dans les{" "}
          <Link
            href="/legal/mentions"
            className="text-blue-700 hover:underline"
          >
            mentions légales
          </Link>
          . Pour toute question relative à vos données&nbsp;:{" "}
          <a
            href="mailto:contact@azimutfinance.com"
            className="text-blue-700 hover:underline"
          >
            contact@azimutfinance.com
          </a>
          .
        </p>
      </Section>

      <Section title="3. Données collectées">
        <p>L&apos;Éditeur collecte les catégories de données suivantes&nbsp;:</p>
        <ul className="list-disc pl-6 mt-2 space-y-2">
          <li>
            <strong>Données d&apos;identification du compte&nbsp;:</strong>{" "}
            adresse email, mot de passe (stocké sous forme hachée), nom et
            prénom, photo de profil, pseudonyme.
          </li>
          <li>
            <strong>Données de profil&nbsp;:</strong> pays, profil
            d&apos;investisseur, préférences de marchés et d&apos;alertes,
            informations renseignées dans l&apos;onboarding et la page compte.
          </li>
          <li>
            <strong>Données d&apos;activité&nbsp;:</strong> pages visitées,
            recherches effectuées, alertes configurées, simulations sauvegardées,
            commentaires et messages publiés, présence dans la communauté,
            historique de formations suivies.
          </li>
          <li>
            <strong>Données de paiement&nbsp;:</strong> historique des
            abonnements Premium, dates de souscription et d&apos;échéance,
            mode de règlement. Les données bancaires (numéro de carte, code de
            sécurité) ne transitent pas par nos serveurs et sont gérées
            directement par les prestataires de paiement.
          </li>
          <li>
            <strong>Données techniques&nbsp;:</strong> adresse IP, type de
            navigateur, système d&apos;exploitation, résolution d&apos;écran,
            pages d&apos;entrée et de sortie, horodatage des requêtes, cookies
            (voir notre{" "}
            <Link
              href="/legal/cookies"
              className="text-blue-700 hover:underline"
            >
              Politique de cookies
            </Link>
            ).
          </li>
          <li>
            <strong>Communications&nbsp;:</strong> contenu des messages
            adressés au support, demandes de modération, contributions
            communautaires.
          </li>
        </ul>
      </Section>

      <Section title="4. Finalités et bases légales">
        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-sm border border-slate-200 mt-2">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2 border-b border-slate-200">
                  Finalité
                </th>
                <th className="text-left p-2 border-b border-slate-200">
                  Base légale
                </th>
              </tr>
            </thead>
            <tbody>
              <Row
                purpose="Création et gestion du compte"
                basis="Exécution du contrat (CGU)"
              />
              <Row
                purpose="Fourniture des services (consultation, outils, alertes, portefeuille, messagerie)"
                basis="Exécution du contrat"
              />
              <Row
                purpose="Gestion des abonnements Premium et facturation"
                basis="Exécution du contrat / obligation légale comptable"
              />
              <Row
                purpose="Modération de la communauté et des contenus"
                basis="Intérêt légitime à maintenir un environnement sain"
              />
              <Row
                purpose="Envoi de la newsletter et communications marketing"
                basis="Consentement"
              />
              <Row
                purpose="Amélioration du site, mesure d'audience et statistiques"
                basis="Intérêt légitime / Consentement pour les cookies non nécessaires"
              />
              <Row
                purpose="Sécurité du site, prévention de la fraude et des abus"
                basis="Intérêt légitime"
              />
              <Row
                purpose="Respect d'obligations légales (lutte anti-blanchiment, réponses aux autorités)"
                basis="Obligation légale"
              />
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="5. Destinataires des données">
        <p>
          Les données personnelles sont destinées à l&apos;Éditeur et à ses
          sous-traitants techniques, dans la stricte mesure nécessaire à
          l&apos;exécution des services&nbsp;:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>
            <strong>Vercel Inc.</strong> — hébergement du site (États-Unis).
          </li>
          <li>
            <strong>Supabase</strong> — base de données, authentification et
            stockage (hébergement régional configuré pour minimiser les
            transferts).
          </li>
          <li>
            <strong>Resend</strong> — envoi des emails transactionnels
            (confirmation, réinitialisation de mot de passe, notifications) et
            de la newsletter.
          </li>
          <li>
            <strong>Prestataires de paiement</strong> — encaissement des
            abonnements Premium.
          </li>
        </ul>
        <p className="mt-3">
          Aucune donnée n&apos;est cédée, louée ou vendue à des tiers à des
          fins commerciales.
        </p>
      </Section>

      <Section title="6. Transferts hors UEMOA / hors UE">
        <p>
          Certains sous-traitants (Vercel, Resend) hébergent les données aux
          États-Unis. Ces transferts s&apos;appuient sur les garanties
          contractuelles et les certifications proposées par ces prestataires
          (Clauses Contractuelles Types, Data Privacy Framework lorsque
          applicable).
        </p>
      </Section>

      <Section title="7. Durée de conservation">
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>Compte actif&nbsp;:</strong> pendant toute la durée
            d&apos;utilisation du service.
          </li>
          <li>
            <strong>Compte inactif&nbsp;:</strong> les comptes inactifs depuis
            plus de 36&nbsp;mois peuvent être anonymisés ou supprimés après
            information préalable de l&apos;Utilisateur.
          </li>
          <li>
            <strong>Données de facturation&nbsp;:</strong> 10&nbsp;ans, en
            application des obligations comptables et fiscales.
          </li>
          <li>
            <strong>Logs techniques et de sécurité&nbsp;:</strong> 12&nbsp;mois
            maximum.
          </li>
          <li>
            <strong>Cookies non nécessaires&nbsp;:</strong> 13&nbsp;mois
            maximum (voir{" "}
            <Link
              href="/legal/cookies"
              className="text-blue-700 hover:underline"
            >
              Politique de cookies
            </Link>
            ).
          </li>
          <li>
            <strong>Communications avec le support&nbsp;:</strong> 3&nbsp;ans à
            compter du dernier échange.
          </li>
        </ul>
      </Section>

      <Section title="8. Vos droits">
        <p>
          Conformément à la réglementation applicable, l&apos;Utilisateur
          dispose des droits suivants sur ses données&nbsp;:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>droit d&apos;accès et de copie&nbsp;;</li>
          <li>droit de rectification des données inexactes&nbsp;;</li>
          <li>
            droit à l&apos;effacement («&nbsp;droit à l&apos;oubli&nbsp;»)
            lorsque les conditions sont réunies&nbsp;;
          </li>
          <li>droit à la limitation du traitement&nbsp;;</li>
          <li>droit à la portabilité&nbsp;;</li>
          <li>
            droit d&apos;opposition au traitement fondé sur l&apos;intérêt
            légitime ou la prospection&nbsp;;
          </li>
          <li>
            droit de retirer son consentement à tout moment pour les
            traitements fondés sur celui-ci&nbsp;;
          </li>
          <li>
            droit de définir des directives relatives au sort de ses données
            après son décès.
          </li>
        </ul>
        <p className="mt-3">
          Ces droits peuvent être exercés en écrivant à{" "}
          <a
            href="mailto:contact@azimutfinance.com"
            className="text-blue-700 hover:underline"
          >
            contact@azimutfinance.com
          </a>
          , en justifiant de son identité. L&apos;Éditeur répond dans un délai
          maximum d&apos;un mois.
        </p>
        <p className="mt-3">
          L&apos;Utilisateur dispose également du droit d&apos;introduire une
          réclamation auprès de l&apos;Autorité de Régulation des
          Télécommunications de Côte d&apos;Ivoire (ARTCI), autorité de
          contrôle compétente, ou auprès de l&apos;autorité de protection des
          données de son pays de résidence.
        </p>
      </Section>

      <Section title="9. Sécurité">
        <p>
          L&apos;Éditeur met en œuvre des mesures techniques et
          organisationnelles raisonnables pour protéger les données contre la
          perte, l&apos;accès non autorisé, la divulgation, l&apos;altération
          ou la destruction (chiffrement TLS en transit, hachage des mots de
          passe, séparation des environnements, contrôle des accès
          administrateurs, journalisation des actions sensibles).
        </p>
        <p className="mt-3">
          Aucune méthode de transmission ou de stockage électronique ne pouvant
          être garantie totalement sûre, l&apos;Éditeur ne peut s&apos;engager
          sur une sécurité absolue.
        </p>
      </Section>

      <Section title="10. Mineurs">
        <p>
          Le site n&apos;est pas destiné aux mineurs de moins de 16&nbsp;ans.
          L&apos;Éditeur ne collecte pas sciemment de données relatives aux
          mineurs. Si un parent ou tuteur constate qu&apos;un enfant a fourni
          des données, il est invité à contacter l&apos;Éditeur pour
          suppression.
        </p>
      </Section>

      <Section title="11. Modifications">
        <p>
          La présente politique peut être amenée à évoluer. La date de
          dernière mise à jour est indiquée en tête de la page. En cas de
          modification substantielle, l&apos;Utilisateur en sera informé par
          email ou par une notification sur le site.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          Pour toute question relative à la présente politique ou à vos
          données personnelles&nbsp;:{" "}
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

function Row({ purpose, basis }: { purpose: string; basis: string }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="p-2 align-top">{purpose}</td>
      <td className="p-2 align-top text-slate-600">{basis}</td>
    </tr>
  );
}

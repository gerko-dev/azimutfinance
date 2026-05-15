import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * robots.txt genere par Next.
 *
 * On laisse les crawlers parcourir tout le contenu public (marches, macro,
 * outils, academie, actualites, communaute) mais on exclut :
 *  - l'administration et les routes techniques (/admin, /api) ;
 *  - les parcours d'authentification et de compte (aucune valeur SEO,
 *    contenu personnalise ou protege) ;
 *  - les espaces personnels (messagerie, suivi de compte-titre).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/auth/",
          "/connexion",
          "/inscription",
          "/mot-de-passe-oublie",
          "/nouveau-mot-de-passe",
          "/bienvenue",
          "/suspendu",
          "/compte",
          "/messagerie",
          "/academie/compte-titre/",
          "/premium/paiement",
          "/communaute/newsletter/desinscrire",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

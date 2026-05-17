import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Bots d'entrainement IA + scrapers SEO/marketing connus : interdiction
// totale. Ces UA sont egalement bloques au niveau proxy.ts (defense en
// couches). Cf. https://platform.openai.com/docs/bots, etc.
const BLOCKED_AI_BOTS = [
  // OpenAI
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  // Anthropic
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  // Google IA (separe de Googlebot qui reste autorise)
  "Google-Extended",
  // Common Crawl (corpus IA grand public)
  "CCBot",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Autres
  "cohere-ai",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "FacebookBot",
  "Meta-ExternalAgent",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "Webzio-Extended",
  "YouBot",
  "Timpibot",
  "VelenPublicWebCrawler",
  "DataForSeoBot",
  "AwarioRssBot",
  "AwarioSmartBot",
  // SEO crawlers intrusifs
  "SemrushBot",
  "AhrefsBot",
  "MJ12bot",
  "DotBot",
  "PetalBot",
  "ZoominfoBot",
  "serpstatbot",
];

/**
 * robots.txt genere par Next.
 *
 * Politique :
 *  - Moteurs et previews sociaux : acces complet aux pages publiques,
 *    interdiction des routes admin / auth / compte.
 *  - Bots IA d'entrainement + scrapers SEO intrusifs : interdiction
 *    totale (Disallow: /).
 */
export default function robots(): MetadataRoute.Robots {
  const standardDisallow = [
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
  ];

  return {
    rules: [
      // Politique par defaut pour les moteurs et previews
      {
        userAgent: "*",
        allow: "/",
        disallow: standardDisallow,
      },
      // Politique stricte pour bots IA et scrapers connus
      ...BLOCKED_AI_BOTS.map((ua) => ({
        userAgent: ua,
        disallow: "/",
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

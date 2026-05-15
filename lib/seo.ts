// === Helpers SEO centralises ===
//
// Une seule source de verite pour le domaine de production, les metadonnees
// par defaut et les donnees structurees (JSON-LD).

import type { Metadata } from "next";

/** Domaine de production (cf. memoire projet). Sans slash final. */
export const SITE_URL = "https://azimutfinance.com";
export const SITE_NAME = "AzimutFinance";

export const SITE_DESCRIPTION =
  "Portail des marchés financiers de l'UEMOA : cours des actions BRVM, " +
  "obligations cotées, souverains UMOA-Titres, FCP/OPCVM, macroéconomie de " +
  "la zone CFA, outils d'analyse et formation à l'investissement.";

/** Construit une URL absolue a partir d'un chemin commencant par "/". */
export function absoluteUrl(path: string): string {
  if (!path || path === "/") return SITE_URL;
  return SITE_URL + (path.startsWith("/") ? path : `/${path}`);
}

/**
 * Construit l'objet `Metadata` d'une page publique : titre, description, URL
 * canonique absolue et cartes Open Graph / Twitter coherentes. A utiliser dans
 * `export const metadata` ou `generateMetadata` des pages indexables.
 *
 * `path` doit commencer par "/" (ex. "/marches/actions").
 */
export function pageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path,
  type = "website",
}: {
  title: string;
  description?: string;
  path: string;
  type?: "website" | "article";
}): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "fr_FR",
      type,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/**
 * Donnees structurees Organization (schema.org), injectees une seule fois dans
 * le layout racine. Aide Google a constituer le "knowledge panel" de la marque.
 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    description: SITE_DESCRIPTION,
    founder: {
      "@type": "Person",
      name: "KOUAME N'Guessan Brou Germain",
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: "23 BP 3684",
      addressLocality: "Abidjan",
      addressCountry: "CI",
    },
    // Zone UEMOA desservie par le portail.
    areaServed: ["CI", "SN", "BJ", "BF", "ML", "NE", "TG", "GW"],
  };
}

/**
 * Donnees structurees WebSite — declare le nom du site et active le
 * "sitelinks search box" potentiel.
 */
export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "fr-FR",
    description: SITE_DESCRIPTION,
  };
}

/**
 * Donnees structurees BreadcrumbList — c'est le balisage le mieux exploite par
 * Google (fil d'Ariane affiche directement dans les resultats). A injecter sur
 * les pages profondes (fiches titre / obligation, glossaire...).
 *
 * `items` : du plus general au plus specifique. Le dernier element (page
 * courante) peut omettre `path`.
 */
export function breadcrumbJsonLd(items: { name: string; path?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.path ? { item: absoluteUrl(it.path) } : {}),
    })),
  };
}

/**
 * Donnees structurees pour une societe cotee a la BRVM (fiche /titre/[code]).
 * Type `Corporation` : aide Google a rattacher la page a l'entite entreprise
 * (ticker, ISIN, secteur, place de cotation).
 */
export function listedCompanyJsonLd(stock: {
  code: string;
  name: string;
  sector?: string;
  country?: string;
  isin?: string;
  description?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Corporation",
    name: stock.name,
    url: absoluteUrl(`/titre/${stock.code}`),
    tickerSymbol: stock.code,
    ...(stock.isin
      ? {
          identifier: {
            "@type": "PropertyValue",
            propertyID: "ISIN",
            value: stock.isin,
          },
        }
      : {}),
    ...(stock.description ? { description: stock.description } : {}),
    ...(stock.sector ? { industry: stock.sector } : {}),
    ...(stock.country
      ? {
          address: {
            "@type": "PostalAddress",
            addressCountry: stock.country,
          },
        }
      : {}),
  };
}

/**
 * Donnees structurees pour une obligation cotee (fiche /obligation/[isin]).
 * schema.org n'a pas de type "obligation" : on utilise `FinancialProduct`, dont
 * l'emetteur est rattache comme `provider` (Organization).
 */
export function listedBondJsonLd(bond: {
  isin: string;
  name: string;
  issuer: string;
  couponRate?: number;
  currency?: string;
  description?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: bond.name,
    url: absoluteUrl(`/obligation/${bond.isin}`),
    category: "Obligation cotée BRVM",
    identifier: {
      "@type": "PropertyValue",
      propertyID: "ISIN",
      value: bond.isin,
    },
    provider: {
      "@type": "Organization",
      name: bond.issuer,
    },
    ...(bond.currency ? { currency: bond.currency } : {}),
    ...(typeof bond.couponRate === "number"
      ? {
          interestRate: {
            "@type": "QuantitativeValue",
            value: bond.couponRate,
            unitText: "PERCENT",
          },
        }
      : {}),
    ...(bond.description ? { description: bond.description } : {}),
  };
}

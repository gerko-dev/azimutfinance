import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { loadStocks, loadListedBonds } from "@/lib/dataLoader";
import { loadFunds } from "@/lib/fcp";
import { GLOSSAIRE } from "@/lib/glossaire";

// Note : les ~2500 pages /souverain/[id] (adjudications UMOA-Titres, en grande
// partie historiques) ne sont volontairement PAS listees ici — elles diluent le
// budget de crawl. Elles restent accessibles via /marches/souverains-non-cotes.

type Entry = MetadataRoute.Sitemap[number];
type Freq = Entry["changeFrequency"];

// Pages statiques publiques (les espaces admin / compte / auth sont volontairement
// absents — cf. app/robots.ts). Priorites relatives, pas absolues.
const STATIC_ROUTES: { path: string; priority: number; freq: Freq }[] = [
  { path: "/", priority: 1.0, freq: "daily" },
  { path: "/marches/actions", priority: 0.9, freq: "daily" },
  { path: "/marches/obligations", priority: 0.9, freq: "daily" },
  { path: "/marches/obligations/calendrier", priority: 0.6, freq: "weekly" },
  { path: "/marches/obligations/courbe-taux", priority: 0.6, freq: "weekly" },
  { path: "/marches/obligations/surveillance", priority: 0.6, freq: "daily" },
  { path: "/marches/souverains-non-cotes", priority: 0.7, freq: "weekly" },
  { path: "/marches/fcp", priority: 0.8, freq: "weekly" },
  { path: "/marches/indices", priority: 0.7, freq: "daily" },
  { path: "/fcp/categories", priority: 0.6, freq: "weekly" },
  { path: "/sgo", priority: 0.6, freq: "weekly" },
  { path: "/marche-monetaire", priority: 0.7, freq: "weekly" },
  { path: "/marche-monetaire/mtp", priority: 0.6, freq: "weekly" },
  { path: "/macro/pays", priority: 0.7, freq: "weekly" },
  { path: "/macro/matieres-premieres", priority: 0.6, freq: "weekly" },
  { path: "/macro/devises", priority: 0.6, freq: "weekly" },
  { path: "/outils/ytm", priority: 0.7, freq: "monthly" },
  { path: "/outils/screener", priority: 0.7, freq: "monthly" },
  { path: "/outils/screener-fcp", priority: 0.6, freq: "monthly" },
  { path: "/outils/comparateur", priority: 0.6, freq: "monthly" },
  { path: "/outils/portefeuille", priority: 0.5, freq: "monthly" },
  { path: "/outils/alertes", priority: 0.5, freq: "monthly" },
  { path: "/academie/formations", priority: 0.7, freq: "weekly" },
  { path: "/academie/glossaire", priority: 0.7, freq: "monthly" },
  { path: "/academie/simulateur", priority: 0.6, freq: "weekly" },
  { path: "/academie/compte-titre", priority: 0.4, freq: "monthly" },
  { path: "/actualites", priority: 0.8, freq: "daily" },
  { path: "/communaute/forum", priority: 0.6, freq: "daily" },
  { path: "/communaute/newsletter", priority: 0.5, freq: "monthly" },
  { path: "/premium", priority: 0.6, freq: "monthly" },
  { path: "/pros", priority: 0.6, freq: "monthly" },
  { path: "/demande-demo-pro", priority: 0.4, freq: "monthly" },
  { path: "/legal/mentions", priority: 0.2, freq: "yearly" },
  { path: "/legal/cgu", priority: 0.2, freq: "yearly" },
  { path: "/legal/confidentialite", priority: 0.2, freq: "yearly" },
  { path: "/legal/cookies", priority: 0.2, freq: "yearly" },
];

/** Construit un bloc d'entrees, en isolant toute erreur de chargement CSV. */
function safeBlock(label: string, build: () => Entry[]): Entry[] {
  try {
    return build();
  } catch (err) {
    console.error(`[sitemap] bloc "${label}" ignoré :`, err);
    return [];
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries: Entry[] = STATIC_ROUTES.map((r) => ({
    url: absoluteUrl(r.path),
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));

  // Fiches actions cotees BRVM — /titre/[code]
  const titres = safeBlock("titres", () =>
    loadStocks().map((s) => ({
      url: absoluteUrl(`/titre/${s.code}`),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  );

  // Obligations cotees — /obligation/[isin]
  const obligations = safeBlock("obligations", () =>
    loadListedBonds().map((b) => ({
      url: absoluteUrl(`/obligation/${b.isin}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  );

  // FCP / OPCVM — /fcp/[slug]
  const fcp = safeBlock("fcp", () =>
    loadFunds().map((f) => ({
      url: absoluteUrl(`/fcp/${f.id}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  );

  // Glossaire financier — /academie/glossaire/[slug]
  const glossaire = safeBlock("glossaire", () =>
    GLOSSAIRE.map((t) => ({
      url: absoluteUrl(`/academie/glossaire/${t.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  );

  return [
    ...staticEntries,
    ...titres,
    ...obligations,
    ...fcp,
    ...glossaire,
  ];
}

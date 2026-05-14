/**
 * Catalogue des fichiers CSV de data/ : pour chaque fichier on déclare sa
 * catégorie, sa cadence attendue, et la colonne dans laquelle chercher la
 * "dernière donnée". Sert au calcul de fraîcheur (lib/admin/freshness.ts) et
 * au regroupement visuel dans le panel admin.
 *
 * IMPORTANT : ce catalogue ne couvre QUE les fichiers qui ont encore besoin
 * d'un import manuel. Les CSV rafraîchis automatiquement par les workflows
 * GitHub Actions (scrape-*) ainsi que les fichiers legacy sans influence sur
 * le site sont listés dans `AUTO_SCRAPED_FILES` / `LEGACY_DEAD_FILES` et masqués
 * de la page admin (voir `listDataFiles` dans lib/admin/dataFiles.ts).
 *
 * Cadences :
 *  - daily-business : marché ouvert lun-ven (BRVM, FX). Fresh ≤ 5j calendaires.
 *  - daily          : tolérance plus large (commodities importées manuellement). Fresh ≤ 3j.
 *  - monthly        : indicateur mensuel (taux directeurs, scraping immo). Fresh ≤ 45j.
 *  - yearly         : indicateur annuel (macro, états financiers). Fresh ≤ 14 mois.
 *  - event-driven   : pas de cadence stricte (adjudications, actualités). Stale au-delà de 30j.
 *  - ref            : référentiel sans dimension temps. Pas de check de fraîcheur.
 */

export type DataFileCadence =
  | "daily-business"
  | "daily"
  | "monthly"
  | "yearly"
  | "event-driven"
  | "ref";

export type DataFileMeta = {
  category: string;
  cadence: DataFileCadence;
  /** Colonne du CSV dans laquelle lire les dates pour calculer la "dernière donnée". null pour les fichiers ref ou les snapshots sans date. */
  dateColumn: string | null;
  delimiter: "," | ";";
  description: string;
};

/**
 * Fichiers rafraîchis automatiquement par un workflow GitHub Actions (scrape-*).
 * Ils n'ont plus besoin d'import manuel : on les masque de la page admin Data.
 *  - obligations-cotees.csv / obligations-cotees-vn-boc.csv / fcp.csv → scrape-boc
 *  - commodities + FX → scrape-investing
 *  - umoa-emissions-* → scrape-umoa-emissions
 *  - apromac.csv → scrape-apromac
 *  - chph-palme.csv → scrape-chph-palme
 *  (l'historique Sika vit dans les sous-dossiers data/historique_sika — jamais listés)
 */
export const AUTO_SCRAPED_FILES: ReadonlySet<string> = new Set([
  // scrape-boc
  "obligations-cotees.csv",
  "obligations-cotees-vn-boc.csv",
  "fcp.csv",
  // scrape-investing — commodities
  "Cacao.csv",
  "Cafe.csv",
  "brent.csv",
  "wti.csv",
  "or.csv",
  "palmoil.csv",
  "sugar.csv",
  "tsr.csv",
  // scrape-investing — FX
  "EUR_USD.csv",
  "GBP_USD.csv",
  "USD_CNY.csv",
  "US_Dollar_Index.csv",
  "USD_XOF.csv",
  "GBP_XOF.csv",
  "JPY_XOF.csv",
  "CAD_XOF.csv",
  "AED_XOF.csv",
  "TRY_XOF.csv",
  "BRL_XOF.csv",
  "ZAR_XOF.csv",
  "NGN_XOF.csv",
  // scrape-umoa-emissions
  "umoa-emissions-realisees.csv",
  "umoa-emissions-a-venir.csv",
  "umoa-emissions-planifiees.csv",
  // scrape-apromac
  "apromac.csv",
  // scrape-chph-palme
  "chph-palme.csv",
]);

/**
 * Fichiers legacy qui ne sont plus chargés par aucun loader : ils n'ont plus
 * aucune influence sur le site et n'ont donc pas leur place dans la page admin.
 *  - emissions.csv → remplacé par umoa-emissions-* (plus aucun import dans lib/)
 *  - obligations-cotees-evenements.csv → l'échéancier est désormais reconstruit
 *    depuis le référentiel ; le CSV n'a plus à être maintenu (cf. lib/dataLoader.ts)
 */
export const LEGACY_DEAD_FILES: ReadonlySet<string> = new Set([
  "emissions.csv",
  "obligations-cotees-evenements.csv",
]);

/** Fichiers masqués de la page admin Data (auto-scrapés OU legacy morts). */
export const HIDDEN_DATA_FILES: ReadonlySet<string> = new Set([
  ...AUTO_SCRAPED_FILES,
  ...LEGACY_DEAD_FILES,
]);

export const DATA_FILES_CATALOG: Record<string, DataFileMeta> = {
  // === Cours BRVM ===
  "titres.csv": {
    category: "Cours BRVM",
    cadence: "daily-business",
    dateColumn: null,
    delimiter: ";",
    description: "Snapshot actions cotées (prix, capi, ratios)",
  },
  "obligations-cotees-prix.csv": {
    category: "Cours BRVM",
    cadence: "daily-business",
    dateColumn: "date",
    delimiter: ";",
    description: "Historique prix obligataires",
  },
  "fcp/aumfcp.csv": {
    category: "Cours BRVM",
    cadence: "yearly",
    dateColumn: "Date",
    delimiter: ";",
    description: "Historique trimestriel VL + Actif net OPCVM (source AGP UEMOA)",
  },

  // === Macro & taux ===
  "macro.csv": {
    category: "Macro & taux",
    cadence: "yearly",
    dateColumn: "Periode",
    delimiter: ";",
    description: "Indicateurs macro UEMOA (annuel)",
  },
  "bddtaux.csv": {
    category: "Macro & taux",
    cadence: "monthly",
    dateColumn: "period",
    delimiter: ",",
    description: "Taux directeurs et interbancaires — fallback si le PDF BCEAO est absent",
  },

  // === Immobilier (scrapers locaux scripts/*.py, import manuel) ===
  "jiji-achat.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces achat — Jiji (Côte d'Ivoire)" },
  "jiji-location.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces location — Jiji (Côte d'Ivoire)" },
  "coinafrique-location.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces location — CoinAfrique (Côte d'Ivoire)" },
  "coinafrique-uemoa.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces CoinAfrique harmonisées — 7 pays UEMOA" },
  "selogeraumali.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces SeLogerAuMali (Mali)" },
  "expat-dakar.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces Expat-Dakar (Sénégal)" },
  "annoncesimmo-ci.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces AnnoncesImmo (Côte d'Ivoire)" },
  "clefsdufaso.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces Clefs du Faso (Burkina Faso)" },
  "beninagence.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces Bénin Agence (Bénin)" },
  "quartier-mapping.csv": { category: "Immobilier", cadence: "ref", dateColumn: null, delimiter: ";", description: "Mapping quartier → commune / région" },

  // === Référentiels comptables ===
  "DB_Postes.csv": { category: "Référentiel comptable", cadence: "ref", dateColumn: null, delimiter: ",", description: "Codes des postes comptables" },
  "DB_Titres.csv": { category: "Référentiel comptable", cadence: "ref", dateColumn: null, delimiter: ",", description: "Référentiel des sociétés cotées" },
  "DB_Valeurs.csv": { category: "Référentiel comptable", cadence: "yearly", dateColumn: "exercice", delimiter: ",", description: "Valeurs comptables par exercice" },
};

export const CATEGORY_ORDER: string[] = [
  "Cours BRVM",
  "Macro & taux",
  "Immobilier",
  "Référentiel comptable",
  "Autres",
];

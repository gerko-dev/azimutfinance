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
  /**
   * En-tête attendu : liste exacte des colonnes du CSV. Sert à valider qu'un
   * fichier importé via /admin/data correspond bien à sa cible (cf.
   * uploadDataFile). Toutes ces colonnes doivent être présentes dans le
   * fichier uploadé (colonnes supplémentaires tolérées). Optionnel : si absent,
   * aucune validation de colonnes n'est appliquée.
   */
  columns?: string[];
};

/**
 * Fichiers rafraîchis automatiquement par un workflow GitHub Actions (scrape-*).
 * Ils n'ont plus besoin d'import manuel : on les masque de la page admin Data.
 *  - obligations-cotees.csv / obligations-cotees-vn-boc.csv / fcp.csv → scrape-boc
 *  - obligations-cotees-prix.csv → scrape-brvm-bond-prices (snapshot 15h) +
 *    backfill volume/transactions par scrape-boc
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
  // scrape-brvm-bond-prices (snapshot 15h) + backfill volume/transactions par scrape-boc
  "obligations-cotees-prix.csv",
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

// En-têtes partagés des CSV d'annonces immobilières (deux formats).
const IMMO_CI_COLUMNS = [
  "source", "transaction", "type_bien", "titre", "prix_fcfa", "surface_m2",
  "prix_m2_fcfa", "chambres", "quartier", "sous_quartier", "standing", "url",
  "scraped_at",
];
const IMMO_HARMONISE_COLUMNS = [
  "country", "country_label", "source", "transaction", "type_bien",
  "subcategory", "titre", "prix_fcfa", "surface_m2", "prix_m2_fcfa", "chambres",
  "quartier", "sous_quartier", "standing", "url", "scraped_at",
];

export const DATA_FILES_CATALOG: Record<string, DataFileMeta> = {
  // === Cours BRVM ===
  "titres.csv": {
    category: "Cours BRVM",
    cadence: "daily-business",
    dateColumn: null,
    delimiter: ";",
    description: "Snapshot actions cotées (prix, capi, ratios)",
    columns: [
      "code", "name", "sector", "country", "isin", "price", "change",
      "changePercent", "volume", "capitalization", "sharesOutstanding",
      "float", "per", "yield", "high52w", "low52w", "yearChange",
      "volatility", "description",
    ],
  },
  "fcp/aumfcp.csv": {
    category: "Cours BRVM",
    cadence: "yearly",
    dateColumn: "Date",
    delimiter: ";",
    description: "Historique trimestriel VL + Actif net OPCVM (source AGP UEMOA)",
    // Pas de `columns` : fichier en sous-dossier, non importable via le panneau.
  },

  // === Macro & taux ===
  "macro.csv": {
    category: "Macro & taux",
    cadence: "yearly",
    dateColumn: "Periode",
    delimiter: ";",
    description: "Indicateurs macro UEMOA (annuel)",
    columns: ["Pays", "Feuille", "Code", "Indicateur", "Periode", "Valeur"],
  },
  // Note : les taux BCEAO/UEMOA viennent désormais du PDF
  // data/marche-monetaire/Bul_stat.pdf, importé via lib/admin/bceaoBulletin.ts
  // (carte dédiée sur /admin/data) — plus de bddtaux.csv.

  // === Immobilier (scrapers locaux scripts/*.py, import manuel) ===
  "jiji-achat.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces achat — Jiji (Côte d'Ivoire)", columns: IMMO_CI_COLUMNS },
  "jiji-location.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces location — Jiji (Côte d'Ivoire)", columns: IMMO_CI_COLUMNS },
  "coinafrique-location.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces location — CoinAfrique (Côte d'Ivoire)", columns: IMMO_CI_COLUMNS },
  "coinafrique-uemoa.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces CoinAfrique harmonisées — 7 pays UEMOA", columns: IMMO_HARMONISE_COLUMNS },
  "selogeraumali.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces SeLogerAuMali (Mali)", columns: IMMO_HARMONISE_COLUMNS },
  "expat-dakar.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces Expat-Dakar (Sénégal)", columns: IMMO_HARMONISE_COLUMNS },
  "annoncesimmo-ci.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces AnnoncesImmo (Côte d'Ivoire)", columns: IMMO_HARMONISE_COLUMNS },
  "clefsdufaso.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces Clefs du Faso (Burkina Faso)", columns: IMMO_HARMONISE_COLUMNS },
  "beninagence.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces Bénin Agence (Bénin)", columns: IMMO_HARMONISE_COLUMNS },
  "quartier-mapping.csv": { category: "Immobilier", cadence: "ref", dateColumn: null, delimiter: ";", description: "Mapping quartier → commune / région", columns: ["country", "quartier_alias", "commune", "quartier_pretty", "region"] },

  // === Référentiels comptables ===
  "DB_Postes.csv": { category: "Référentiel comptable", cadence: "ref", dateColumn: null, delimiter: ",", description: "Codes des postes comptables", columns: ["code_poste", "libelle_long", "libelle_court", "categorie", "format_etats", "ordre", "type_valeur"] },
  "DB_Titres.csv": { category: "Référentiel comptable", cadence: "ref", dateColumn: null, delimiter: ",", description: "Référentiel des sociétés cotées", columns: ["ticker", "raison_sociale", "secteur", "nb_titres", "cours", "capitalisation", "devise", "format_etats"] },
  "DB_Valeurs.csv": { category: "Référentiel comptable", cadence: "yearly", dateColumn: "exercice", delimiter: ",", description: "Valeurs comptables par exercice", columns: ["ticker", "exercice", "periode", "code_poste", "valeur", "devise"] },
};

export const CATEGORY_ORDER: string[] = [
  "Cours BRVM",
  "Macro & taux",
  "Immobilier",
  "Référentiel comptable",
  "Autres",
];

/**
 * Catalogue des fichiers CSV de data/ : pour chaque fichier on déclare sa
 * catégorie, sa cadence attendue, et la colonne dans laquelle chercher la
 * "dernière donnée". Sert au calcul de fraîcheur (lib/admin/freshness.ts) et
 * au regroupement visuel dans le panel admin.
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

export const DATA_FILES_CATALOG: Record<string, DataFileMeta> = {
  // === Cours BRVM ===
  "titres.csv": {
    category: "Cours BRVM",
    cadence: "daily-business",
    dateColumn: null,
    delimiter: ";",
    description: "Snapshot actions cotées (prix, capi, ratios)",
  },
  "historique-prix.csv": {
    category: "Cours BRVM",
    cadence: "daily-business",
    dateColumn: "date",
    delimiter: ",",
    description: "Historique cours actions et indices BRVM",
  },
  "obligations-cotees.csv": {
    category: "Cours BRVM",
    cadence: "ref",
    dateColumn: null,
    delimiter: ";",
    description: "Référentiel obligations cotées",
  },
  "obligations-cotees-prix.csv": {
    category: "Cours BRVM",
    cadence: "daily-business",
    dateColumn: "date",
    delimiter: ";",
    description: "Historique prix obligataires",
  },
  "obligations-cotees-evenements.csv": {
    category: "Cours BRVM",
    cadence: "event-driven",
    dateColumn: "date",
    delimiter: ";",
    description: "Coupons et amortissements obligations",
  },
  "emissions.csv": {
    category: "Legacy",
    cadence: "event-driven",
    dateColumn: "Date de l'opération",
    delimiter: ",",
    description: "Adjudications UMOA-Titres (legacy, remplacé par umoa-emissions-*)",
  },
  "umoa-emissions-realisees.csv": {
    category: "UMOA-Titres",
    cadence: "daily",
    dateColumn: "dateOperation",
    delimiter: ";",
    description: "Adjudications UMOA-Titres réalisées (scraper daily 19h GMT)",
  },
  "umoa-emissions-a-venir.csv": {
    category: "UMOA-Titres",
    cadence: "daily",
    dateColumn: "dateOperation",
    delimiter: ";",
    description: "Émissions à venir UMOA-Titres",
  },
  "umoa-emissions-planifiees.csv": {
    category: "UMOA-Titres",
    cadence: "daily",
    dateColumn: "dateOperation",
    delimiter: ";",
    description: "Calendrier annuel UMOA-Titres",
  },
  "fcp.csv": {
    category: "Cours BRVM",
    cadence: "daily-business",
    dateColumn: "bocDate",
    delimiter: ";",
    description: "FCP / SICAV (dernière page du BOC BRVM)",
  },
  "fcp/aumfcp.csv": {
    category: "Cours BRVM",
    cadence: "yearly",
    dateColumn: "Date",
    delimiter: ";",
    description: "Historique trimestriel VL + Actif net OPCVM (source AGP UEMOA)",
  },
  "actualites.csv": {
    category: "Cours BRVM",
    cadence: "event-driven",
    dateColumn: "date",
    delimiter: ";",
    description: "Actualités BRVM (legacy CSV)",
  },

  // === Matières premières ===
  "Cacao.csv": { category: "Matières premières", cadence: "daily", dateColumn: "Date", delimiter: ",", description: "Cacao (London ICE)" },
  "Cafe.csv": { category: "Matières premières", cadence: "daily", dateColumn: "Date", delimiter: ",", description: "Café" },
  "brent.csv": { category: "Matières premières", cadence: "daily", dateColumn: "Date", delimiter: ",", description: "Brent (pétrole)" },
  "wti.csv": { category: "Matières premières", cadence: "daily", dateColumn: "Date", delimiter: ",", description: "WTI (pétrole)" },
  "or.csv": { category: "Matières premières", cadence: "daily", dateColumn: "Date", delimiter: ",", description: "Or" },
  "palmoil.csv": { category: "Matières premières", cadence: "daily", dateColumn: "Date", delimiter: ",", description: "Huile de palme" },
  "sugar.csv": { category: "Matières premières", cadence: "daily", dateColumn: "Date", delimiter: ",", description: "Sucre" },
  "tsr.csv": { category: "Matières premières", cadence: "daily", dateColumn: "Date", delimiter: ",", description: "Caoutchouc TSR" },

  // === Devises (FX) ===
  "EUR_USD.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "EUR/USD" },
  "GBP_USD.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "GBP/USD" },
  "USD_CNY.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "USD/CNY" },
  "USD_XOF.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "USD/XOF" },
  "AED_XOF.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "AED/XOF" },
  "BRL_XOF.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "BRL/XOF" },
  "CAD_XOF.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "CAD/XOF" },
  "GBP_XOF.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "GBP/XOF" },
  "JPY_XOF.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "JPY/XOF" },
  "NGN_XOF.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "NGN/XOF" },
  "TRY_XOF.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "TRY/XOF" },
  "ZAR_XOF.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "ZAR/XOF" },
  "US_Dollar_Index.csv": { category: "Devises (FX)", cadence: "daily-business", dateColumn: "Date", delimiter: ",", description: "Indice DXY" },

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
    description: "Taux directeurs et taux interbancaires",
  },
  // === Immobilier (scrap) ===
  "jiji-achat.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces achat (Jiji)" },
  "jiji-location.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces location (Jiji)" },
  "coinafrique-location.csv": { category: "Immobilier", cadence: "monthly", dateColumn: "scraped_at", delimiter: ";", description: "Annonces location (CoinAfrique)" },

  // === Référentiels comptables ===
  "DB_Postes.csv": { category: "Référentiel comptable", cadence: "ref", dateColumn: null, delimiter: ",", description: "Codes des postes comptables" },
  "DB_Titres.csv": { category: "Référentiel comptable", cadence: "ref", dateColumn: null, delimiter: ",", description: "Référentiel des sociétés cotées" },
  "DB_Valeurs.csv": { category: "Référentiel comptable", cadence: "yearly", dateColumn: "exercice", delimiter: ",", description: "Valeurs comptables par exercice" },
};

export const CATEGORY_ORDER: string[] = [
  "Cours BRVM",
  "Matières premières",
  "Devises (FX)",
  "Macro & taux",
  "Immobilier",
  "Référentiel comptable",
  "Autres",
];

// === DONNEES FONDAMENTALES ===
// Charge DB_Titres.csv, DB_Postes.csv, DB_Valeurs.csv (delimiter=virgule) et
// expose les helpers pour la fiche action et les états financiers.
//
// Note : le calcul des ratios (ROE, marges, PER, etc.) a été migré dans
// lib/fundamentalsCalc.ts (qui dérive tout de DB_Valeurs + DB_Titres +
// historique_sika). DB_Ratios.csv est désormais inutile et a été supprimé.

import { readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

const DATA_DIR = join(process.cwd(), "data");

function parseFundCSV<T>(filename: string): T[] {
  const filePath = join(DATA_DIR, filename);
  let content = readFileSync(filePath, "utf-8");
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const result = Papa.parse<T>(content, {
    header: true,
    delimiter: ",",
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  });

  return result.data;
}

function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const str = String(value).trim();
  if (str === "" || str === "NC" || str === "-") return 0;
  const sciFr = /^-?\d+,\d+[eE][+-]?\d+$/;
  if (sciFr.test(str)) {
    const n = Number(str.replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  const cleaned = str.replace(/\s/g, "").replace(/,/g, ".");
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

// === Types CSV bruts ===

export type FormatEtats = "SYSCOHADA" | "Bancaire" | "Commun";

type RawTitre = {
  ticker: string;
  raison_sociale: string;
  secteur: string;
  nb_titres: string;
  cours: string;
  capitalisation: string;
  devise: string;
  format_etats: string;
};

type RawPoste = {
  code_poste: string;
  libelle_long: string;
  libelle_court: string;
  categorie: string;
  format_etats: string;
  ordre: string;
  type_valeur: string;
};

type RawValeur = {
  ticker: string;
  exercice: string;
  periode: string;
  code_poste: string;
  valeur: string;
  devise: string;
};

// === Types exposés ===

export type FundTitre = {
  ticker: string;
  raisonSociale: string;
  secteur: string;
  nbTitres: number;
  cours: number;
  capitalisation: number;
  devise: string;
  formatEtats: FormatEtats;
};

export type FundPoste = {
  codePoste: string;
  libelleLong: string;
  libelleCourt: string;
  categorie: PosteCategorie;
  formatEtats: FormatEtats;
  ordre: number;
  typeValeur: string;
};

export type PosteCategorie =
  | "Bilan_Actif"
  | "Bilan_Passif"
  | "Compte_Resultat"
  | "Hors_Bilan"
  | "Tableau_Flux"
  | "Par_Action";

// Ratios financiers + agrégats par exercice. Produits par
// lib/fundamentalsCalc.ts (ce module ne fait plus que les exposer comme type).
export type FundRatios = {
  ticker: string;
  exercice: number;
  formatEtats: FormatEtats;
  // Agrégats financiers (FCFA)
  ca: number;
  resultatNet: number;
  resultatExploitation: number;
  totalActif: number;
  capitauxPropres: number;
  dettesFinancieres: number;
  va: number;
  ebe: number;
  chargesPersonnel: number;
  dap: number;
  fraisFinanciers: number;
  cafg: number;
  capiBoursiere: number;
  nbTitres: number;
  coursFinEx: number;
  dpa: number; // dividende par action
  // Marges (% en décimal — multiplier par 100 pour affichage)
  margeBrute: number | null;
  margeOperationnelle: number | null;
  margeVA: number | null;
  margeNette: number | null;
  // Rentabilité
  roe: number | null;
  roa: number | null;
  rentaEconomique: number | null;
  // Solvabilité / Endettement
  gearing: number | null;
  autonomieFinanciere: number | null;
  autonomieGlobale: number | null;
  capaciteRemb: number | null;
  solvabilite: number | null;
  // Couverture / financement
  financementImmo: number | null;
  couvertureCapInvestis: number | null;
  couvertureCapInvestis2: number | null;
  tauxAutofinancement: number | null;
  // Répartition de la valeur ajoutée
  remTravail: number | null;
  remPreteurs: number | null;
  remEtat: number | null;
  autoRemuneration: number | null;
  remActionnaires: number | null;
  // Liquidité
  liquiditeImmediate: number | null;
  liquiditeReduite: number | null;
  liquiditeGenerale: number | null;
  // Activité (jours)
  rotationStocks: number | null;
  rotationClients: number | null;
  rotationFournisseurs: number | null;
  rotationActif: number | null;
  // Croissance
  croissanceCA: number | null;
  croissanceVA: number | null;
  croissanceRNet: number | null;
  croissanceRExp: number | null;
  // Marché
  per: number | null;
  bpa: number | null;
  tauxDistribution: number | null;
  dividendYield: number | null;
  capiSurCA: number | null;
  // Bancaire-spécifique
  coefficientExploitation: number | null;
  coutRisqueSurPNB: number | null;
  // Structure
  levierFinancier: number | null;
};

// Niveau hiérarchique d'une ligne d'état financier, dérivé de `typeValeur`
// (+ code_poste pour les totaux généraux). Sert au rendu (3 designs distincts :
// sous-total < total de section < total général) et à l'export Excel.
export type StatementLevel =
  | "total-general" // TOTAL GÉNÉRAL actif/passif, variation nette de trésorerie
  | "total" // total de section (TOTAL ACTIF IMMOBILISÉ, flux d'investissement…)
  | "sous-total" // agrégat intermédiaire (IMMOBILISATIONS CORPORELLES, FTCP…)
  | "solde" // solde intermédiaire de gestion (SIG) du compte de résultat
  | "produit" // produit (compte de résultat)
  | "charge" // charge (compte de résultat)
  | "detail"; // poste élémentaire

// Codes des totaux généraux : stylés comme niveau le plus haut, distinct des
// totaux de section. (Les flux n'ont pas de "TOTAL GÉNÉRAL" littéral : la
// variation nette de trésorerie en tient lieu.)
const GRAND_TOTAL_CODES = new Set([
  "BIL_TOTAL_ACTIF",
  "BIL_TOTAL_PASSIF",
  "TFT_VAR_TRES",
]);

/** Classe une ligne d'état financier selon son `type_valeur` et son code. */
export function classifyStatementLine(
  typeValeur: string,
  codePoste: string,
): StatementLevel {
  switch (typeValeur) {
    case "Total":
      return GRAND_TOTAL_CODES.has(codePoste) ? "total-general" : "total";
    case "SousTotal":
      return "sous-total";
    case "SIG":
      return "solde";
    case "Produit":
      return "produit";
    case "Charge":
      return "charge";
    default:
      return "detail";
  }
}

// Ligne d'état financier (Bilan / CR / Flux)
export type StatementLine = {
  codePoste: string;
  libelle: string;
  libelleCourt: string;
  ordre: number;
  typeValeur: string;
  niveau: StatementLevel;
  values: Record<number, number>; // exercice → valeur
};

// === Caches ===

let _titresCache: FundTitre[] | null = null;
let _postesCache: FundPoste[] | null = null;
let _valeursCache: RawValeur[] | null = null;

// === Loaders ===

export function loadFundTitres(): FundTitre[] {
  if (_titresCache) return _titresCache;
  const rows = parseFundCSV<RawTitre>("DB_Titres.csv");
  _titresCache = rows
    .filter((r) => r.ticker?.trim())
    .map((r) => ({
      ticker: r.ticker.trim().toUpperCase(),
      raisonSociale: r.raison_sociale?.trim() || "",
      secteur: r.secteur?.trim() || "",
      nbTitres: num(r.nb_titres),
      cours: num(r.cours),
      capitalisation: num(r.capitalisation),
      devise: r.devise?.trim() || "XOF",
      formatEtats: (r.format_etats?.trim() || "SYSCOHADA") as FormatEtats,
    }));
  return _titresCache;
}

export function loadFundPostes(): FundPoste[] {
  if (_postesCache) return _postesCache;
  const rows = parseFundCSV<RawPoste>("DB_Postes.csv");
  _postesCache = rows
    .filter((r) => r.code_poste?.trim())
    .map((r) => ({
      codePoste: r.code_poste.trim(),
      libelleLong: r.libelle_long?.trim() || r.code_poste.trim(),
      libelleCourt: r.libelle_court?.trim() || r.libelle_long?.trim() || r.code_poste.trim(),
      categorie: (r.categorie?.trim() || "") as PosteCategorie,
      formatEtats: (r.format_etats?.trim() || "Commun") as FormatEtats,
      ordre: num(r.ordre),
      typeValeur: r.type_valeur?.trim() || "Detail",
    }));
  return _postesCache;
}

function loadFundValeurs(): RawValeur[] {
  if (_valeursCache) return _valeursCache;
  _valeursCache = parseFundCSV<RawValeur>("DB_Valeurs.csv").filter(
    (r) => r.ticker?.trim() && r.code_poste?.trim()
  );
  return _valeursCache;
}

/** Retourne le titre fondamental pour un ticker. */
export function getFundTitre(ticker: string): FundTitre | null {
  return loadFundTitres().find((t) => t.ticker === ticker.toUpperCase()) ?? null;
}

/**
 * Construit les lignes d'un état financier pour un ticker et une catégorie.
 * Retourne les lignes ordonnées (selon ordre dans DB_Postes) avec valeurs par exercice.
 * Filtre les lignes 100% à 0 sur tous les exercices demandés.
 */
export function getStatement(
  ticker: string,
  categorie: PosteCategorie,
  exercices: number[]
): StatementLine[] {
  const t = ticker.toUpperCase();
  const titre = getFundTitre(t);
  if (!titre) return [];

  const allValeurs = loadFundValeurs();
  const allPostes = loadFundPostes();

  // Map (codePoste → poste) restreint au format_etats correspondant + Commun
  const postesByCode = new Map<string, FundPoste>();
  for (const p of allPostes) {
    if (p.categorie !== categorie) continue;
    if (p.formatEtats !== titre.formatEtats && p.formatEtats !== "Commun") continue;
    // Si plusieurs lignes (ex CR_INTERETS pour Bancaire en Produit/Charge), on garde la première rencontrée
    if (!postesByCode.has(p.codePoste)) {
      postesByCode.set(p.codePoste, p);
    }
  }

  // Map (codePoste|exercice → valeur). On ne garde que la période "Annuel" :
  // sans ce filtre, les valeurs trimestrielles cumulees (T1/S1/T3) ecrasent
  // l'annuel selon l'ordre de lecture du CSV (ex SNTS 2025 CR_RNET : T3=311 Mds
  // s'imposait alors que l'annuel vaut 246,65 Mds).
  const exSet = new Set(exercices);
  const valuesByCodeEx = new Map<string, number>();
  for (const v of allValeurs) {
    if (v.ticker.trim().toUpperCase() !== t) continue;
    if (v.periode?.trim() !== "Annuel") continue;
    const ex = num(v.exercice);
    if (!exSet.has(ex)) continue;
    if (!postesByCode.has(v.code_poste.trim())) continue;
    valuesByCodeEx.set(`${v.code_poste.trim()}|${ex}`, num(v.valeur));
  }

  // Construire les lignes
  const lines: StatementLine[] = [];
  for (const p of postesByCode.values()) {
    const values: Record<number, number> = {};
    let hasNonZero = false;
    for (const ex of exercices) {
      const v = valuesByCodeEx.get(`${p.codePoste}|${ex}`) ?? 0;
      values[ex] = v;
      if (v !== 0) hasNonZero = true;
    }
    if (!hasNonZero) continue;
    lines.push({
      codePoste: p.codePoste,
      libelle: p.libelleLong,
      libelleCourt: p.libelleCourt,
      ordre: p.ordre,
      typeValeur: p.typeValeur,
      niveau: classifyStatementLine(p.typeValeur, p.codePoste),
      values,
    });
  }

  lines.sort((a, b) => a.ordre - b.ordre);
  return lines;
}

// === États financiers périodiques (publications infra-annuelles) ===
//
// Les sociétés cotées publient des données cumulées en cours d'exercice :
// T1 (3 mois), S1 (6 mois), 9M (9 mois), puis l'Annuel (12 mois). DB_Valeurs
// ne porte ces publications que pour quelques soldes du compte de résultat
// (CA/PNB, résultat d'exploitation, résultat net). `getStatement` les ignore
// volontairement (filtre "Annuel") ; ce loader les expose à part.

// Périodes intra-annuelles cumulées + l'annuel, en ordre chronologique.
export const PERIODIC_PERIODS = ["T1", "S1", "9M", "Annuel"] as const;
export type PeriodKey = (typeof PERIODIC_PERIODS)[number];

// Libellé court d'affichage de chaque période.
export const PERIOD_LABELS: Record<PeriodKey, string> = {
  T1: "T1",
  S1: "S1",
  "9M": "9M",
  Annuel: "Année",
};

export type PeriodicMetric = {
  codePoste: string;
  libelle: string;
  ordre: number;
  // exercice → (période → valeur en FCFA)
  values: Record<number, Partial<Record<PeriodKey, number>>>;
};

export type PeriodicStatements = {
  // Exercices ayant au moins une publication infra-annuelle, ordre croissant.
  exercices: number[];
  // Soldes disponibles en publication périodique, ordonnés selon DB_Postes.
  metrics: PeriodicMetric[];
};

const EMPTY_PERIODIC: PeriodicStatements = { exercices: [], metrics: [] };

function isPeriodKey(s: string): s is PeriodKey {
  return (PERIODIC_PERIODS as readonly string[]).includes(s);
}

/**
 * Retourne les états financiers périodiques (T1/S1/9M + Annuel) d'un ticker.
 * Ne conserve que les soldes effectivement publiés en infra-annuel ; chaque
 * solde inclut aussi sa valeur annuelle (pour la comparaison cumul → exercice
 * plein). Vide si le titre est inconnu ou sans publication infra-annuelle.
 */
export function getPeriodicStatements(ticker: string): PeriodicStatements {
  const t = ticker.toUpperCase();
  const titre = getFundTitre(t);
  if (!titre) return EMPTY_PERIODIC;

  const allValeurs = loadFundValeurs();
  const allPostes = loadFundPostes();

  // Méta du poste restreinte au format du titre (+ Commun).
  const posteByCode = new Map<string, FundPoste>();
  for (const p of allPostes) {
    if (p.formatEtats !== titre.formatEtats && p.formatEtats !== "Commun") continue;
    if (!posteByCode.has(p.codePoste)) posteByCode.set(p.codePoste, p);
  }

  // code → exercice → période → valeur. On collecte aussi l'Annuel, mais on
  // ne retient que les codes/exercices porteurs d'au moins une période
  // infra-annuelle.
  const byCode = new Map<
    string,
    Record<number, Partial<Record<PeriodKey, number>>>
  >();
  const interimExercices = new Set<number>();
  const interimCodes = new Set<string>();

  for (const v of allValeurs) {
    if (v.ticker.trim().toUpperCase() !== t) continue;
    const periode = v.periode?.trim() ?? "";
    if (!isPeriodKey(periode)) continue;
    const code = v.code_poste.trim();
    if (!posteByCode.has(code)) continue;
    const ex = num(v.exercice);
    if (!ex) continue;

    let perEx = byCode.get(code);
    if (!perEx) {
      perEx = {};
      byCode.set(code, perEx);
    }
    (perEx[ex] ??= {})[periode] = num(v.valeur);

    if (periode !== "Annuel") {
      interimExercices.add(ex);
      interimCodes.add(code);
    }
  }

  const metrics: PeriodicMetric[] = [];
  for (const code of interimCodes) {
    const p = posteByCode.get(code);
    if (!p) continue;
    metrics.push({
      codePoste: code,
      libelle: p.libelleLong,
      ordre: p.ordre,
      values: byCode.get(code) ?? {},
    });
  }
  metrics.sort((a, b) => a.ordre - b.ordre);

  if (metrics.length === 0) return EMPTY_PERIODIC;

  const exercices = [...interimExercices].sort((a, b) => a - b);
  return { exercices, metrics };
}

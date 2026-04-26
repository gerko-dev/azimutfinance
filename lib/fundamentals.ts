// === DONNEES FONDAMENTALES ===
// Charge les 4 fichiers DB_*.csv (delimiter=virgule, contrairement aux autres CSV)
// et expose des helpers pour les fiches actions et le screener.

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

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === "" || str === "NC" || str === "-") return null;
  const sciFr = /^-?\d+,\d+[eE][+-]?\d+$/;
  if (sciFr.test(str)) {
    const n = Number(str.replace(",", "."));
    return isNaN(n) ? null : n;
  }
  const cleaned = str.replace(/\s/g, "").replace(/,/g, ".");
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
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

type RawRatios = {
  ticker: string;
  exercice: string;
  format_etats: string;
  [key: string]: string;
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

// Sous-ensemble de ratios + état financier agrégé par exercice.
// On garde les valeurs brutes (FCFA) ET les ratios calculés.
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

// Ligne d'état financier (Bilan / CR / Flux)
export type StatementLine = {
  codePoste: string;
  libelle: string;
  libelleCourt: string;
  ordre: number;
  typeValeur: string;
  values: Record<number, number>; // exercice → valeur
};

// === Caches ===

let _titresCache: FundTitre[] | null = null;
let _postesCache: FundPoste[] | null = null;
let _ratiosCache: FundRatios[] | null = null;
let _valeursCache: RawValeur[] | null = null;
let _ratiosByTicker: Map<string, FundRatios[]> | null = null;

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

export function loadFundRatios(): FundRatios[] {
  if (_ratiosCache) return _ratiosCache;
  const rows = parseFundCSV<RawRatios>("DB_Ratios.csv");
  _ratiosCache = rows
    .filter((r) => r.ticker?.trim() && r.exercice?.trim())
    .map((r) => ({
      ticker: r.ticker.trim().toUpperCase(),
      exercice: num(r.exercice),
      formatEtats: (r.format_etats?.trim() || "SYSCOHADA") as FormatEtats,
      ca: num(r.CA),
      resultatNet: num(r.Resultat_Net),
      resultatExploitation: num(r.Resultat_Exploitation),
      totalActif: num(r.Total_Actif),
      capitauxPropres: num(r.Capitaux_Propres),
      dettesFinancieres: num(r.Dettes_Financieres),
      va: num(r.VA),
      ebe: num(r.EBE),
      chargesPersonnel: num(r.Charges_Personnel),
      dap: num(r.DAP),
      fraisFinanciers: num(r.Frais_Financiers),
      cafg: num(r.CAFG),
      capiBoursiere: num(r.Capi_Boursiere),
      nbTitres: num(r.Nb_Titres),
      coursFinEx: num(r.Cours_Fin_Ex),
      dpa: num(r.DPA),
      margeBrute: numOrNull(r.Marge_Brute_pct),
      margeOperationnelle: numOrNull(r.Marge_Operationnelle_pct),
      margeVA: numOrNull(r.Marge_VA_pct),
      margeNette: numOrNull(r.Marge_Nette_pct),
      roe: numOrNull(r.ROE_pct),
      roa: numOrNull(r.ROA_pct),
      rentaEconomique: numOrNull(r.Rentabilite_Economique_pct),
      gearing: numOrNull(r.Gearing_pct),
      autonomieFinanciere: numOrNull(r.Autonomie_Financiere),
      autonomieGlobale: numOrNull(r.Autonomie_Globale),
      capaciteRemb: numOrNull(r.Capacite_Remb_II),
      solvabilite: numOrNull(r.Solvabilite_pct),
      financementImmo: numOrNull(r.Financement_Immo),
      couvertureCapInvestis: numOrNull(r.Couverture_Cap_Investis),
      couvertureCapInvestis2: numOrNull(r.Couverture_Cap_Investis_2),
      tauxAutofinancement: numOrNull(r.Taux_Autofinancement),
      remTravail: numOrNull(r.Rem_Travail_pct),
      remPreteurs: numOrNull(r.Rem_Preteurs_pct),
      remEtat: numOrNull(r.Rem_Etat_pct),
      autoRemuneration: numOrNull(r.Auto_Remuneration_pct),
      remActionnaires: numOrNull(r.Rem_Actionnaires_pct),
      liquiditeImmediate: numOrNull(r.Liquidite_Immediate),
      liquiditeReduite: numOrNull(r.Liquidite_Reduite),
      liquiditeGenerale: numOrNull(r.Liquidite_Generale),
      rotationStocks: numOrNull(r.Rotation_Stocks_j),
      rotationClients: numOrNull(r.Rotation_Clients_j),
      rotationFournisseurs: numOrNull(r.Rotation_Fournisseurs_j),
      rotationActif: numOrNull(r.Rotation_Actif),
      croissanceCA: numOrNull(r.Croissance_CA_pct),
      croissanceVA: numOrNull(r.Croissance_VA_pct),
      croissanceRNet: numOrNull(r.Croissance_RNet_pct),
      croissanceRExp: numOrNull(r.Croissance_REXP_pct),
      per: numOrNull(r.PER),
      bpa: numOrNull(r.BPA),
      tauxDistribution: numOrNull(r.Taux_Distribution_pct),
      dividendYield: numOrNull(r.Dividend_Yield_pct),
      capiSurCA: numOrNull(r.Capi_sur_CA),
      coefficientExploitation: numOrNull(r.Coefficient_Exploitation_pct),
      coutRisqueSurPNB: numOrNull(r.Cout_Risque_sur_PNB_pct),
      levierFinancier: numOrNull(r.Levier_Financier),
    }));
  return _ratiosCache;
}

function loadFundValeurs(): RawValeur[] {
  if (_valeursCache) return _valeursCache;
  _valeursCache = parseFundCSV<RawValeur>("DB_Valeurs.csv").filter(
    (r) => r.ticker?.trim() && r.code_poste?.trim()
  );
  return _valeursCache;
}

// === Helpers ===

function getRatiosIndex(): Map<string, FundRatios[]> {
  if (_ratiosByTicker) return _ratiosByTicker;
  const all = loadFundRatios();
  const map = new Map<string, FundRatios[]>();
  for (const r of all) {
    const list = map.get(r.ticker) ?? [];
    list.push(r);
    map.set(r.ticker, list);
  }
  // Trier par exercice croissant
  for (const [, list] of map) {
    list.sort((a, b) => a.exercice - b.exercice);
  }
  _ratiosByTicker = map;
  return map;
}

/** Retourne l'historique de ratios pour un ticker, exercices croissants. */
export function getRatiosByTicker(ticker: string): FundRatios[] {
  return getRatiosIndex().get(ticker.toUpperCase()) ?? [];
}

/** Retourne le dernier exercice avec activité (CA > 0). */
export function getLatestRatios(ticker: string): FundRatios | null {
  const list = getRatiosByTicker(ticker);
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].ca > 0) return list[i];
  }
  return list[list.length - 1] ?? null;
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

  // Map (codePoste|exercice → valeur)
  const exSet = new Set(exercices);
  const valuesByCodeEx = new Map<string, number>();
  for (const v of allValeurs) {
    if (v.ticker.trim().toUpperCase() !== t) continue;
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
      values,
    });
  }

  lines.sort((a, b) => a.ordre - b.ordre);
  return lines;
}

/**
 * Snapshot par ticker pour le screener : dernier exercice utile, ensemble étendu
 * des ratios fondamentaux exposés au filtrage. Retourne null si aucun ratio dispo.
 *
 * Note : on inclut volontairement les ratios qui ne font PAS doublon avec les
 * critères de marché du screener (PER et Dividend Yield sont gérés ailleurs).
 */
export type FundScreenerSnapshot = {
  ticker: string;
  formatEtats: FormatEtats;
  exercice: number;
  // Rentabilité
  roe: number | null;
  roa: number | null;
  rentaEconomique: number | null;
  margeBrute: number | null;
  margeOperationnelle: number | null;
  margeVA: number | null;
  margeNette: number | null;
  // Bancaire
  coefficientExploitation: number | null;
  coutRisqueSurPNB: number | null;
  // Croissance
  croissanceCA: number | null;
  croissanceVA: number | null;
  croissanceRNet: number | null;
  croissanceRExp: number | null;
  // Solvabilité / structure
  gearing: number | null;
  autonomieFinanciere: number | null;
  autonomieGlobale: number | null;
  capaciteRemb: number | null;
  levierFinancier: number | null;
  solvabilite: number | null;
  // Liquidité
  liquiditeGenerale: number | null;
  liquiditeReduite: number | null;
  liquiditeImmediate: number | null;
  // Activité
  rotationActif: number | null;
  rotationStocks: number | null;
  rotationClients: number | null;
  rotationFournisseurs: number | null;
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
  // Valorisation
  priceToBook: number | null; // capi / capitaux propres
  per: number | null;
  bpa: number | null;
  tauxDistribution: number | null;
  dividendYield: number | null;
  capiSurCA: number | null;
};

/**
 * Construit un snapshot agrégé sur les `window` derniers exercices avec activité.
 * - window=1 : valeurs du dernier exercice
 * - window>1 : moyenne arithmétique des valeurs disponibles sur les N derniers
 *   exercices (les nulls sont ignorés ; si aucune valeur n'est disponible pour
 *   un ratio, le résultat est null pour ce ratio).
 */
function buildSnapshotForWindow(
  ticker: string,
  formatEtats: FormatEtats,
  window: number
): FundScreenerSnapshot | null {
  const all = getRatiosByTicker(ticker).filter((r) => r.ca !== 0 || r.totalActif !== 0);
  if (all.length === 0) return null;
  const slice = all.slice(-window);
  const last = slice[slice.length - 1];

  function avg(get: (r: FundRatios) => number | null): number | null {
    const xs: number[] = [];
    for (const r of slice) {
      const v = get(r);
      if (v !== null && isFinite(v)) xs.push(v);
    }
    if (xs.length === 0) return null;
    return xs.reduce((s, x) => s + x, 0) / xs.length;
  }

  // Price-to-Book : moyenne des capi/CP par exercice
  const pbValues: number[] = [];
  for (const r of slice) {
    if (r.capitauxPropres > 0 && r.capiBoursiere > 0) {
      pbValues.push(r.capiBoursiere / r.capitauxPropres);
    }
  }
  const priceToBook =
    pbValues.length > 0
      ? pbValues.reduce((s, x) => s + x, 0) / pbValues.length
      : null;

  return {
    ticker,
    formatEtats,
    exercice: last.exercice,
    // Rentabilité
    roe: avg((r) => r.roe),
    roa: avg((r) => r.roa),
    rentaEconomique: avg((r) => r.rentaEconomique),
    margeBrute: avg((r) => r.margeBrute),
    margeOperationnelle: avg((r) => r.margeOperationnelle),
    margeVA: avg((r) => r.margeVA),
    margeNette: avg((r) => r.margeNette),
    // Bancaire
    coefficientExploitation: avg((r) => r.coefficientExploitation),
    coutRisqueSurPNB: avg((r) => r.coutRisqueSurPNB),
    // Croissance
    croissanceCA: avg((r) => r.croissanceCA),
    croissanceVA: avg((r) => r.croissanceVA),
    croissanceRNet: avg((r) => r.croissanceRNet),
    croissanceRExp: avg((r) => r.croissanceRExp),
    // Solvabilité / structure
    gearing: avg((r) => r.gearing),
    autonomieFinanciere: avg((r) => r.autonomieFinanciere),
    autonomieGlobale: avg((r) => r.autonomieGlobale),
    capaciteRemb: avg((r) => r.capaciteRemb),
    levierFinancier: avg((r) => r.levierFinancier),
    solvabilite: avg((r) => r.solvabilite),
    // Liquidité
    liquiditeGenerale: avg((r) => r.liquiditeGenerale),
    liquiditeReduite: avg((r) => r.liquiditeReduite),
    liquiditeImmediate: avg((r) => r.liquiditeImmediate),
    // Activité
    rotationActif: avg((r) => r.rotationActif),
    rotationStocks: avg((r) => r.rotationStocks),
    rotationClients: avg((r) => r.rotationClients),
    rotationFournisseurs: avg((r) => r.rotationFournisseurs),
    // Couverture / financement
    financementImmo: avg((r) => r.financementImmo),
    couvertureCapInvestis: avg((r) => r.couvertureCapInvestis),
    couvertureCapInvestis2: avg((r) => r.couvertureCapInvestis2),
    tauxAutofinancement: avg((r) => r.tauxAutofinancement),
    // Répartition VA
    remTravail: avg((r) => r.remTravail),
    remPreteurs: avg((r) => r.remPreteurs),
    remEtat: avg((r) => r.remEtat),
    autoRemuneration: avg((r) => r.autoRemuneration),
    remActionnaires: avg((r) => r.remActionnaires),
    // Valorisation
    priceToBook,
    per: avg((r) => r.per),
    bpa: avg((r) => r.bpa),
    tauxDistribution: avg((r) => r.tauxDistribution),
    dividendYield: avg((r) => r.dividendYield),
    capiSurCA: avg((r) => r.capiSurCA),
  };
}

export type FundWindow = 1 | 2 | 3 | 4 | 5;
export const FUND_WINDOWS: FundWindow[] = [1, 2, 3, 4, 5];

/** Snapshots multi-fenêtres : pour chaque ticker, snapshot par fenêtre temporelle. */
export function loadFundScreenerSnapshotsMulti(): Map<
  string,
  Record<FundWindow, FundScreenerSnapshot | null>
> {
  const result = new Map<string, Record<FundWindow, FundScreenerSnapshot | null>>();
  const titres = loadFundTitres();
  for (const t of titres) {
    const ratios = getRatiosByTicker(t.ticker);
    if (ratios.length === 0) continue;
    const formatEtats = ratios[ratios.length - 1].formatEtats;
    const byWindow = {
      1: buildSnapshotForWindow(t.ticker, formatEtats, 1),
      2: buildSnapshotForWindow(t.ticker, formatEtats, 2),
      3: buildSnapshotForWindow(t.ticker, formatEtats, 3),
      4: buildSnapshotForWindow(t.ticker, formatEtats, 4),
      5: buildSnapshotForWindow(t.ticker, formatEtats, 5),
    } as Record<FundWindow, FundScreenerSnapshot | null>;
    result.set(t.ticker, byWindow);
  }
  return result;
}

export function loadFundScreenerSnapshots(): Map<string, FundScreenerSnapshot> {
  const result = new Map<string, FundScreenerSnapshot>();
  const titres = loadFundTitres();
  for (const t of titres) {
    const r = getLatestRatios(t.ticker);
    if (!r) continue;
    const pb =
      r.capitauxPropres > 0 && r.capiBoursiere > 0
        ? r.capiBoursiere / r.capitauxPropres
        : null;
    result.set(t.ticker, {
      ticker: t.ticker,
      formatEtats: r.formatEtats,
      exercice: r.exercice,
      // Rentabilité
      roe: r.roe,
      roa: r.roa,
      rentaEconomique: r.rentaEconomique,
      margeBrute: r.margeBrute,
      margeOperationnelle: r.margeOperationnelle,
      margeVA: r.margeVA,
      margeNette: r.margeNette,
      // Bancaire
      coefficientExploitation: r.coefficientExploitation,
      coutRisqueSurPNB: r.coutRisqueSurPNB,
      // Croissance
      croissanceCA: r.croissanceCA,
      croissanceVA: r.croissanceVA,
      croissanceRNet: r.croissanceRNet,
      croissanceRExp: r.croissanceRExp,
      // Solvabilité / structure
      gearing: r.gearing,
      autonomieFinanciere: r.autonomieFinanciere,
      autonomieGlobale: r.autonomieGlobale,
      capaciteRemb: r.capaciteRemb,
      levierFinancier: r.levierFinancier,
      solvabilite: r.solvabilite,
      // Liquidité
      liquiditeGenerale: r.liquiditeGenerale,
      liquiditeReduite: r.liquiditeReduite,
      liquiditeImmediate: r.liquiditeImmediate,
      // Activité
      rotationActif: r.rotationActif,
      rotationStocks: r.rotationStocks,
      rotationClients: r.rotationClients,
      rotationFournisseurs: r.rotationFournisseurs,
      // Couverture / financement
      financementImmo: r.financementImmo,
      couvertureCapInvestis: r.couvertureCapInvestis,
      couvertureCapInvestis2: r.couvertureCapInvestis2,
      tauxAutofinancement: r.tauxAutofinancement,
      // Répartition de la VA
      remTravail: r.remTravail,
      remPreteurs: r.remPreteurs,
      remEtat: r.remEtat,
      autoRemuneration: r.autoRemuneration,
      remActionnaires: r.remActionnaires,
      // Valorisation
      priceToBook: pb,
      per: r.per,
      bpa: r.bpa,
      tauxDistribution: r.tauxDistribution,
      dividendYield: r.dividendYield,
      capiSurCA: r.capiSurCA,
    });
  }
  return result;
}

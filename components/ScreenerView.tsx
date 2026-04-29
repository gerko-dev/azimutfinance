"use client";

import { useState, useMemo, useDeferredValue } from "react";
import Link from "next/link";
import CountryFlag from "./CountryFlag";
import type { ActionRow } from "@/lib/dataLoader";
import type { Quadrant } from "@/lib/stockStats";
import type { FundScreenerSnapshot, FundWindow } from "@/lib/fundamentals";

type EnrichedStock = ActionRow & {
  volatility: number | null;
  quadrant: Quadrant | null;
  yearChange: number | null; // décimal — calculé à partir de l'historique de prix
  avgVolume: number | null; // volume moyen 30 séances
  fundByWindow: Record<FundWindow, FundScreenerSnapshot | null> | null;
};

type Props = {
  stocks: EnrichedStock[];
};

const QUADRANT_LABELS: Record<Quadrant, { emoji: string; name: string; pill: string }> = {
  cashcow: {
    emoji: "🎯",
    name: "Cash cow",
    pill: "border-green-200 bg-green-50 text-green-800",
  },
  hiddengem: {
    emoji: "💎",
    name: "Hidden gem",
    pill: "border-purple-200 bg-purple-50 text-purple-800",
  },
  defensive: {
    emoji: "🛡️",
    name: "Defensive",
    pill: "border-blue-200 bg-blue-50 text-blue-800",
  },
  speculative: {
    emoji: "⚡",
    name: "Spéculative",
    pill: "border-amber-200 bg-amber-50 text-amber-800",
  },
};

const PAGE_SIZE = 20;

type SortKey =
  | "code"
  | "price"
  | "changePercent"
  | "capitalization"
  | "yieldPct"
  | "volatility"
  | "roe"
  | "margeNette"
  | "croissanceCA";
type SortOrder = "asc" | "desc";

type Preset = "value" | "quality" | "growth" | "dividende";

const PRESETS: Record<
  Preset,
  { emoji: string; name: string; desc: string; pill: string }
> = {
  value: {
    emoji: "🏷️",
    name: "Value",
    desc: "PER < 10 et ROE > 8%",
    pill: "border-blue-200 bg-blue-50 text-blue-800",
  },
  quality: {
    emoji: "🏆",
    name: "Quality",
    desc: "ROE > 15% et marge nette > 10%",
    pill: "border-purple-200 bg-purple-50 text-purple-800",
  },
  growth: {
    emoji: "🚀",
    name: "Growth",
    desc: "Croissance CA > 10% et résultat net > 0",
    pill: "border-amber-200 bg-amber-50 text-amber-800",
  },
  dividende: {
    emoji: "💰",
    name: "Dividende",
    desc: "Yield > 5%",
    pill: "border-green-200 bg-green-50 text-green-800",
  },
};

// === Critères de marché disponibles ===
// `unit` distingue ce que l'utilisateur saisit / ce qui est stocké :
// - "fcfa" : FCFA brut (cours, volume)
// - "mds-fcfa" : milliards de FCFA (capi)
// - "pct-direct" : déjà en %, saisie en %
// - "pct-decimal" : stocké en décimal, saisie en %

type MarketKey =
  | "price"
  | "capitalization"
  | "yieldPct"
  | "yearChange"
  | "volatility"
  | "avgVolume";

type MarketCriterion = {
  label: string;
  unit: "fcfa" | "mds-fcfa" | "pct-direct" | "pct-decimal";
  hint?: string;
  getValue: (s: EnrichedStock) => number | null;
};

const MARKET_CRITERIA: Record<MarketKey, MarketCriterion> = {
  price: {
    label: "Cours (FCFA)",
    unit: "fcfa",
    getValue: (s) => (s.price > 0 ? s.price : null),
  },
  capitalization: {
    label: "Capi (Mds FCFA)",
    unit: "mds-fcfa",
    getValue: (s) => (s.capitalization > 0 ? s.capitalization : null),
  },
  yieldPct: {
    label: "Rendement (%)",
    unit: "pct-direct",
    getValue: (s) => (s.hasYield ? s.yieldPct : null),
  },
  yearChange: {
    label: "Variation 1 an (%)",
    unit: "pct-decimal",
    getValue: (s) => s.yearChange,
  },
  volatility: {
    label: "Volatilité 12 m (%)",
    unit: "pct-direct",
    hint: "Annualisée, log-returns",
    getValue: (s) => s.volatility,
  },
  avgVolume: {
    label: "Volume moyen 30 j",
    unit: "fcfa",
    hint: "Moyenne des 30 dernières séances cotées (titres échangés)",
    getValue: (s) => s.avgVolume,
  },
};

const MARKET_KEYS_ORDER: MarketKey[] = [
  "price",
  "capitalization",
  "yieldPct",
  "yearChange",
  "volatility",
  "avgVolume",
];

type MarketFilter = { key: MarketKey; min: string; max: string };

// === Critères fondamentaux disponibles ===
// `unit: "pct"` : la valeur stockée est en décimal (0.15 = 15%) et l'utilisateur
// saisit en %. `unit: "ratio"` : valeur brute, saisie brute. `unit: "days"` : jours.
// `unit: "fcfa"` : montant en FCFA, saisie brute.
// Le Dividend Yield reste un critère de marché. PER, BPA et autres mesures de
// valorisation sont ici.

type FundKey =
  // Rentabilité (9)
  | "roe"
  | "roa"
  | "rentaEconomique"
  | "margeBrute"
  | "margeOperationnelle"
  | "margeVA"
  | "margeNette"
  | "coefficientExploitation"
  | "coutRisqueSurPNB"
  // Croissance (4)
  | "croissanceCA"
  | "croissanceVA"
  | "croissanceRNet"
  | "croissanceRExp"
  // Solvabilité / structure (6)
  | "gearing"
  | "autonomieFinanciere"
  | "autonomieGlobale"
  | "capaciteRemb"
  | "levierFinancier"
  | "solvabilite"
  // Liquidité (3)
  | "liquiditeGenerale"
  | "liquiditeReduite"
  | "liquiditeImmediate"
  // Activité (4)
  | "rotationActif"
  | "rotationStocks"
  | "rotationClients"
  | "rotationFournisseurs"
  // Couverture / financement (4)
  | "financementImmo"
  | "couvertureCapInvestis"
  | "couvertureCapInvestis2"
  | "tauxAutofinancement"
  // Répartition de la valeur ajoutée (5)
  | "remTravail"
  | "remPreteurs"
  | "remEtat"
  | "autoRemuneration"
  | "remActionnaires"
  // Valorisation (5)
  | "per"
  | "bpa"
  | "priceToBook"
  | "capiSurCA"
  | "tauxDistribution";

type FundCategory =
  | "Rentabilité"
  | "Croissance"
  | "Solvabilité"
  | "Liquidité"
  | "Activité"
  | "Couverture"
  | "Répartition VA"
  | "Valorisation";

type FundCriterion = {
  label: string;
  unit: "pct" | "ratio" | "days" | "fcfa";
  category: FundCategory;
  hint?: string;
  getValue: (f: FundScreenerSnapshot) => number | null;
};

const FUND_CRITERIA: Record<FundKey, FundCriterion> = {
  // Rentabilité
  roe: {
    label: "ROE",
    unit: "pct",
    category: "Rentabilité",
    hint: "Résultat net / capitaux propres",
    getValue: (f) => f.roe,
  },
  roa: {
    label: "ROA",
    unit: "pct",
    category: "Rentabilité",
    hint: "Résultat net / total actif",
    getValue: (f) => f.roa,
  },
  rentaEconomique: {
    label: "Rentabilité économique",
    unit: "pct",
    category: "Rentabilité",
    hint: "Résultat d'exploitation / capitaux investis",
    getValue: (f) => f.rentaEconomique,
  },
  margeBrute: {
    label: "Marge brute",
    unit: "pct",
    category: "Rentabilité",
    getValue: (f) => f.margeBrute,
  },
  margeOperationnelle: {
    label: "Marge opérationnelle",
    unit: "pct",
    category: "Rentabilité",
    getValue: (f) => f.margeOperationnelle,
  },
  margeVA: {
    label: "Marge sur valeur ajoutée",
    unit: "pct",
    category: "Rentabilité",
    hint: "Valeur ajoutée / CA",
    getValue: (f) => f.margeVA,
  },
  margeNette: {
    label: "Marge nette",
    unit: "pct",
    category: "Rentabilité",
    getValue: (f) => f.margeNette,
  },
  coefficientExploitation: {
    label: "Coefficient d'exploitation",
    unit: "pct",
    category: "Rentabilité",
    hint: "Bancaire — charges / PNB",
    getValue: (f) => f.coefficientExploitation,
  },
  coutRisqueSurPNB: {
    label: "Coût du risque / PNB",
    unit: "pct",
    category: "Rentabilité",
    hint: "Bancaire",
    getValue: (f) => f.coutRisqueSurPNB,
  },
  // Croissance
  croissanceCA: {
    label: "Croissance CA",
    unit: "pct",
    category: "Croissance",
    hint: "Vs N-1",
    getValue: (f) => f.croissanceCA,
  },
  croissanceVA: {
    label: "Croissance valeur ajoutée",
    unit: "pct",
    category: "Croissance",
    hint: "Vs N-1",
    getValue: (f) => f.croissanceVA,
  },
  croissanceRNet: {
    label: "Croissance résultat net",
    unit: "pct",
    category: "Croissance",
    hint: "Vs N-1",
    getValue: (f) => f.croissanceRNet,
  },
  croissanceRExp: {
    label: "Croissance résultat d'expl.",
    unit: "pct",
    category: "Croissance",
    hint: "Vs N-1",
    getValue: (f) => f.croissanceRExp,
  },
  // Solvabilité
  gearing: {
    label: "Gearing",
    unit: "pct",
    category: "Solvabilité",
    hint: "Dettes financières / capitaux propres",
    getValue: (f) => f.gearing,
  },
  autonomieFinanciere: {
    label: "Autonomie financière",
    unit: "ratio",
    category: "Solvabilité",
    hint: "Capitaux propres / dettes financières",
    getValue: (f) => f.autonomieFinanciere,
  },
  autonomieGlobale: {
    label: "Autonomie globale",
    unit: "ratio",
    category: "Solvabilité",
    hint: "Capitaux propres / total ressources",
    getValue: (f) => f.autonomieGlobale,
  },
  capaciteRemb: {
    label: "Capacité de remboursement",
    unit: "ratio",
    category: "Solvabilité",
    hint: "Dettes financières / CAFG (en années)",
    getValue: (f) => f.capaciteRemb,
  },
  levierFinancier: {
    label: "Levier financier",
    unit: "ratio",
    category: "Solvabilité",
    hint: "Total actif / capitaux propres",
    getValue: (f) => f.levierFinancier,
  },
  solvabilite: {
    label: "Solvabilité",
    unit: "pct",
    category: "Solvabilité",
    hint: "Capitaux propres / total bilan",
    getValue: (f) => f.solvabilite,
  },
  // Liquidité
  liquiditeGenerale: {
    label: "Liquidité générale",
    unit: "ratio",
    category: "Liquidité",
    hint: "Actif circulant / passif circulant",
    getValue: (f) => f.liquiditeGenerale,
  },
  liquiditeReduite: {
    label: "Liquidité réduite",
    unit: "ratio",
    category: "Liquidité",
    hint: "(Créances + trésorerie) / passif circulant",
    getValue: (f) => f.liquiditeReduite,
  },
  liquiditeImmediate: {
    label: "Liquidité immédiate",
    unit: "ratio",
    category: "Liquidité",
    hint: "Trésorerie / passif circulant",
    getValue: (f) => f.liquiditeImmediate,
  },
  // Activité
  rotationActif: {
    label: "Rotation de l'actif",
    unit: "ratio",
    category: "Activité",
    hint: "CA / total actif",
    getValue: (f) => f.rotationActif,
  },
  rotationStocks: {
    label: "Rotation des stocks",
    unit: "days",
    category: "Activité",
    getValue: (f) => f.rotationStocks,
  },
  rotationClients: {
    label: "Délai clients",
    unit: "days",
    category: "Activité",
    getValue: (f) => f.rotationClients,
  },
  rotationFournisseurs: {
    label: "Délai fournisseurs",
    unit: "days",
    category: "Activité",
    getValue: (f) => f.rotationFournisseurs,
  },
  // Couverture
  financementImmo: {
    label: "Financement des immobilisations",
    unit: "ratio",
    category: "Couverture",
    hint: "Ressources stables / actif immobilisé",
    getValue: (f) => f.financementImmo,
  },
  couvertureCapInvestis: {
    label: "Couverture des capitaux investis",
    unit: "ratio",
    category: "Couverture",
    getValue: (f) => f.couvertureCapInvestis,
  },
  couvertureCapInvestis2: {
    label: "Couverture des capitaux investis (2)",
    unit: "ratio",
    category: "Couverture",
    getValue: (f) => f.couvertureCapInvestis2,
  },
  tauxAutofinancement: {
    label: "Taux d'autofinancement",
    unit: "ratio",
    category: "Couverture",
    hint: "CAFG / investissements",
    getValue: (f) => f.tauxAutofinancement,
  },
  // Répartition de la valeur ajoutée
  remTravail: {
    label: "Rémunération du travail",
    unit: "pct",
    category: "Répartition VA",
    hint: "Charges de personnel / VA",
    getValue: (f) => f.remTravail,
  },
  remPreteurs: {
    label: "Rémunération des prêteurs",
    unit: "pct",
    category: "Répartition VA",
    hint: "Frais financiers / VA",
    getValue: (f) => f.remPreteurs,
  },
  remEtat: {
    label: "Rémunération de l'État",
    unit: "pct",
    category: "Répartition VA",
    hint: "Impôts et taxes / VA",
    getValue: (f) => f.remEtat,
  },
  autoRemuneration: {
    label: "Auto-rémunération",
    unit: "pct",
    category: "Répartition VA",
    hint: "Part conservée par l'entreprise / VA",
    getValue: (f) => f.autoRemuneration,
  },
  remActionnaires: {
    label: "Rémunération des actionnaires",
    unit: "pct",
    category: "Répartition VA",
    hint: "Dividendes versés / VA",
    getValue: (f) => f.remActionnaires,
  },
  // Valorisation
  per: {
    label: "PER",
    unit: "ratio",
    category: "Valorisation",
    hint: "Cours fin d'exercice / BPA",
    getValue: (f) => f.per,
  },
  bpa: {
    label: "BPA",
    unit: "fcfa",
    category: "Valorisation",
    hint: "Bénéfice par action (FCFA)",
    getValue: (f) => f.bpa,
  },
  priceToBook: {
    label: "Price-to-Book",
    unit: "ratio",
    category: "Valorisation",
    hint: "Capitalisation / capitaux propres",
    getValue: (f) => f.priceToBook,
  },
  capiSurCA: {
    label: "Capi / CA (P/Sales)",
    unit: "ratio",
    category: "Valorisation",
    getValue: (f) => f.capiSurCA,
  },
  tauxDistribution: {
    label: "Taux de distribution",
    unit: "pct",
    category: "Valorisation",
    hint: "Dividendes / résultat net",
    getValue: (f) => f.tauxDistribution,
  },
};

const FUND_KEYS_ORDER: FundKey[] = [
  // Rentabilité (9)
  "roe",
  "roa",
  "rentaEconomique",
  "margeBrute",
  "margeOperationnelle",
  "margeVA",
  "margeNette",
  "coefficientExploitation",
  "coutRisqueSurPNB",
  // Croissance (4)
  "croissanceCA",
  "croissanceVA",
  "croissanceRNet",
  "croissanceRExp",
  // Solvabilité (6)
  "gearing",
  "autonomieFinanciere",
  "autonomieGlobale",
  "capaciteRemb",
  "levierFinancier",
  "solvabilite",
  // Liquidité (3)
  "liquiditeGenerale",
  "liquiditeReduite",
  "liquiditeImmediate",
  // Activité (4)
  "rotationActif",
  "rotationStocks",
  "rotationClients",
  "rotationFournisseurs",
  // Couverture (4)
  "financementImmo",
  "couvertureCapInvestis",
  "couvertureCapInvestis2",
  "tauxAutofinancement",
  // Répartition VA (5)
  "remTravail",
  "remPreteurs",
  "remEtat",
  "autoRemuneration",
  "remActionnaires",
  // Valorisation (5)
  "per",
  "bpa",
  "priceToBook",
  "capiSurCA",
  "tauxDistribution",
];

type FundFilter = { key: FundKey; min: string; max: string };

function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatBigFCFA(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2).replace(".", ",") + " T";
  if (value >= 1e9) return (value / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (value >= 1e6) return (value / 1e6).toFixed(0) + " M";
  return formatFCFA(value);
}

/** Parse "12,5" ou "12.5" en nombre, retourne null si vide ou invalide */
function parseFloatLoose(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return isFinite(n) ? n : null;
}

function fmtPctRow(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  return `${(v * 100).toFixed(1).replace(".", ",")}%`;
}

function pctColor(v: number | null): string {
  if (v === null || !isFinite(v) || v === 0) return "text-slate-700";
  return v > 0 ? "text-green-700" : "text-red-700";
}

export default function ScreenerView({ stocks }: Props) {
  // === FILTRES ===
  const [search, setSearch] = useState("");
  const [sectorsSel, setSectorsSel] = useState<Set<string>>(new Set());
  const [countriesSel, setCountriesSel] = useState<Set<string>>(new Set());
  const [quadrantsSel, setQuadrantsSel] = useState<Set<Quadrant>>(new Set());
  // Critères de marché dynamiques (l'utilisateur ajoute / retire ce qu'il veut)
  const [marketFilters, setMarketFilters] = useState<MarketFilter[]>([]);
  // Filtres fondamentaux dynamiques + fenêtre temporelle (1=dernier, 2-5=moyenne)
  const [fundFilters, setFundFilters] = useState<FundFilter[]>([]);
  const [fundWindow, setFundWindow] = useState<FundWindow>(1);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);

  // Colonnes fondamentales optionnelles
  const [showFundCols, setShowFundCols] = useState(false);

  // === TRI ET PAGINATION ===
  const [sortKey, setSortKey] = useState<SortKey>("capitalization");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // === DEFERRED ===
  const deferredSearch = useDeferredValue(search);
  const deferredMarketFilters = useDeferredValue(marketFilters);
  const deferredFundFilters = useDeferredValue(fundFilters);
  const deferredFundWindow = useDeferredValue(fundWindow);

  const availableSectors = useMemo(
    () => Array.from(new Set(stocks.map((s) => s.sector).filter(Boolean))).sort(),
    [stocks]
  );
  const availableCountries = useMemo(
    () => Array.from(new Set(stocks.map((s) => s.country).filter(Boolean))).sort(),
    [stocks]
  );

  function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function resetFilters() {
    setSearch("");
    setSectorsSel(new Set());
    setCountriesSel(new Set());
    setQuadrantsSel(new Set());
    setMarketFilters([]);
    setFundFilters([]);
    setFundWindow(1);
    setActivePreset(null);
    setCurrentPage(1);
  }

  function addMarketFilter(key: MarketKey) {
    setMarketFilters((prev) => {
      if (prev.some((f) => f.key === key)) return prev;
      return [...prev, { key, min: "", max: "" }];
    });
    setCurrentPage(1);
  }
  function removeMarketFilter(key: MarketKey) {
    setMarketFilters((prev) => prev.filter((f) => f.key !== key));
    setActivePreset(null);
    setCurrentPage(1);
  }
  function updateMarketFilter(
    key: MarketKey,
    field: "min" | "max",
    value: string
  ) {
    setMarketFilters((prev) =>
      prev.map((f) => (f.key === key ? { ...f, [field]: value } : f))
    );
    setActivePreset(null);
    setCurrentPage(1);
  }

  function addFundFilter(key: FundKey, min = "", max = "") {
    setFundFilters((prev) => {
      if (prev.some((f) => f.key === key)) return prev;
      return [...prev, { key, min, max }];
    });
  }

  function removeFundFilter(key: FundKey) {
    setFundFilters((prev) => prev.filter((f) => f.key !== key));
    setActivePreset(null);
    setCurrentPage(1);
  }

  function updateFundFilter(key: FundKey, field: "min" | "max", value: string) {
    setFundFilters((prev) =>
      prev.map((f) => (f.key === key ? { ...f, [field]: value } : f))
    );
    setActivePreset(null);
    setCurrentPage(1);
  }

  function applyPreset(p: Preset) {
    // Toggle off si déjà actif → reset les filtres posés par le preset
    if (activePreset === p) {
      setActivePreset(null);
      setFundFilters([]);
      setMarketFilters([]);
      setCurrentPage(1);
      return;
    }
    setActivePreset(p);
    let funds: FundFilter[] = [];
    let market: MarketFilter[] = [];

    if (p === "value") {
      funds = [
        { key: "per", min: "", max: "10" },
        { key: "roe", min: "8", max: "" },
      ];
    } else if (p === "quality") {
      funds = [
        { key: "roe", min: "15", max: "" },
        { key: "margeNette", min: "10", max: "" },
      ];
    } else if (p === "growth") {
      funds = [
        { key: "croissanceCA", min: "10", max: "" },
        { key: "croissanceRNet", min: "0", max: "" },
      ];
    } else if (p === "dividende") {
      market = [{ key: "yieldPct", min: "5", max: "" }];
    }
    setFundFilters(funds);
    setMarketFilters(market);
    setShowFundCols(true);
    setCurrentPage(1);
  }

  const hasAnyFundInput = deferredFundFilters.some(
    (f) => f.min.trim() !== "" || f.max.trim() !== ""
  );
  const hasAnyMarketInput = deferredMarketFilters.some(
    (f) => f.min.trim() !== "" || f.max.trim() !== ""
  );

  const hasAnyFilter =
    !!deferredSearch ||
    sectorsSel.size > 0 ||
    countriesSel.size > 0 ||
    quadrantsSel.size > 0 ||
    hasAnyMarketInput ||
    hasAnyFundInput ||
    activePreset !== null;

  // === FILTRAGE + TRI ===
  const processed = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();

    // Pré-parse des bornes des filtres marché (saisie convertie selon l'unité du critère).
    type ParsedMarketFilter = {
      key: MarketKey;
      min: number | null;
      max: number | null;
      criterion: MarketCriterion;
    };
    const parsedMarketFilters: ParsedMarketFilter[] = deferredMarketFilters
      .map((f) => {
        const c = MARKET_CRITERIA[f.key];
        const minN = parseFloatLoose(f.min);
        const maxN = parseFloatLoose(f.max);
        // unit → facteur appliqué à la saisie pour comparer à la donnée stockée
        let scale = 1;
        if (c.unit === "mds-fcfa") scale = 1e9;
        else if (c.unit === "pct-decimal") scale = 0.01;
        return {
          key: f.key,
          min: minN === null ? null : minN * scale,
          max: maxN === null ? null : maxN * scale,
          criterion: c,
        };
      })
      .filter((f) => f.min !== null || f.max !== null);

    // Pré-parse les bornes des filtres fondamentaux. Pour `unit: "pct"`, l'utilisateur
    // saisit en % et la donnée est en décimal → on divise la borne par 100.
    type ParsedFundFilter = {
      key: FundKey;
      min: number | null;
      max: number | null;
      criterion: FundCriterion;
    };
    const parsedFundFilters: ParsedFundFilter[] = deferredFundFilters
      .map((f) => {
        const c = FUND_CRITERIA[f.key];
        const minN = parseFloatLoose(f.min);
        const maxN = parseFloatLoose(f.max);
        // % en saisie → décimal en stockage. Ratios et jours : pas de conversion.
        const scale = c.unit === "pct" ? 0.01 : 1;
        return {
          key: f.key,
          min: minN === null ? null : minN * scale,
          max: maxN === null ? null : maxN * scale,
          criterion: c,
        };
      })
      .filter((f) => f.min !== null || f.max !== null);

    const filtered = stocks.filter((s) => {
      if (q) {
        if (
          !s.code.toLowerCase().includes(q) &&
          !s.name.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (sectorsSel.size > 0 && !sectorsSel.has(s.sector)) return false;
      if (countriesSel.size > 0 && !countriesSel.has(s.country)) return false;
      if (quadrantsSel.size > 0) {
        if (!s.quadrant || !quadrantsSel.has(s.quadrant)) return false;
      }
      // Filtres marché dynamiques
      for (const f of parsedMarketFilters) {
        const v = f.criterion.getValue(s);
        if (v === null) return false;
        if (f.min !== null && v < f.min) return false;
        if (f.max !== null && v > f.max) return false;
      }

      // Filtres fondamentaux dynamiques : on lit dans le snapshot de la fenêtre
      // sélectionnée (1 = dernier exercice ; 2-5 = moyenne sur N ans).
      const fund = s.fundByWindow ? s.fundByWindow[deferredFundWindow] : null;
      for (const f of parsedFundFilters) {
        if (!fund) return false;
        const v = f.criterion.getValue(fund);
        if (v === null) return false;
        if (f.min !== null && v < f.min) return false;
        if (f.max !== null && v > f.max) return false;
      }
      return true;
    });

    function fundOf(s: EnrichedStock) {
      return s.fundByWindow ? s.fundByWindow[deferredFundWindow] : null;
    }

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "code":
          cmp = a.code.localeCompare(b.code);
          break;
        case "price":
          cmp = a.price - b.price;
          break;
        case "changePercent":
          cmp = a.changePercent - b.changePercent;
          break;
        case "capitalization":
          cmp = a.capitalization - b.capitalization;
          break;
        case "yieldPct":
          cmp =
            (a.hasYield ? a.yieldPct : -Infinity) -
            (b.hasYield ? b.yieldPct : -Infinity);
          break;
        case "volatility":
          cmp = (a.volatility ?? -Infinity) - (b.volatility ?? -Infinity);
          break;
        case "roe":
          cmp = (fundOf(a)?.roe ?? -Infinity) - (fundOf(b)?.roe ?? -Infinity);
          break;
        case "margeNette":
          cmp =
            (fundOf(a)?.margeNette ?? -Infinity) -
            (fundOf(b)?.margeNette ?? -Infinity);
          break;
        case "croissanceCA":
          cmp =
            (fundOf(a)?.croissanceCA ?? -Infinity) -
            (fundOf(b)?.croissanceCA ?? -Infinity);
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [
    stocks,
    deferredSearch,
    sectorsSel,
    countriesSel,
    quadrantsSel,
    deferredMarketFilters,
    deferredFundFilters,
    deferredFundWindow,
    sortKey,
    sortOrder,
  ]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return processed.slice(start, start + PAGE_SIZE);
  }, [processed, currentPage, totalPages]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span className="text-slate-300">↕</span>;
    return sortOrder === "asc" ? <span>↑</span> : <span>↓</span>;
  }

  const effectivePage = Math.min(currentPage, totalPages);
  const fundCount = stocks.filter((s) => s.fundByWindow !== null).length;

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-4 md:space-y-6">
        {/* === PRÉSETS === */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
            Présets fondamentaux
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PRESETS) as Preset[]).map((p) => {
              const info = PRESETS[p];
              const active = activePreset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`text-xs md:text-sm px-3 py-1.5 rounded-full border transition ${
                    active
                      ? info.pill
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  title={info.desc}
                >
                  {info.emoji} <span className="font-medium">{info.name}</span>
                  <span className="ml-2 text-[11px] opacity-80">
                    {info.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* === FILTRES === */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 space-y-4">
          {/* Recherche */}
          <input
            type="text"
            placeholder="Rechercher par code ou nom..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
          />

          {/* Multi-select pills : Secteur / Pays / Quadrant */}
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">
                Secteur {sectorsSel.size > 0 && `(${sectorsSel.size})`}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {availableSectors.map((s) => {
                  const active = sectorsSel.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSectorsSel(toggleInSet(sectorsSel, s));
                        setCurrentPage(1);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        active
                          ? "border-blue-300 bg-blue-50 text-blue-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">
                Pays {countriesSel.size > 0 && `(${countriesSel.size})`}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {availableCountries.map((c) => {
                  const active = countriesSel.has(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCountriesSel(toggleInSet(countriesSel, c));
                        setCurrentPage(1);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition inline-flex items-center gap-1.5 ${
                        active
                          ? "border-blue-300 bg-blue-50 text-blue-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <CountryFlag country={c} size={12} />
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">
                Quadrant {quadrantsSel.size > 0 && `(${quadrantsSel.size})`}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(Object.keys(QUADRANT_LABELS) as Quadrant[]).map((q) => {
                  const active = quadrantsSel.has(q);
                  const info = QUADRANT_LABELS[q];
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setQuadrantsSel(toggleInSet(quadrantsSel, q));
                        setCurrentPage(1);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        active
                          ? info.pill
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {info.emoji} {info.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Filtres marché dynamiques */}
          <div>
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Critères de marché
              </div>
              <MarketCriterionPicker
                activeKeys={marketFilters.map((f) => f.key)}
                onAdd={addMarketFilter}
              />
            </div>

            {marketFilters.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-2">
                Aucun critère de marché sélectionné. Ajoutes-en via le menu
                à droite.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {marketFilters.map((f) => {
                  const c = MARKET_CRITERIA[f.key];
                  return (
                    <div
                      key={f.key}
                      className="border border-slate-200 rounded-md p-2.5 bg-slate-50/40"
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-700 truncate">
                            {c.label}
                          </div>
                          {c.hint && (
                            <div className="text-[10px] text-slate-400 truncate">
                              {c.hint}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMarketFilter(f.key)}
                          aria-label={`Retirer ${c.label}`}
                          className="text-xs text-slate-400 hover:text-red-600 px-1"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="min"
                          value={f.min}
                          onChange={(e) =>
                            updateMarketFilter(f.key, "min", e.target.value)
                          }
                          className="w-full min-w-0 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500 bg-white"
                        />
                        <span className="text-slate-400 text-xs">—</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="max"
                          value={f.max}
                          onChange={(e) =>
                            updateMarketFilter(f.key, "max", e.target.value)
                          }
                          className="w-full min-w-0 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500 bg-white"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Filtres fondamentaux dynamiques : l'utilisateur ajoute / retire les critères */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Critères fondamentaux
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[11px] text-slate-500">Période</label>
                <select
                  value={fundWindow}
                  onChange={(e) => {
                    setFundWindow(Number(e.target.value) as FundWindow);
                    setActivePreset(null);
                    setCurrentPage(1);
                  }}
                  className="text-xs px-2 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
                  title="Fenêtre temporelle pour les ratios fondamentaux"
                >
                  <option value={1}>Dernier exercice</option>
                  <option value={2}>Moyenne 2 ans</option>
                  <option value={3}>Moyenne 3 ans</option>
                  <option value={4}>Moyenne 4 ans</option>
                  <option value={5}>Moyenne 5 ans</option>
                </select>
                <FundCriterionPicker
                  activeKeys={fundFilters.map((f) => f.key)}
                  onAdd={(key) => {
                    addFundFilter(key);
                    setActivePreset(null);
                    setShowFundCols(true);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>

            {fundFilters.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-2">
                Aucun critère fondamental sélectionné. Utilise le menu
                « + Ajouter un critère » ou un preset pour démarrer.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {fundFilters.map((f) => {
                  const c = FUND_CRITERIA[f.key];
                  const unitSuffix =
                    c.unit === "pct"
                      ? " (%)"
                      : c.unit === "days"
                      ? " (jours)"
                      : "";
                  return (
                    <div
                      key={f.key}
                      className="border border-slate-200 rounded-md p-2.5 bg-slate-50/40"
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-700 truncate">
                            {c.label}
                            {unitSuffix}
                          </div>
                          {c.hint && (
                            <div className="text-[10px] text-slate-400 truncate">
                              {c.hint}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFundFilter(f.key)}
                          aria-label={`Retirer ${c.label}`}
                          className="text-xs text-slate-400 hover:text-red-600 px-1"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="min"
                          value={f.min}
                          onChange={(e) =>
                            updateFundFilter(f.key, "min", e.target.value)
                          }
                          className="w-full min-w-0 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500 bg-white"
                        />
                        <span className="text-slate-400 text-xs">—</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="max"
                          value={f.max}
                          onChange={(e) =>
                            updateFundFilter(f.key, "max", e.target.value)
                          }
                          className="w-full min-w-0 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500 bg-white"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reset + count */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100">
            <div className="text-sm text-slate-600">
              <strong>{processed.length}</strong> action
              {processed.length > 1 ? "s" : ""} sur {stocks.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFundCols(!showFundCols)}
                aria-pressed={showFundCols}
                className={`text-xs px-3 py-1.5 border rounded-md transition ${
                  showFundCols
                    ? "border-blue-300 bg-blue-50 text-blue-800"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                {showFundCols ? "✓ Colonnes fondamentaux" : "+ Colonnes fondamentaux"}
              </button>
              {hasAnyFilter && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  ↺ Reset
                </button>
              )}
            </div>
          </div>
        </section>

        {/* === TABLEAU === */}
        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("code")}
                      className="flex items-center gap-1 hover:text-slate-900"
                    >
                      Code {sortIcon("code")}
                    </button>
                  </th>
                  <th className="text-left px-3 py-3 font-medium">Société</th>
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">
                    Secteur
                  </th>
                  <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">
                    Pays
                  </th>
                  <th className="text-right px-3 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("price")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Cours {sortIcon("price")}
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("changePercent")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Var % {sortIcon("changePercent")}
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium hidden md:table-cell">
                    <button
                      onClick={() => toggleSort("capitalization")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Capi {sortIcon("capitalization")}
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">
                    <button
                      onClick={() => toggleSort("yieldPct")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Rdt {sortIcon("yieldPct")}
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">
                    <button
                      onClick={() => toggleSort("volatility")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Vol {sortIcon("volatility")}
                    </button>
                  </th>
                  {showFundCols && (
                    <>
                      <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">
                        <button
                          onClick={() => toggleSort("roe")}
                          className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                        >
                          ROE {sortIcon("roe")}
                        </button>
                      </th>
                      <th className="text-right px-3 py-3 font-medium hidden xl:table-cell">
                        <button
                          onClick={() => toggleSort("margeNette")}
                          className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                        >
                          Marge nette {sortIcon("margeNette")}
                        </button>
                      </th>
                      <th className="text-right px-3 py-3 font-medium hidden xl:table-cell">
                        <button
                          onClick={() => toggleSort("croissanceCA")}
                          className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                        >
                          Δ CA {sortIcon("croissanceCA")}
                        </button>
                      </th>
                    </>
                  )}
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">
                    Quadrant
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((a) => (
                  <tr
                    key={a.code}
                    className="border-b border-slate-100 hover:bg-blue-50/30 transition"
                  >
                    <td className="px-3 py-3">
                      <Link
                        href={`/titre/${a.code}`}
                        className="font-mono font-medium hover:text-blue-700"
                      >
                        {a.code}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/titre/${a.code}`}
                        className="hover:text-blue-700"
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell text-xs text-slate-600">
                      {a.sector || "—"}
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <CountryFlag country={a.country} size={16} />
                        <span className="text-xs">{a.country}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-medium">
                      {a.price > 0 ? formatFCFA(a.price) : "—"}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-medium ${
                        a.changePercent > 0
                          ? "text-green-700"
                          : a.changePercent < 0
                          ? "text-red-700"
                          : "text-slate-500"
                      }`}
                    >
                      {a.changePercent === 0
                        ? "0,00%"
                        : `${a.changePercent > 0 ? "+" : ""}${a.changePercent
                            .toFixed(2)
                            .replace(".", ",")}%`}
                    </td>
                    <td className="px-3 py-3 text-right text-xs hidden md:table-cell">
                      {a.capitalization > 0
                        ? formatBigFCFA(a.capitalization)
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-right hidden lg:table-cell">
                      {a.hasYield && a.yieldPct > 0
                        ? `${a.yieldPct.toFixed(2).replace(".", ",")}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-right hidden lg:table-cell">
                      {a.volatility !== null
                        ? `${a.volatility.toFixed(1).replace(".", ",")}%`
                        : "—"}
                    </td>
                    {showFundCols && (() => {
                      const f = a.fundByWindow ? a.fundByWindow[deferredFundWindow] : null;
                      return (
                        <>
                          <td className="px-3 py-3 text-right hidden lg:table-cell font-medium">
                            {fmtPctRow(f?.roe ?? null)}
                          </td>
                          <td className="px-3 py-3 text-right hidden xl:table-cell">
                            {fmtPctRow(f?.margeNette ?? null)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right hidden xl:table-cell ${pctColor(
                              f?.croissanceCA ?? null
                            )}`}
                          >
                            {f?.croissanceCA !== null &&
                            f?.croissanceCA !== undefined
                              ? `${f.croissanceCA > 0 ? "+" : ""}${(
                                  f.croissanceCA * 100
                                )
                                  .toFixed(1)
                                  .replace(".", ",")}%`
                              : "—"}
                          </td>
                        </>
                      );
                    })()}
                    <td className="px-3 py-3 hidden md:table-cell">
                      {a.quadrant ? (
                        <span
                          className={`text-xs px-2 py-0.5 rounded border whitespace-nowrap ${
                            QUADRANT_LABELS[a.quadrant].pill
                          }`}
                        >
                          {QUADRANT_LABELS[a.quadrant].emoji}{" "}
                          {QUADRANT_LABELS[a.quadrant].name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {paged.length === 0 && (
              <div className="p-10 text-center text-slate-500">
                Aucune action ne correspond à vos critères
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-100 text-sm">
              <button
                onClick={() => setCurrentPage(Math.max(1, effectivePage - 1))}
                disabled={effectivePage === 1}
                className="px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Précédent
              </button>
              <span className="text-slate-600">
                Page <b>{effectivePage}</b> sur <b>{totalPages}</b>
              </span>
              <button
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, effectivePage + 1))
                }
                disabled={effectivePage === totalPages}
                className="px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suivant →
              </button>
            </div>
          )}
        </section>
      </main>
  );
}

// === Sous-composant : sélecteur de nouveaux critères de marché ===
function MarketCriterionPicker({
  activeKeys,
  onAdd,
}: {
  activeKeys: MarketKey[];
  onAdd: (key: MarketKey) => void;
}) {
  const available = MARKET_KEYS_ORDER.filter((k) => !activeKeys.includes(k));
  if (available.length === 0) {
    return (
      <span className="text-xs text-slate-400 italic">
        Tous les critères sont actifs
      </span>
    );
  }
  return (
    <select
      value=""
      onChange={(e) => {
        const v = e.target.value as MarketKey;
        if (v) onAdd(v);
      }}
      className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white hover:border-blue-400 focus:outline-none focus:border-blue-500"
    >
      <option value="" disabled>
        + Ajouter un critère…
      </option>
      {available.map((k) => (
        <option key={k} value={k}>
          {MARKET_CRITERIA[k].label}
        </option>
      ))}
    </select>
  );
}

// === Sous-composant : sélecteur de nouveaux critères fondamentaux ===
function FundCriterionPicker({
  activeKeys,
  onAdd,
}: {
  activeKeys: FundKey[];
  onAdd: (key: FundKey) => void;
}) {
  const available = FUND_KEYS_ORDER.filter((k) => !activeKeys.includes(k));

  if (available.length === 0) {
    return (
      <span className="text-xs text-slate-400 italic">
        Tous les critères sont actifs
      </span>
    );
  }

  // Regrouper par catégorie en respectant l'ordre dans FUND_KEYS_ORDER
  const grouped = new Map<FundCategory, FundKey[]>();
  for (const k of available) {
    const cat = FUND_CRITERIA[k].category;
    const list = grouped.get(cat) ?? [];
    list.push(k);
    grouped.set(cat, list);
  }

  return (
    <select
      value=""
      onChange={(e) => {
        const v = e.target.value as FundKey;
        if (v) onAdd(v);
      }}
      className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white hover:border-blue-400 focus:outline-none focus:border-blue-500"
    >
      <option value="" disabled>
        + Ajouter un critère…
      </option>
      {Array.from(grouped.entries()).map(([cat, keys]) => (
        <optgroup key={cat} label={cat}>
          {keys.map((k) => (
            <option key={k} value={k}>
              {FUND_CRITERIA[k].label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}


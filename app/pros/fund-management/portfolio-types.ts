// Types partagés du module Portefeuille (import d'inventaire). Fichier neutre
// (pas de "use server") : importable côté serveur ET client.

// Section d'inventaire déduite des en-têtes du fichier ("Action", "Obligation",
// "OPCVM", "Banque" → tresorerie).
export type PortfolioSection =
  | "action"
  | "obligation"
  | "opcvm"
  | "dat"
  | "tresorerie"
  | "autre";

// Nature du rattachement d'une ligne au référentiel du site.
export type MatchKind =
  | "stock" // action cotée BRVM (loadStocks, par code)
  | "listed-bond" // obligation cotée BRVM (par isin ou code)
  | "sovereign" // souverain UMOA-Titres (par isin)
  | "fund" // FCP/OPCVM du site (par nom/slug)
  | "custom" // titre personnalisé créé par l'utilisateur
  | "dat" // dépôt à terme (prix de revient + intérêt couru + valorisation)
  | "cash" // ligne de trésorerie / espèces (section Banque)
  | "unmatched"; // non reconnu, à créer

// Une ligne brute extraite du fichier + son statut de reconnaissance.
export type ImportedPosition = {
  section: PortfolioSection;
  rawCode: string;
  rawLabel: string;
  quantity: number | null;
  pru: number | null;
  cost: number | null;
  price: number | null;
  accruedInterest: number | null;
  valuation: number | null;
  // Résolution
  matchKind: MatchKind;
  matchId: string; // identifiant site (code / isin / id fonds / id custom)
  matchLabel: string; // libellé du titre reconnu (nom officiel), sinon ""
  matchHref: string; // lien vers la fiche du titre sur le site, sinon ""
  customSecurityId: string | null;
};

// Résultat du parsing + matching d'un fichier (avant persistance).
export type ParsedInventory = {
  label: string; // nom de fichier
  asOfDate: string; // ISO (déduit ou aujourd'hui)
  totalValuation: number;
  positions: ImportedPosition[];
  counts: {
    total: number;
    matched: number;
    unmatched: number;
    cash: number;
  };
};

// Titre personnalisé (custom_securities). Les paramètres spécifiques au type
// (secteur, coupon, échéance, taux…) sont dans `attributes` (voir
// portfolio-security-schema). `isin` est dérivé de attributes.isin à
// l'enregistrement (colonne dédiée pour un futur rapprochement par ISIN).
export type CustomSecurity = {
  id: string;
  kind: PortfolioSection;
  code: string;
  name: string;
  isin: string;
  currency: string;
  attributes: Record<string, string>;
};

export type CustomSecurityInput = {
  kind: PortfolioSection;
  code: string;
  name: string;
  currency: string;
  attributes: Record<string, string>;
};

// Correspondance trouvée dans le référentiel du site (pour proposer une liaison
// au lieu d'une création de titre personnalisé).
export type ReferenceMatch = {
  kind: MatchKind; // stock | listed-bond | sovereign | fund
  id: string; // identifiant site (code / isin / id fonds)
  label: string; // nom officiel du titre
  matchedOn: "code" | "isin" | "selection"; // origine de la reconnaissance
};

// Option de FCP/OPCVM du référentiel (pour la sélection en cascade SGO → FCP).
export type FundOption = {
  id: string; // slug stable
  gestionnaire: string;
  nom: string;
  categorie: string;
};

// Position de l'inventaire dans la période d'analyse.
export type PortfolioSlot = "debut" | "intermediaire" | "fin";

export const SLOT_ORDER: PortfolioSlot[] = ["debut", "intermediaire", "fin"];

export const SLOT_LABELS: Record<PortfolioSlot, string> = {
  debut: "Inventaire début",
  intermediaire: "Inventaire intermédiaire",
  fin: "Inventaire fin",
};

// Charge utile de sauvegarde d'un portefeuille (snapshot + positions résolues).
export type SavePortfolioInput = {
  slot: PortfolioSlot;
  asOfDate: string;
  label: string;
  totalValuation: number;
  positions: ImportedPosition[];
};

// Portefeuille persisté (snapshot + positions) tel que rechargé pour l'affichage.
export type PortfolioSnapshot = {
  id: string;
  fundId: string;
  slot: PortfolioSlot;
  asOfDate: string;
  label: string;
  totalValuation: number;
  createdAt: string;
  positions: SavedPosition[];
};

export type SavedPosition = {
  id: string;
  section: PortfolioSection;
  rawCode: string;
  rawLabel: string;
  quantity: number | null;
  pru: number | null;
  cost: number | null;
  price: number | null;
  accruedInterest: number | null;
  valuation: number | null;
  matchKind: MatchKind;
  matchId: string;
  matchLabel: string;
  matchHref: string;
  customSecurityId: string | null;
};

// Lien vers la fiche site selon le type reconnu.
export function hrefForMatch(kind: MatchKind, id: string): string {
  switch (kind) {
    case "stock":
      return `/titre/${id}`;
    case "listed-bond":
      return `/obligation/${id}`;
    case "sovereign":
      return `/marches/souverains-non-cotes?isin=${encodeURIComponent(id)}`;
    case "fund":
      return `/fcp/${id}`;
    default:
      return "";
  }
}

export const SECTION_LABELS: Record<PortfolioSection, string> = {
  action: "Actions",
  obligation: "Obligations",
  opcvm: "OPCVM",
  dat: "Dépôts à terme",
  tresorerie: "Trésorerie",
  autre: "Autres",
};

export const MATCH_LABELS: Record<MatchKind, string> = {
  stock: "Action reconnue",
  "listed-bond": "Obligation cotée",
  sovereign: "Souverain UMOA",
  fund: "OPCVM reconnu",
  custom: "Titre personnalisé",
  dat: "Dépôt à terme (DAT)",
  cash: "Trésorerie",
  unmatched: "Non reconnu",
};

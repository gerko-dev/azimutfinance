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
  /** Symbole et ISIN HÉRITÉS du titre reconnu.
   *
   *  Un inventaire produit par notre système ne porte pas toujours de colonne
   *  symbole : c'est le rapprochement par nom exact qui les lui donne. Les
   *  exposer séparément de `rawCode` garde la distinction entre ce que le
   *  fichier disait et ce que le référentiel a apporté. */
  matchCode: string;
  matchIsin: string;
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
  /** Ce que la lecture du fichier a dû supposer (colonnes non reconnues…).
   *  À lire AVANT d'enregistrer : un import silencieux sur un fichier mal
   *  disposé produit des chiffres faux qui ont l'air justes. */
  avertissements: string[];
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
  /** Libellé EXACT de la ligne d'inventaire à l'origine de la création.
   *
   *  Il est conservé en alias sur la fiche, et c'est ce qui rend le travail
   *  définitif : le gérant renomme presque toujours le titre en adoptant la
   *  dénomination officielle du site — « FCTC ZAKA RMBS NSIA BANQUE CI7,00%
   *  2025-2036 » — alors que son état porte « EMPRUNT OBLIGATAIRE FCTC ZAKA
   *  RMBS NSIA BANQUE 7,00% 2025-2036 (20.12.2025) ». Sans l'alias, le
   *  rapprochement par nom exact échoue au prochain import et la ligne
   *  redemande une création, indéfiniment. */
  libelleInventaire?: string;
};

// Correspondance trouvée dans le référentiel du site (pour proposer une liaison
// au lieu d'une création de titre personnalisé).
export type ReferenceMatch = {
  kind: MatchKind; // stock | listed-bond | sovereign | fund
  id: string; // identifiant site (code / isin / id fonds)
  label: string; // nom officiel du titre
  matchedOn: "code" | "isin" | "selection"; // origine de la reconnaissance
  /** Symbole et ISIN du titre lié, DISTINCTS de `id`.
   *
   *  Pour une obligation cotée, `id` vaut l'ISIN : s'en servir comme symbole
   *  faisait disparaître le « FCAGS.O2 » saisi au profit de « SN0000004250 ».
   *  Les deux identifiants ne se substituent pas l'un à l'autre. */
  code: string;
  isin: string;
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
  /** Symbole et ISIN du titre auquel la ligne est rattachée, résolus à la
   *  relecture depuis le référentiel — pas figés en base : un titre renommé ou
   *  re-coté doit voir ses vraies informations partout, y compris sur les
   *  inventaires déjà enregistrés. */
  matchCode: string;
  matchIsin: string;
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

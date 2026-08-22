// Schéma des paramètres à renseigner par type de titre personnalisé.
// Pensé pour alimenter les analyses de portefeuille (allocation, analytique
// obligataire, rendement des dépôts). Les valeurs sont saisies comme des
// chaînes et stockées dans custom_securities.attributes (JSONB).
//
// Cotation :
//  - Actions & obligations COTÉES : elles doivent correspondre à un titre du
//    référentiel du site (rapprochement par code/ISIN → liaison, pas de custom).
//  - Actions NON COTÉES : secteur Damodaran.
//  - Obligations NON COTÉES : mêmes champs que la base (obligations-cotees.csv),
//    dont le différé et le mode d'amortissement (sur Titre / sur Nominal).
import type { PortfolioSection } from "./portfolio-types";

export type FieldOption = { value: string; label: string };

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options?: readonly FieldOption[];
  placeholder?: string;
  hint?: string;
  unit?: string; // "%", "ans"…
};

// Libellés + ordre des types proposés (inclut le dépôt à terme).
export const KIND_OPTIONS: readonly { value: PortfolioSection; label: string }[] = [
  { value: "action", label: "Action" },
  { value: "obligation", label: "Obligation" },
  { value: "opcvm", label: "OPCVM / FCP" },
  { value: "dat", label: "Dépôt à terme (DAT)" },
  { value: "tresorerie", label: "Trésorerie / espèces" },
  { value: "autre", label: "Autre" },
];

// Types soumis au statut de cotation (coté ⇒ doit exister dans le référentiel).
export const LISTABLE_KINDS: ReadonlySet<PortfolioSection> = new Set(["action", "obligation"]);

const PAYS_UEMOA: readonly FieldOption[] = [
  { value: "Bénin", label: "Bénin" },
  { value: "Burkina Faso", label: "Burkina Faso" },
  { value: "Côte d'Ivoire", label: "Côte d'Ivoire" },
  { value: "Guinée-Bissau", label: "Guinée-Bissau" },
  { value: "Mali", label: "Mali" },
  { value: "Niger", label: "Niger" },
  { value: "Sénégal", label: "Sénégal" },
  { value: "Togo", label: "Togo" },
  { value: "Autre", label: "Autre" },
];

const FREQ_COUPON: readonly FieldOption[] = [
  { value: "1", label: "Annuel" },
  { value: "2", label: "Semestriel" },
  { value: "4", label: "Trimestriel" },
];

const AMORT_TYPE: readonly FieldOption[] = [
  { value: "IF", label: "In Fine (IF)" },
  { value: "AC", label: "Amortissement constant (AC)" },
  { value: "ACD", label: "Amortissement constant différé (ACD)" },
];

// Mode d'amortissement — colonne « Titre/Nominal » de la base.
const AMORT_MODE: readonly FieldOption[] = [
  { value: "T", label: "Sur titre" },
  { value: "N", label: "Sur nominal" },
];

const BOND_ISSUER_TYPE: readonly FieldOption[] = [
  { value: "Obligation d'Etat", label: "Obligation d'État" },
  { value: "Obligation régionale", label: "Obligation régionale" },
  { value: "Obligation privée", label: "Obligation privée" },
  { value: "Sukuk Etat", label: "Sukuk d'État" },
];

const BOND_SECTOR: readonly FieldOption[] = [
  "Etat",
  "Banque de developpement",
  "Banque",
  "Finance",
  "Holding",
  "Transport",
  "Energie",
  "Telecom",
  "Titrisation",
  "Immobilier",
  "Agro-industrie",
  "Autre",
].map((s) => ({ value: s, label: s }));

const RATING_AGENCY: readonly FieldOption[] = [
  "Moody's",
  "S&P",
  "Fitch",
  "Bloomfield",
  "Bloomfield / Moody's",
  "GCR",
  "WARA",
  "Non noté",
].map((s) => ({ value: s, label: s }));

const OUI_NON: readonly FieldOption[] = [
  { value: "oui", label: "Oui" },
  { value: "non", label: "Non" },
];

const CATEGORIE_OPCVM: readonly FieldOption[] = [
  "Obligataire",
  "Monétaire",
  "Diversifié",
  "Actions",
  "Actifs non cotés",
].map((s) => ({ value: s, label: s }));

const TYPE_COMPTE: readonly FieldOption[] = [
  { value: "courant", label: "Compte courant" },
  { value: "courant_remunere", label: "Compte courant rémunéré" },
  { value: "encaissement", label: "Encaissement" },
  { value: "decaissement", label: "Décaissement" },
  { value: "autre", label: "Autre" },
];

// Principaux émetteurs de monnaie électronique / mobile money en UEMOA
// (suggestions ; saisie libre possible).
export const MOBILE_MONEY_PROVIDERS: readonly string[] = [
  "Orange Money",
  "MTN Mobile Money (MoMo)",
  "Moov Money",
  "Wave",
  "Free Money (YAS)",
  "Wizall Money",
  "Djamo",
  "Julaya",
  "Bizao",
  "E-Money",
  "InTouch",
];

// Banques et établissements de crédit agréés dans l'UMOA par pays.
// Source : BCEAO — Liste des établissements de crédit agréés au 31/12/2025.
// Utilisé pour la cascade Pays → Banque des comptes de trésorerie.
export const BANKS_BY_COUNTRY: Record<string, readonly string[]> = {
  Bénin: [
    "BOA - Bénin",
    "Banque Atlantique Bénin",
    "BSIC - Bénin",
    "BGFIBank Bénin",
    "NSIA Banque Bénin",
    "Ecobank - Bénin",
    "Orabank - Bénin",
    "Société Générale - Bénin",
    "UBA - Bénin",
    "Bange Bank Bénin",
    "BIIC",
    "Coris Bank International - Bénin",
    "CBAO Groupe Attijariwafa Bank (succ. Bénin)",
    "SONIBANK (succ. Bénin)",
  ],
  "Burkina Faso": [
    "BOA - Burkina Faso",
    "Banque Atlantique Burkina Faso",
    "Banque Agricole du Faso (BADF)",
    "Banque Commerciale du Burkina (BCB)",
    "Banque Postale du Burkina Faso (BPBF)",
    "IB Bank Burkina",
    "Vista Bank Burkina",
    "BSIC - Burkina Faso",
    "Coris Bank International (CBI)",
    "Ecobank - Burkina",
    "Banque de l'Union - Burkina Faso (BDU-BF)",
    "Société Générale - Burkina Faso",
    "UBA Burkina",
    "Wendkuni Bank International",
    "Orabank (succ. Burkina)",
    "CBAO Groupe Attijariwafa Bank (succ. Burkina)",
  ],
  "Côte d'Ivoire": [
    "BICICI",
    "NSIA Banque Côte d'Ivoire",
    "Société Ivoirienne de Banque (SIB)",
    "Société Générale Côte d'Ivoire",
    "Citibank Côte d'Ivoire",
    "BOA - Côte d'Ivoire",
    "Banque Atlantique Côte d'Ivoire (BACI)",
    "Ecobank - Côte d'Ivoire",
    "Banque de l'Habitat de Côte d'Ivoire (BHCI)",
    "Banque Nationale d'Investissement (BNI)",
    "Standard Chartered Bank Côte d'Ivoire",
    "Afriland First Bank Côte d'Ivoire",
    "Versus Bank",
    "Orabank - Côte d'Ivoire",
    "Bridge Bank Group Côte d'Ivoire (BBG-CI)",
    "UBA",
    "BSIC - Côte d'Ivoire",
    "BGFIBank Côte d'Ivoire",
    "Guaranty Trust Bank Côte d'Ivoire (GTBank-CI)",
    "Coris Bank International Côte d'Ivoire (CBI-CI)",
    "Banque de l'Union - Côte d'Ivoire (BDU-CI)",
    "Stanbic Bank",
    "Afrika Banque Côte d'Ivoire (ex Banque d'Abidjan)",
    "Mansa Bank",
    "Orange Bank Africa",
    "AFG Bank Côte d'Ivoire",
    "Banque Malienne de Solidarité (succ. Côte d'Ivoire)",
    "Banque Régionale de Marchés (succ. Côte d'Ivoire)",
    "Zénith Bank Côte d'Ivoire",
  ],
  "Guinée-Bissau": [
    "Banco da Africa Ocidental (BAO)",
    "Banco da Uniao (BDU)",
    "Ecobank - Guinée-Bissau",
    "Orabank (succ. Guinée-Bissau)",
    "Banque Atlantique CI (succ. Guinée-Bissau)",
    "Coris Bank International Sénégal (succ. Guinée-Bissau)",
  ],
  Mali: [
    "Banque de Développement du Mali (BDM)",
    "Banque Internationale pour le Mali (BIM)",
    "Banque Nationale de Développement Agricole (BNDA)",
    "Banque Commerciale du Sahel (BCS)",
    "BOA - Mali",
    "AFG Bank Mali",
    "Banque Atlantique Mali",
    "Banque Malienne de Solidarité (BMS)",
    "Banque pour le Commerce et l'Industrie du Mali (BCI-Mali)",
    "BSIC - Mali",
    "Ecobank - Mali",
    "Coris Bank International - Mali",
    "UBA - Mali",
    "Orabank (succ. Mali)",
  ],
  Niger: [
    "BOA - Niger",
    "Banque Agricole du Niger (BAGRI)",
    "Banque Atlantique Niger",
    "Banque Commerciale du Niger (BCN)",
    "Banque Internationale pour l'Afrique au Niger (BIA-Niger)",
    "Banque Islamique du Niger (BIN)",
    "BSIC - Niger",
    "Ecobank - Niger",
    "Société Nigérienne de Banque (SONIBANK)",
    "Banque de l'Habitat du Niger (BHN)",
    "CBAO Groupe Attijariwafa Bank (succ. Niger)",
    "Orabank (succ. Niger)",
    "Banque Régionale de Marchés (succ. Niger)",
    "Coris Bank International (succ. Niger)",
  ],
  Sénégal: [
    "Sunu Bank (ex BICIS)",
    "Afrika Banque Sénégal (ex Banque de Dakar)",
    "BOA - Sénégal",
    "Banque Atlantique Sénégal",
    "Banque de l'Habitat du Sénégal (BHS)",
    "BIMAO",
    "Banque Islamique du Sénégal (BIS)",
    "Banque Régionale de Marchés (BRM)",
    "BSIC - Sénégal",
    "La Banque Agricole (LBA)",
    "CBAO Groupe Attijariwafa Bank",
    "Citibank Sénégal",
    "Crédit du Sénégal (CDS)",
    "Crédit International (CI)",
    "BGFIBank Sénégal",
    "Ecobank - Sénégal",
    "FBNBank Sénégal",
    "Société Générale Sénégal",
    "UBA Sénégal",
    "BNDE",
    "La Banque Ourtade (LBO)",
    "Coris Bank International - Sénégal (CBI-Sénégal)",
    "Algerian Bank of Sénégal (ABS)",
    "Orabank (succ. Sénégal)",
    "NSIA Banque Bénin (succ. Sénégal)",
    "BCI-Mali (succ. Sénégal)",
    "Bridge Bank Group CI (succ. Sénégal)",
    "Banque de Développement du Mali (succ. Sénégal)",
    "Orange Bank Africa (succ. Sénégal)",
  ],
  Togo: [
    "Banque Atlantique Togo",
    "Banque Internationale pour l'Afrique au Togo (BIA-Togo)",
    "Sunu Bank",
    "BSIC - Togo",
    "IB Bank Togo (ex BTCI)",
    "Ecobank - Togo",
    "Orabank Togo",
    "Société Interafricaine de Banque (SIAB)",
    "Union Togolaise de Banque (UTB)",
    "BOA - Togo",
    "Coris Bank International - Togo (CBI-Togo)",
    "NSIA Banque Bénin (succ. Togo)",
    "Société Générale Bénin (succ. Togo)",
    "Banque de Développement du Mali (succ. Togo)",
  ],
};

// Secteurs d'activité selon la classification Damodaran (Industry Name).
export const DAMODARAN_SECTORS: readonly FieldOption[] = [
  "Advertising", "Aerospace/Defense", "Air Transport", "Apparel", "Auto & Truck",
  "Auto Parts", "Bank (Money Center)", "Banks (Regional)", "Beverage (Alcoholic)",
  "Beverage (Soft)", "Broadcasting", "Brokerage & Investment Banking",
  "Building Materials", "Business & Consumer Services", "Cable TV", "Chemical (Basic)",
  "Chemical (Diversified)", "Chemical (Specialty)", "Coal & Related Energy",
  "Computer Services", "Computers/Peripherals", "Construction Supplies", "Diversified",
  "Drugs (Biotechnology)", "Drugs (Pharmaceutical)", "Education", "Electrical Equipment",
  "Electronics (Consumer & Office)", "Electronics (General)", "Engineering/Construction",
  "Entertainment", "Environmental & Waste Services", "Farming/Agriculture",
  "Financial Svcs. (Non-bank & Insurance)", "Food Processing", "Food Wholesalers",
  "Furn/Home Furnishings", "Green & Renewable Energy", "Healthcare Products",
  "Healthcare Support Services", "Health Care Information and Technology", "Homebuilding",
  "Hospitals/Healthcare Facilities", "Hotel/Gaming", "Household Products",
  "Information Services", "Insurance (General)", "Insurance (Life)",
  "Insurance (Prop/Cas.)", "Investments & Asset Management", "Machinery",
  "Metals & Mining", "Office Equipment & Services", "Oil/Gas (Integrated)",
  "Oil/Gas (Production and Exploration)", "Oil/Gas Distribution", "Oilfield Svcs/Equip.",
  "Packaging & Container", "Paper/Forest Products", "Power", "Precious Metals",
  "Publishing & Newspapers", "R.E.I.T.", "Real Estate (Development)",
  "Real Estate (General/Diversified)", "Real Estate (Operations & Services)", "Recreation",
  "Reinsurance", "Restaurant/Dining", "Retail (Automotive)", "Retail (Building Supply)",
  "Retail (Distributors)", "Retail (General)", "Retail (Grocery and Food)",
  "Retail (Online)", "Retail (Special Lines)", "Rubber & Tires", "Semiconductor",
  "Semiconductor Equip", "Shipbuilding & Marine", "Shoe", "Software (Entertainment)",
  "Software (Internet)", "Software (System & Application)", "Steel", "Telecom (Wireless)",
  "Telecom. Equipment", "Telecom. Services", "Tobacco", "Transportation",
  "Transportation (Railroads)", "Trucking", "Utility (General)", "Utility (Water)",
].map((s) => ({ value: s, label: s }));

// Statut de cotation (rendu explicitement dans le formulaire pour les types
// LISTABLE, mais présent dans le schéma pour être persisté).
const COTE_FIELD: FieldDef = {
  key: "cote",
  label: "Statut de cotation",
  type: "select",
  options: [
    { value: "noncote", label: "Non coté" },
    { value: "cote", label: "Coté (référentiel)" },
  ],
};

// Champs spécifiques (attributs) par type. Code, Nom et Devise sont universels
// et gérés à part dans le formulaire.
export const SECURITY_FIELDS: Record<PortfolioSection, FieldDef[]> = {
  action: [
    COTE_FIELD,
    { key: "pays", label: "Pays", type: "select", options: PAYS_UEMOA },
    {
      key: "secteur",
      label: "Secteur (Damodaran)",
      type: "select",
      options: DAMODARAN_SECTORS,
      hint: "Classification sectorielle Damodaran (analyse & bêta).",
    },
  ],
  obligation: [
    COTE_FIELD,
    { key: "isin", label: "ISIN", type: "text", placeholder: "CI0000000000" },
    { key: "issuer", label: "Émetteur", type: "text", placeholder: "Ex. État de Côte d'Ivoire" },
    { key: "issuerType", label: "Type d'émetteur", type: "select", options: BOND_ISSUER_TYPE },
    { key: "country", label: "Pays", type: "select", options: PAYS_UEMOA },
    { key: "sector", label: "Secteur", type: "select", options: BOND_SECTOR },
    { key: "couponRate", label: "Taux du coupon", type: "number", unit: "%", placeholder: "6,00" },
    { key: "couponFrequency", label: "Fréquence du coupon", type: "select", options: FREQ_COUPON },
    { key: "issueDate", label: "Date d'émission", type: "date" },
    { key: "maturityDate", label: "Date d'échéance", type: "date", hint: "Duration / sensibilité." },
    { key: "firstAmortizationDate", label: "Date du 1er amortissement", type: "date" },
    { key: "differe", label: "Différé", type: "number", unit: "ans", placeholder: "Ex. 2" },
    { key: "nominalValue", label: "Valeur nominale", type: "number", placeholder: "10 000" },
    { key: "totalIssued", label: "Montant total émis", type: "number" },
    { key: "outstanding", label: "Encours", type: "number" },
    { key: "amortizationType", label: "Type d'amortissement", type: "select", options: AMORT_TYPE },
    {
      key: "amortizationMode",
      label: "Mode d'amortissement",
      type: "select",
      options: AMORT_MODE,
      hint: "Sur titre (VN constante, titres tirés) ou sur nominal (VN décroissante).",
    },
    { key: "rating", label: "Notation", type: "text", placeholder: "Ex. Baa3, BBB" },
    { key: "ratingAgency", label: "Agence de notation", type: "select", options: RATING_AGENCY },
    { key: "callable", label: "Remboursable par anticipation", type: "select", options: OUI_NON },
    { key: "callDate", label: "Date de call", type: "date" },
    { key: "greenBond", label: "Obligation verte", type: "select", options: OUI_NON },
  ],
  opcvm: [
    { key: "gestionnaire", label: "Société de gestion", type: "text", placeholder: "Ex. NSIA Asset Management" },
    { key: "categorie", label: "Catégorie", type: "select", options: CATEGORIE_OPCVM, hint: "Allocation par classe d'actif." },
    { key: "isin", label: "Code / ISIN", type: "text", placeholder: "Optionnel" },
  ],
  dat: [
    { key: "contrepartie", label: "Contrepartie / banque", type: "text", placeholder: "Ex. BNDE" },
    { key: "tauxInteret", label: "Taux d'intérêt", type: "number", unit: "%", placeholder: "6,50" },
    { key: "dateValeur", label: "Date de valeur", type: "date" },
    { key: "dateEcheance", label: "Date d'échéance", type: "date" },
    { key: "montantNominal", label: "Montant nominal", type: "number", placeholder: "500 000 000" },
  ],
  // Trésorerie = compte (courant, éventuellement rémunéré) ouvert dans une
  // banque de l'UMOA. Le rendu Pays → Banque est géré par TreasuryFields
  // (cascade) ; ces définitions fixent les clés persistées + libellés.
  tresorerie: [
    { key: "canal", label: "Type d'établissement", type: "text" }, // "banque" | "mobile_money"
    { key: "pays", label: "Pays", type: "select", options: PAYS_UEMOA },
    { key: "banque", label: "Établissement", type: "text" }, // banque OU nom du mobile money
    { key: "natureCompte", label: "Nature du compte", type: "text" }, // "espece" | "depositaire"
    { key: "typeCompte", label: "Type de compte", type: "select", options: TYPE_COMPTE },
    { key: "tauxRemuneration", label: "Taux de rémunération", type: "number", unit: "%", placeholder: "3,5" },
  ],
  autre: [{ key: "note", label: "Description", type: "text", placeholder: "Nature de l'actif" }],
};

// Clés numériques (normalisées en notation à point à l'enregistrement).
export const NUMERIC_KEYS = new Set([
  "couponRate",
  "nominalValue",
  "totalIssued",
  "outstanding",
  "differe",
  "tauxInteret",
  "montantNominal",
  "tauxRemuneration",
]);

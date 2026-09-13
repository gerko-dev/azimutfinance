// Catalogue des ratios réglementaires (Instruction N°66/CREPMF/2021), porté
// depuis le module Aurore. Modèle orienté surveillance : chaque ratio décrit
// une règle prudentielle (métrique à mesurer, base de calcul, seuils, article).
//
// - RATIOS_COMMUNS : Art. 39 à 46, applicables à TOUS les OPCVM.
// - RATIOS_PAR_TYPE : critères d'exposition définissant chaque catégorie (Art. 18).
//
// Le formulaire pilote l'auto-remplissage à partir de la « Catégorie » du fonds
// (voir CATEGORIE_TO_TYPE) : ratios propres au type + ratios communs.

// Familles de ratios (ordre d'affichage)
export const G_EXPO = "Exposition par classe d'actif";
export const G_ELIG = "Actifs éligibles";
export const G_DIV = "Diversification / Division des risques";
export const G_ENG = "Engagement & risque global";
export const G_OPC = "Détention d'OPC (fonds de fonds)";
export const G_EMPRISE = "Emprise (limites de détention)";
export const G_EMPRUNT = "Emprunts";

export const GROUPES = [
  G_EXPO,
  G_ELIG,
  G_DIV,
  G_ENG,
  G_OPC,
  G_EMPRISE,
  G_EMPRUNT,
] as const;

// Classes d'actif sur lesquelles portent les ratios contractuels (allocation).
export const CLASSES_ACTIF = [
  "Actions",
  "Obligations et autres titres de créances",
  "Instruments du marché monétaire",
  "Titres de FCTC",
  "Dépôts et investissements liquides",
  "Parts d'OPC",
  "Liquidités",
] as const;

// Une entrée du catalogue réglementaire (référentiel Instruction 66).
export type RatioCatalogEntry = {
  groupe: string;
  libelle: string;
  metrique: string;
  base: string;
  seuilMin: number | null;
  seuilMax: number | null;
  unite: string; // "%" ou "ans"
  article: string;
};

// Ratios communs à tous les OPCVM (Art. 39 à 46).
export const RATIOS_COMMUNS: RatioCatalogEntry[] = [
  { groupe: G_ELIG, libelle: "Valeurs mobilières / IMM autres que les actifs éligibles (Art. 39 al. 1)", metrique: "Total VM/IMM non éligibles", base: "Actif", seuilMin: null, seuilMax: 10, unite: "%", article: "Art. 39.2 a" },
  { groupe: G_DIV, libelle: "Valeurs mobilières ou IMM d'un même émetteur", metrique: "VM/IMM par émetteur", base: "Actif", seuilMin: null, seuilMax: 15, unite: "%", article: "Art. 41.1 a" },
  { groupe: G_DIV, libelle: "Dépôts auprès d'un même émetteur", metrique: "Dépôts par émetteur", base: "Actif", seuilMin: null, seuilMax: 20, unite: "%", article: "Art. 41.1 b" },
  { groupe: G_DIV, libelle: "Risque de contrepartie sur dérivés OTC (établissement de crédit)", metrique: "Risque de contrepartie OTC (éts de crédit)", base: "Actif", seuilMin: null, seuilMax: 10, unite: "%", article: "Art. 41.2 a" },
  { groupe: G_DIV, libelle: "Risque de contrepartie sur dérivés OTC (autres cas)", metrique: "Risque de contrepartie OTC (autres)", base: "Actif", seuilMin: null, seuilMax: 5, unite: "%", article: "Art. 41.2 b" },
  { groupe: G_DIV, libelle: "Titre de capital coté à forte pondération indicielle (> 10 % de l'indice BRVM)", metrique: "Titre à forte pondération indicielle", base: "Actif", seuilMin: null, seuilMax: 20, unite: "%", article: "Art. 41.3" },
  { groupe: G_DIV, libelle: "Somme des positions supérieures à 15 % par émetteur", metrique: "Somme des lignes > 15 %", base: "Actif", seuilMin: null, seuilMax: 50, unite: "%", article: "Art. 41.3" },
  { groupe: G_DIV, libelle: "Titres émis ou garantis par un État de l'Union (souverain)", metrique: "Titres souverains par émetteur", base: "Actif", seuilMin: null, seuilMax: 35, unite: "%", article: "Art. 41.4" },
  { groupe: G_DIV, libelle: "Cumul par une même entité (titres + dépôts + dérivés OTC)", metrique: "Cumul par entité (titres + dépôts + dérivés)", base: "Actif", seuilMin: null, seuilMax: 30, unite: "%", article: "Art. 41 (§ Nonobstant)" },
  { groupe: G_DIV, libelle: "Cumul maximal par une même entité (non-cumul des al. 1 à 3)", metrique: "Cumul par entité", base: "Actif", seuilMin: null, seuilMax: 40, unite: "%", article: "Art. 41.5" },
  { groupe: G_DIV, libelle: "Cumul par un même groupe (valeurs mobilières + IMM)", metrique: "Cumul par groupe (VM + IMM)", base: "Actif", seuilMin: null, seuilMax: 30, unite: "%", article: "Art. 41.5" },
  { groupe: G_ENG, libelle: "Risque global lié aux instruments dérivés (méthode brute)", metrique: "Risque global (méthode brute)", base: "Actif net", seuilMin: null, seuilMax: 100, unite: "%", article: "Art. 40.3" },
  { groupe: G_OPC, libelle: "Parts d'un même OPCVM ou autre OPC", metrique: "Parts par OPC", base: "Actif", seuilMin: null, seuilMax: 20, unite: "%", article: "Art. 43.1" },
  { groupe: G_OPC, libelle: "Parts d'OPC autres que des OPCVM (total)", metrique: "Total parts d'OPC non-OPCVM", base: "Actif", seuilMin: null, seuilMax: 30, unite: "%", article: "Art. 43.2" },
  { groupe: G_EMPRISE, libelle: "Actions sans droit de vote d'un même émetteur (emprise)", metrique: "Actions sans droit de vote détenues", base: "Émission de l'émetteur", seuilMin: null, seuilMax: 20, unite: "%", article: "Art. 44.2 a" },
  { groupe: G_EMPRISE, libelle: "Titres de créances d'un même émetteur (emprise)", metrique: "Titres de créances détenus", base: "Émission de l'émetteur", seuilMin: null, seuilMax: 20, unite: "%", article: "Art. 44.2 b" },
  { groupe: G_EMPRISE, libelle: "Parts d'un même OPCVM ou autre OPC (emprise)", metrique: "Parts détenues d'un OPC", base: "Parts de l'OPC", seuilMin: null, seuilMax: 25, unite: "%", article: "Art. 44.2 c" },
  { groupe: G_EMPRISE, libelle: "Instruments du marché monétaire d'un même émetteur (emprise)", metrique: "IMM détenus par émetteur", base: "Émission de l'émetteur", seuilMin: null, seuilMax: 20, unite: "%", article: "Art. 44.2 d" },
  { groupe: G_EMPRUNT, libelle: "Emprunts temporaires", metrique: "Emprunts temporaires", base: "Actif", seuilMin: null, seuilMax: 10, unite: "%", article: "Art. 46.2 a" },
  { groupe: G_EMPRUNT, libelle: "Total des emprunts", metrique: "Total des emprunts", base: "Actif", seuilMin: null, seuilMax: 15, unite: "%", article: "Art. 46.2 c" },
];

// Ratios définissant chaque type de fonds (Art. 18) — groupe Exposition.
// Clés = types Aurore ; le formulaire y accède via CATEGORIE_TO_TYPE.
export const RATIOS_PAR_TYPE: Record<string, RatioCatalogEntry[]> = {
  Actions: [
    { groupe: G_EXPO, libelle: "Exposition minimale en actions cotées BRVM ou marché réglementé UMOA", metrique: "Total Actions", base: "Actif net - Liquidités", seuilMin: 70, seuilMax: null, unite: "%", article: "Art. 18.2" },
  ],
  "Obligations et autres titres de créances": [
    { groupe: G_EXPO, libelle: "Exposition minimale en titres de créances éligibles", metrique: "Total titres de créances", base: "Actif net - Liquidités", seuilMin: 70, seuilMax: null, unite: "%", article: "Art. 18.3" },
    { groupe: G_EXPO, libelle: "Exposition maximale au risque « Actions »", metrique: "Total Actions", base: "Actif net", seuilMin: null, seuilMax: 10, unite: "%", article: "Art. 18.3" },
  ],
  Monétaire: [
    { groupe: G_EXPO, libelle: "Exposition aux instruments du marché monétaire ou titres d'État UMOA éligibles", metrique: "Total instruments MM + titres d'État UMOA éligibles", base: "Actif net", seuilMin: 100, seuilMax: null, unite: "%", article: "Art. 18.4" },
    { groupe: G_EXPO, libelle: "Maturité ou maturité résiduelle des instruments détenus", metrique: "Maturité (résiduelle) par instrument", base: "—", seuilMin: null, seuilMax: 2, unite: "ans", article: "Art. 18.4" },
  ],
  Diversifié: [
    { groupe: G_EXPO, libelle: "Exposition en actions et/ou obligations", metrique: "Total Actions + Obligations", base: "Actif net", seuilMin: null, seuilMax: 70, unite: "%", article: "Art. 18.5" },
    { groupe: G_EXPO, libelle: "Exposition en obligations, titres du marché monétaire, OPCVM ou FCTC", metrique: "Total Obligations + MM + OPCVM + FCTC", base: "Actif net", seuilMin: null, seuilMax: 70, unite: "%", article: "Art. 18.5" },
  ],
  // Définis par la garantie / la formule, sans seuil de composition propre.
  Garanti: [],
  "à formule": [],
};

// La « Catégorie » du formulaire cible → type de fonds du catalogue Aurore.
// « Actifs non cotés » n'a pas de critère d'exposition dédié : seuls les ratios
// communs s'appliquent.
export const CATEGORIE_TO_TYPE: Record<string, string> = {
  Actions: "Actions",
  Obligataire: "Obligations et autres titres de créances",
  Monétaire: "Monétaire",
  Diversifié: "Diversifié",
  "Actifs non cotés": "",
};

// Ratios réglementaires applicables à une catégorie : ceux propres au type
// (Art. 18) suivis des ratios communs (Art. 39-46).
export function ratiosReglementaires(categorie: string): RatioCatalogEntry[] {
  const type = CATEGORIE_TO_TYPE[categorie] ?? "";
  const specifiques = RATIOS_PAR_TYPE[type] ?? [];
  return [...specifiques, ...RATIOS_COMMUNS];
}

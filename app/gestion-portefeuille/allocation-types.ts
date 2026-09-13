// === Allocation validée — types ===
//
// Cinq axes, et non un seul. La granularité suit la nature de la poche :
//
//   classe                 actions / obligations / OPCVM / DAT / liquidités
//   action_secteur         dans la poche actions, par secteur BRVM
//   action_titre           dans la poche actions, valeur par valeur
//   obligation_emetteur    dans la poche obligataire, par émetteur
//   obligation_maturite    dans la poche obligataire, par maturité résiduelle
//
// OPCVM, DAT et liquidités restent au niveau de la classe : le détail n'y
// apporte rien à la décision du comité.
//
// POINT STRUCTURANT — l'univers d'un axe vient du RÉFÉRENTIEL DE MARCHÉ, pas
// du portefeuille détenu. Toutes les actions cotées à la BRVM figurent sur
// l'axe action_titre, y compris celles que le fonds ne détient pas : c'est
// ainsi qu'on décide d'entrer sur une valeur.

import type { PortfolioSection } from "./portfolio-types";

export type AxeAllocation =
  | "classe"
  | "action_secteur"
  | "action_titre"
  | "obligation_emetteur"
  | "obligation_maturite";

export const AXES: AxeAllocation[] = [
  "classe",
  "action_secteur",
  "action_titre",
  "obligation_emetteur",
  "obligation_maturite",
];

export const LIBELLE_AXE: Record<AxeAllocation, string> = {
  classe: "Classes d'actifs",
  action_secteur: "Actions — par secteur",
  action_titre: "Actions — par titre",
  obligation_emetteur: "Obligations — par émetteur",
  obligation_maturite: "Obligations — par maturité résiduelle",
};

/** Classe d'actif à laquelle un axe se rapporte. `null` pour l'axe des classes,
 *  qui porte sur l'actif net entier. */
export const CLASSE_DE_L_AXE: Record<AxeAllocation, PortfolioSection | null> = {
  classe: null,
  action_secteur: "action",
  action_titre: "action",
  obligation_emetteur: "obligation",
  obligation_maturite: "obligation",
};

/** Tranches de maturité résiduelle, exprimées en ANNÉES.
 *
 *  Bornes hautes OUVERTES : une maturité de 3 mois pile relève de la tranche
 *  « 3 – 6 mois », pas de la précédente. Sans cette convention, une même
 *  échéance tomberait dans deux tranches selon l'arrondi.
 */
export const TRANCHES_MATURITE: { cle: string; libelle: string; min: number; max: number }[] = [
  { cle: "0-3m", libelle: "0 – 3 mois", min: 0, max: 0.25 },
  { cle: "3-6m", libelle: "3 – 6 mois", min: 0.25, max: 0.5 },
  { cle: "6m-1a", libelle: "6 mois – 1 an", min: 0.5, max: 1 },
  { cle: "1-3a", libelle: "1 – 3 ans", min: 1, max: 3 },
  { cle: "3-5a", libelle: "3 – 5 ans", min: 3, max: 5 },
  { cle: "5-7a", libelle: "5 – 7 ans", min: 5, max: 7 },
  { cle: "7-10a", libelle: "7 – 10 ans", min: 7, max: 10 },
  { cle: "10a+", libelle: "Plus de 10 ans", min: 10, max: 999 },
];

/** Les huit États de l'UEMOA, seuls émetteurs distingués sur l'axe obligataire.
 *  Tout le reste — entreprises, institutions régionales, États hors Union —
 *  se regroupe sous « Autres États ». Les libellés reprennent ceux des
 *  adjudications UMOA-Titres, y compris « Guinée Bissau » sans trait d'union. */
export const ETATS_UEMOA = [
  "Bénin",
  "Burkina Faso",
  "Côte d'Ivoire",
  "Guinée Bissau",
  "Mali",
  "Niger",
  "Sénégal",
  "Togo",
] as const;

/** Émetteurs privés : entreprises et établissements de crédit. Le référentiel
 *  les identifie par son type « Obligation privée ». */
export const EMETTEUR_PRIVE = "Privé";

/** Reliquat : États hors Union et institutions régionales (BOAD, CRRH-UEMOA,
 *  BIDC-EBID). Ni une signature souveraine de l'Union, ni un émetteur privé. */
export const AUTRES_EMETTEURS = "Autres États";

export type CibleAllocation = {
  id: string;
  fundId: string;
  dimension: AxeAllocation;
  bucket: string;
  /** En décimal : 0,35 pour 35 %. */
  cible: number;
  decideLe: string | null;
  note: string | null;
  updatedAt: string;
};

/** Une ligne d'allocation, tous calculs faits.
 *
 *  Les noms suivent les colonnes de la feuille NFD pour que le gérant retrouve
 *  ses repères.
 */
export type LigneAllocation = {
  bucket: string;
  libelle: string;
  /** Précision utile à la lecture : secteur d'un titre, pays d'un émetteur… */
  detail: string | null;
  /** Poste de RATTACHEMENT sur l'axe de niveau supérieur. Pour un titre, son
   *  secteur : c'est ce qui permet de contrôler que la somme des allocations
   *  par titre d'un secteur respecte l'allocation arrêtée pour ce secteur. */
  groupe: string | null;
  /** Positions de l'inventaire courant regroupées sous ce poste. Un poste
   *  agrégé ne dit pas ce qu'il contient : sans ce détail, un montant
   *  inattendu reste inexplicable. */
  positions: { code: string; libelle: string; valorisation: number }[];
  /** Le fonds détient-il quelque chose sur ce poste ? Distingue un poste à 0 %
   *  parce que soldé d'un poste jamais entré en portefeuille. */
  detenu: boolean;
  valeurPrecedente: number | null;
  allocationPrecedente: number | null;
  valeurActuelle: number;
  /** Part dans l'assiette de l'axe : la classe pour un sous-axe, l'actif net
   *  pour l'axe des classes. */
  allocationActuelle: number;
  /** Part dans l'ACTIF NET, quel que soit l'axe. Ce que regarde la
   *  réglementation, qui raisonne toujours en pourcentage de l'actif. */
  allocationActifNet: number;
  allocationValidee: number | null;
  ecart: number | null;
  valeurCible: number | null;
  montantARealiser: number | null;
  tro: number | null;
  operation: string | null;
};

/** Position que l'axe n'a pas su rattacher, avec la raison. Un montant agrégé
 *  sous « non rapprochées » ne dit pas quoi corriger ; le détail, si. */
export type LigneNonRapprochee = {
  code: string;
  libelle: string;
  valorisation: number;
  /** Nature de la reconnaissance à l'import (stock, listed-bond, custom…). */
  matchKind: string;
  /** Ce qui manque, en clair. */
  motif: string;
};

export type TableauAllocation = {
  dimension: AxeAllocation;
  /** Classe d'actif à laquelle l'axe se rapporte, null pour l'axe des classes. */
  classeParente: PortfolioSection | null;
  lignes: LigneAllocation[];
  /** Assiette de l'axe : valorisation de la classe, ou actif net pour l'axe
   *  des classes. C'est le dénominateur des allocations de l'axe. */
  assiette: number;
  assiettePrecedente: number | null;
  actifNet: number;
  tresorerieAInvestir: number;
  sommeCibles: number;
  /** Cibles de l'axe de niveau supérieur, par poste de rattachement. Sur l'axe
   *  « par titre », les allocations sectorielles : la somme des titres d'un
   *  secteur doit s'y conformer. Vide quand l'axe n'a pas de niveau supérieur. */
  /** Détail des positions tombées en « non rapprochées » sur l'inventaire
   *  courant. Vide quand tout est rattaché. */
  nonRapprochees: LigneNonRapprochee[];
  ciblesGroupe: Record<string, number>;
  /** Axe dont proviennent `ciblesGroupe`, pour le message à l'écran. */
  axeGroupe: AxeAllocation | null;
  dateActuelle: string | null;
  datePrecedente: string | null;
  avertissements: string[];
};

/** Écart entre la somme des cibles d'un groupe et la cible du groupe. */
export type ControleGroupe = {
  groupe: string;
  sommeTitres: number;
  cibleGroupe: number | null;
  ecart: number | null;
  conforme: boolean;
};

/** Tolérance d'arrondi : un dixième de point d'allocation. En deçà, l'écart
 *  vient de la saisie à deux décimales, pas d'une incohérence de décision. */
export const TOLERANCE_ALLOCATION = 0.001;

/** Confronte des cibles par titre aux cibles par secteur.
 *
 *  Partagé entre l'écran et l'action serveur : la même règle doit rendre le
 *  même verdict des deux côtés, sinon l'utilisateur voit passer une saisie que
 *  le serveur refusera.
 */
export function controlerGroupes(
  cibles: { bucket: string; cible: number }[],
  groupeDuBucket: Map<string, string>,
  ciblesGroupe: Record<string, number>,
): ControleGroupe[] {
  const sommes = new Map<string, number>();
  for (const c of cibles) {
    const g = groupeDuBucket.get(c.bucket);
    if (!g) continue;
    sommes.set(g, (sommes.get(g) ?? 0) + c.cible);
  }
  // On balaie l'union : un secteur ciblé sans aucun titre alloué est une
  // incohérence au même titre qu'un dépassement.
  const groupes = new Set<string>([...sommes.keys(), ...Object.keys(ciblesGroupe)]);
  return [...groupes]
    .map((groupe) => {
      const sommeTitres = sommes.get(groupe) ?? 0;
      const cibleGroupe = ciblesGroupe[groupe] ?? null;
      const ecart = cibleGroupe === null ? null : sommeTitres - cibleGroupe;
      return {
        groupe,
        sommeTitres,
        cibleGroupe,
        ecart,
        conforme: ecart === null ? true : Math.abs(ecart) <= TOLERANCE_ALLOCATION,
      };
    })
    .sort((a, b) => a.groupe.localeCompare(b.groupe, "fr"));
}

export const LIBELLE_CLASSE: Record<PortfolioSection, string> = {
  action: "Actions",
  obligation: "Obligations et autres titres de créances",
  opcvm: "Parts d'OPC",
  dat: "Dépôts à terme",
  tresorerie: "Liquidités",
  autre: "Autres actifs",
};

export const ORDRE_CLASSES: PortfolioSection[] = [
  "action",
  "obligation",
  "opcvm",
  "dat",
  "tresorerie",
  "autre",
];

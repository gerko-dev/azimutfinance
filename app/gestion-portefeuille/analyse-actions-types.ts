// === Compartiment actions BRVM : forme transportée et règles d'agrégation ===
//
// CE MODULE EST PUR. Le panneau est un composant client : il ne peut pas
// importer le chargeur de CSV. Les types et les règles de calcul vivent donc
// ici, `analyse-actions-data.ts` ne fait que lire et enrichir.
//
// PAS DE COMPACTAGE EN TUPLES, contrairement aux adjudications : la cote tient
// en une cinquantaine de valeurs, et l'économie ne vaudrait pas la perte de
// lisibilité. Ce qui coûte ici, c'est l'historique des cours — il reste au
// serveur, qui n'en transmet que les performances calculées.

import { assise, moyennePonderee, somme } from "./analyse-agregats";

export type Performances = {
  m1: number | null;
  m3: number | null;
  m6: number | null;
  ytd: number | null;
  a1: number | null;
  a3: number | null;
};

export type LigneAction = {
  code: string;
  nom: string;
  secteur: string;
  pays: string;
  isin: string;
  /** Dernière clôture connue, en FCFA. */
  cours: number;
  /** Variation de la dernière séance, en %. */
  varJour: number;
  /** Capitalisation boursière, en FCFA. */
  capitalisation: number;
  /** PER sur le dernier exercice publié. Null quand la société perd de
   *  l'argent ou que les comptes manquent. */
  per: number | null;
  /** Rendement du dividende, en %. Null quand le dividende n'est pas
   *  récurrent — une distribution exceptionnelle ne se compare pas. */
  rendement: number | null;
  /** Dividende par action retenu, en FCFA. */
  dpa: number | null;
  /** Volume moyen par séance, en titres, sur les 30 dernières séances cotées. */
  volumeMoyen: number;
  /** Capitaux moyens échangés par séance, en FCFA, sur les mêmes séances. */
  capitauxMoyens: number;
  /** Nombre de séances avec transaction sur les 30 dernières séances cotées :
   *  la mesure de liquidité qui compte vraiment sur cette place. */
  seancesTraitees: number;
  perf: Performances;
  /** Volatilité annualisée des rendements quotidiens sur un an, en %. */
  volatilite: number | null;
};

// === MÉTRIQUES ===

export type UniteAction = "milliardsF" | "pourcent" | "perf" | "entier" | "ratio" | "millionsF";

export type MetriqueAction =
  | "capitalisation"
  | "poids"
  | "nombre"
  | "capitauxMoyens"
  | "per"
  | "rendement"
  | "volatilite"
  | "perfM1"
  | "perfM3"
  | "perfYtd"
  | "perfA1"
  | "perfA3";

export const METRIQUES_ACTION: Record<
  MetriqueAction,
  { libelle: string; court: string; unite: UniteAction; aide: string }
> = {
  capitalisation: {
    libelle: "Capitalisation",
    court: "Capitalisation",
    unite: "milliardsF",
    aide: "Capitalisation boursière, cours courant × nombre de titres.",
  },
  poids: {
    libelle: "Poids dans la cote",
    court: "Poids",
    unite: "pourcent",
    aide: "Part de la capitalisation de l'univers retenu par les filtres.",
  },
  nombre: {
    libelle: "Nombre de valeurs",
    court: "Valeurs",
    unite: "entier",
    aide: "Nombre de sociétés cotées.",
  },
  capitauxMoyens: {
    libelle: "Capitaux échangés",
    court: "Capitaux",
    unite: "millionsF",
    aide: "Capitaux moyens par séance sur les 30 dernières séances cotées.",
  },
  per: {
    libelle: "PER",
    court: "PER",
    unite: "ratio",
    aide: "Cours sur bénéfice par action, pondéré par les capitalisations.",
  },
  rendement: {
    libelle: "Rendement du dividende",
    court: "Rendement",
    unite: "pourcent",
    aide: "Dividende sur cours, pondéré par les capitalisations. Les distributions non récurrentes sont écartées.",
  },
  volatilite: {
    libelle: "Volatilité",
    court: "Volatilité",
    unite: "pourcent",
    aide: "Écart-type annualisé des variations quotidiennes sur un an.",
  },
  perfM1: {
    libelle: "Performance 1 mois",
    court: "1 mois",
    unite: "perf",
    aide: "Variation du cours sur un mois, pondérée par les capitalisations.",
  },
  perfM3: {
    libelle: "Performance 3 mois",
    court: "3 mois",
    unite: "perf",
    aide: "Variation du cours sur trois mois, pondérée par les capitalisations.",
  },
  perfYtd: {
    libelle: "Performance depuis le 1er janvier",
    court: "Depuis janvier",
    unite: "perf",
    aide: "Variation du cours depuis la dernière clôture de l'an passé, pondérée par les capitalisations.",
  },
  perfA1: {
    libelle: "Performance 1 an",
    court: "1 an",
    unite: "perf",
    aide: "Variation du cours sur un an, pondérée par les capitalisations.",
  },
  perfA3: {
    libelle: "Performance 3 ans",
    court: "3 ans",
    unite: "perf",
    aide: "Variation cumulée du cours sur trois ans, pondérée par les capitalisations.",
  },
};

/** Métriques qui font sens comme lecture principale d'un pivot. */
export const METRIQUES_ACTION_PIVOT: MetriqueAction[] = [
  "capitalisation",
  "poids",
  "nombre",
  "capitauxMoyens",
  "perfYtd",
  "perfA1",
  "perfM3",
  "per",
  "rendement",
  "volatilite",
];

const PERF = {
  perfM1: "m1",
  perfM3: "m3",
  perfYtd: "ytd",
  perfA1: "a1",
  perfA3: "a3",
} as const satisfies Partial<Record<MetriqueAction, keyof Performances>>;

type MetriquePerf = keyof typeof PERF;

/** Garde de type, et non simple test : elle retire les métriques de
 *  performance de l'union, ce qui rend le `switch` qui suit exhaustif — une
 *  métrique ajoutée sans être agrégée devient une erreur de compilation. */
const estPerf = (m: MetriqueAction): m is MetriquePerf => m in PERF;

/**
 * LE POIDS D'UNE CELLULE EST TOUJOURS LA CAPITALISATION, jamais le nombre de
 * valeurs. Une moyenne de PER à parts égales donnerait autant de voix à une
 * société de 10 milliards qu'au plus gros émetteur de la cote, et rendrait un
 * chiffre qui ne décrit aucun portefeuille réalisable.
 */
const poidsCapi = (l: LigneAction) => l.capitalisation;

/**
 * `univers` sert de dénominateur au poids : c'est l'ensemble retenu par les
 * filtres, pas la cote entière. Un pivot filtré sur un pays doit faire 100 %
 * sur ce pays, sinon sa colonne de total ne veut rien dire.
 */
export function agregerAction(
  m: MetriqueAction,
  lignes: LigneAction[],
  univers: LigneAction[],
): number | null {
  if (lignes.length === 0) return null;
  if (estPerf(m)) return moyennePonderee(lignes, (l) => l.perf[PERF[m]], poidsCapi);
  switch (m) {
    case "capitalisation":
      return somme(lignes, (l) => l.capitalisation);
    case "poids": {
      const total = somme(univers, (l) => l.capitalisation);
      return total > 0 ? (somme(lignes, (l) => l.capitalisation) / total) * 100 : null;
    }
    case "nombre":
      return lignes.length;
    case "capitauxMoyens":
      return somme(lignes, (l) => l.capitauxMoyens);
    case "per":
      return moyennePonderee(lignes, (l) => l.per, poidsCapi);
    case "rendement":
      return moyennePonderee(lignes, (l) => l.rendement, poidsCapi);
    case "volatilite":
      return moyennePonderee(lignes, (l) => l.volatilite, poidsCapi);
  }
}

/** Part de la capitalisation qui porte réellement la donnée, de 0 à 1. */
export function assiseAction(m: MetriqueAction, lignes: LigneAction[]): number | null {
  if (estPerf(m)) return assise(lignes, (l) => l.perf[PERF[m]], poidsCapi);
  if (m === "per") return assise(lignes, (l) => l.per, poidsCapi);
  if (m === "rendement") return assise(lignes, (l) => l.rendement, poidsCapi);
  if (m === "volatilite") return assise(lignes, (l) => l.volatilite, poidsCapi);
  return null;
}

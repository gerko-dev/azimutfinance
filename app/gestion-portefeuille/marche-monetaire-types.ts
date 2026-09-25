// === Adjudications UMOA-Titres : forme transportée et règles d'agrégation ===
//
// CE MODULE EST PUR. Le panneau d'analyse est un composant client : il ne peut
// pas importer `lib/dataLoader`, qui lit le disque. Les types et TOUTES les
// règles de calcul vivent donc ici, et `marche-monetaire-data.ts` ne fait que
// lire le CSV et compacter.
//
// POURQUOI UNE FORME COMPACTÉE. Le panneau filtre, pivote et croise en continu
// — période, pays, instrument, métrique. Refaire un aller-retour serveur à
// chaque clic rendrait l'exploration pénible, alors on envoie l'historique
// entier une fois et on pivote dans le navigateur. Mais treize années
// d'adjudications font 3 200 lignes : sérialisées en objets, avec leurs noms de
// champs répétés à chaque ligne, elles pèsent près d'un mégaoctet. En tuples,
// elles en pèsent le quart.

import { umoaCoverageRatio } from "@/lib/listedBondsTypes";

/** Ordre des champs d'une ligne compactée. */
export type LigneCompacte = [
  /** Code pays 2 lettres. */
  pays: string,
  /** Tranche de maturité en mois, ramenée à la grille standard. */
  tenor: number,
  /** 0 = BAT, 1 = OAT. */
  type: 0 | 1,
  /** 0 = adjudication cash, 1 = échange, 2 = rachat. */
  nature: 0 | 1 | 2,
  /** Date de valeur, ISO. */
  date: string,
  /** Montant proposé de la SESSION, en millions. */
  propose: number,
  /** Montant soumis, en millions. */
  soumis: number,
  /** Montant retenu, en millions. */
  retenu: number,
  /** Taux d'intérêt facial, en %. */
  tauxInteret: number | null,
  /** Prix marginal, pour 10 000 F de nominal. */
  prixMarginal: number | null,
  /** Taux marginal, en %. */
  tauxMarginal: number | null,
  /** Prix moyen pondéré, pour 10 000 F de nominal. */
  pmp: number | null,
  /** Taux moyen pondéré, en %. */
  tmp: number | null,
  /** Rendement moyen pondéré, en %. */
  rmp: number | null,
];

/**
 * Les trois formes canoniques que `classifyOperation` reconnaît.
 *
 * On transporte l'INDICE de nature plutôt que le libellé d'origine — il y en a
 * une quinzaine, tous longs — mais on le rend sous la forme que la fonction
 * canonique attend. La règle de couverture, qui est subtile, reste ainsi
 * écrite une seule fois, dans `lib/listedBondsTypes`.
 */
const PRECISION_CANONIQUE = ["", "Echange", "Rachat"] as const;

export type Adjudication = {
  // Ces six champs portent les noms qu'attend `umoaCoverageRatio` : nos lignes
  // lui sont passées telles quelles.
  country: string;
  date: string;
  amountSubmitted: number;
  amountIssued: number;
  amount: number;
  precisions: string;

  tenor: number;
  type: "OAT" | "BAT";
  nature: 0 | 1 | 2;
  tauxInteret: number | null;
  prixMarginal: number | null;
  tauxMarginal: number | null;
  pmp: number | null;
  tmp: number | null;
  rmp: number | null;
};

export function rehydrater(l: LigneCompacte): Adjudication {
  return {
    country: l[0],
    date: l[4],
    amountSubmitted: l[6],
    amountIssued: l[5],
    amount: l[7],
    precisions: PRECISION_CANONIQUE[l[3]],
    tenor: l[1],
    type: l[2] === 1 ? "OAT" : "BAT",
    nature: l[3],
    tauxInteret: l[8],
    prixMarginal: l[9],
    tauxMarginal: l[10],
    pmp: l[11],
    tmp: l[12],
    rmp: l[13],
  };
}

// === MATURITÉS ===

/**
 * Grille des maturités standard du marché, en mois.
 *
 * UMOA-Titres émet sur des tranches nommées — le 3 mois, le 12 mois, le 3 ans,
 * le 7 ans — et c'est ainsi que la place en parle. Les quelques dizaines de
 * lignes tombant à côté (34, 74, 96 mois) sont des réouvertures ou des saisies
 * particulières : les laisser créer leur propre colonne émietterait le tableau
 * pour 1 % des opérations.
 */
export const TRANCHES_MOIS = [1, 3, 6, 12, 24, 36, 48, 60, 84, 120, 180];

/**
 * Tranche la plus proche, mesurée en écart PROPORTIONNEL et non absolu.
 *
 * Un mois d'écart n'a pas le même sens sur un bon à 3 mois et sur une OAT à
 * 10 ans. En distance logarithmique, 9 mois va vers le 12 mois (et non vers le
 * 6), 74 mois vers le 7 ans (et non vers le 5) — ce que dirait un opérateur.
 */
export function trancheMaturite(mois: number): number {
  if (!(mois > 0)) return TRANCHES_MOIS[0];
  let meilleure = TRANCHES_MOIS[0];
  let ecart = Infinity;
  for (const t of TRANCHES_MOIS) {
    const d = Math.abs(Math.log(mois) - Math.log(t));
    if (d < ecart) {
      ecart = d;
      meilleure = t;
    }
  }
  return meilleure;
}

/** « 3 mois » en deçà d'un an, « 7 ans » au-delà. */
export function libelleTranche(mois: number): string {
  if (mois < 12) return `${mois} mois`;
  const ans = mois / 12;
  const n = Number.isInteger(ans) ? ans : Math.round(ans * 10) / 10;
  return `${String(n).replace(".", ",")} an${n >= 2 ? "s" : ""}`;
}

// === PAYS ===

export const PAYS_NOM: Record<string, string> = {
  BJ: "Bénin",
  BF: "Burkina Faso",
  CI: "Côte d'Ivoire",
  GW: "Guinée-Bissau",
  ML: "Mali",
  NE: "Niger",
  SN: "Sénégal",
  TG: "Togo",
};

/** Ordre alphabétique des noms, celui des tableaux de place. */
export const PAYS_ORDRE = Object.keys(PAYS_NOM).sort((a, b) =>
  PAYS_NOM[a].localeCompare(PAYS_NOM[b], "fr"),
);

export const PAYS_COULEUR: Record<string, string> = {
  BJ: "#2563eb",
  BF: "#dc2626",
  CI: "#f97316",
  GW: "#0d9488",
  ML: "#7c3aed",
  NE: "#0891b2",
  SN: "#16a34a",
  TG: "#db2777",
};

// === MÉTRIQUES ===

export type Metrique =
  | "retenu"
  | "soumis"
  | "propose"
  | "absorption"
  | "couverture"
  | "tauxInteret"
  | "tauxMarginal"
  | "tmp"
  | "rmp"
  | "prixMarginal"
  | "pmp"
  | "nombre";

export type Unite = "milliards" | "pourcent" | "prix" | "entier";

export const METRIQUES: Record<
  Metrique,
  { libelle: string; court: string; unite: Unite; aide: string }
> = {
  retenu: {
    libelle: "Montant retenu",
    court: "Retenu",
    unite: "milliards",
    aide: "Ce que l'État a effectivement levé.",
  },
  soumis: {
    libelle: "Montant soumis",
    court: "Soumis",
    unite: "milliards",
    aide: "Ce que les investisseurs ont offert.",
  },
  propose: {
    libelle: "Montant proposé",
    court: "Proposé",
    unite: "milliards",
    aide: "Ce que l'État a sollicité, compté une seule fois par séance.",
  },
  absorption: {
    libelle: "Taux d'absorption",
    court: "Absorption",
    unite: "pourcent",
    aide: "Retenu / soumis : la part des offres que l'émetteur a servie.",
  },
  couverture: {
    libelle: "Taux de couverture",
    court: "Couverture",
    unite: "pourcent",
    aide: "Soumis / proposé : l'appétit du marché pour la séance.",
  },
  tauxInteret: {
    libelle: "Taux d'intérêt",
    court: "Taux d'intérêt",
    unite: "pourcent",
    aide: "Coupon facial, pondéré par les montants retenus.",
  },
  tauxMarginal: {
    libelle: "Taux marginal",
    court: "Taux marginal",
    unite: "pourcent",
    aide: "Le taux de la dernière offre servie — la limite que l'État a acceptée.",
  },
  tmp: {
    libelle: "Taux moyen pondéré",
    court: "TMP",
    unite: "pourcent",
    aide: "Taux moyen des offres servies, pondéré par leurs montants.",
  },
  rmp: {
    libelle: "Rendement moyen pondéré",
    court: "RMP",
    unite: "pourcent",
    aide: "Rendement actuariel moyen pondéré de l'adjudication.",
  },
  prixMarginal: {
    libelle: "Prix marginal",
    court: "Prix marginal",
    unite: "prix",
    aide: "Prix de la dernière offre servie, pour 10 000 F de nominal.",
  },
  pmp: {
    libelle: "Prix moyen pondéré",
    court: "PMP",
    unite: "prix",
    aide: "Prix moyen des offres servies, pour 10 000 F de nominal.",
  },
  nombre: {
    libelle: "Nombre d'opérations",
    court: "Opérations",
    unite: "entier",
    aide: "Nombre de lignes adjugées.",
  },
};

/** Métriques qui se lisent honnêtement dans un pivot par maturité. */
export const METRIQUES_TAUX: Metrique[] = [
  "tauxInteret",
  "tmp",
  "tauxMarginal",
  "rmp",
  "pmp",
  "prixMarginal",
  "absorption",
];

const somme = (l: Adjudication[], f: (a: Adjudication) => number): number =>
  l.reduce((t, a) => t + f(a), 0);

/**
 * Moyenne pondérée PAR LE MONTANT RETENU.
 *
 * Une ligne non servie n'a pas de taux qui vaille : l'État n'a rien pris à ce
 * prix-là. Elle pèse donc zéro, et une cellule qui n'en contient que de
 * celles-là ne rend pas 0 mais RIEN — un taux nul serait un mensonge, alors
 * qu'une case vide est une absence.
 */
const CHAMPS_MOYENNES = [
  "tauxInteret",
  "tauxMarginal",
  "tmp",
  "rmp",
  "prixMarginal",
  "pmp",
] as const;

type ChampMoyenne = (typeof CHAMPS_MOYENNES)[number];

const estMoyenne = (m: Metrique): m is ChampMoyenne =>
  (CHAMPS_MOYENNES as readonly string[]).includes(m);

function moyennePonderee(lignes: Adjudication[], champ: ChampMoyenne): number | null {
  let num = 0;
  let den = 0;
  for (const l of lignes) {
    const v = l[champ];
    if (v === null || !(l.amount > 0)) continue;
    num += v * l.amount;
    den += l.amount;
  }
  return den > 0 ? num / den : null;
}

/**
 * Montant proposé : la RÉFÉRENCE du taux de couverture, et rien d'autre.
 *
 * Deux règles, reprises trait pour trait de `umoaCoverageRatio` — c'est
 * volontaire : affichée à côté du soumis et de la couverture, cette colonne
 * doit permettre de refaire la division à la main. Une définition qui
 * divergerait de celle du ratio donnerait trois nombres dont deux se
 * contredisent.
 *
 *  - Adjudication : l'État sollicite une enveloppe globale qu'il lève via
 *    plusieurs lignes le même jour, et le CSV la répète à l'identique sur
 *    chacune. On ne la compte donc qu'UNE fois par séance ; la sommer
 *    naïvement la multiplierait par le nombre de lignes.
 *  - Échange ou rachat : l'État ne sollicite rien, il substitue un titre à un
 *    autre. La référence est le montant retenu — l'opération est mécanique, et
 *    une couverture de 100 % est le résultat attendu.
 *
 * Sans la seconde règle, le Niger affichait en 2026 un « proposé » de 135
 * milliards pour 959 retenus : huit de ses douze séances étaient des échanges,
 * dont l'enveloppe ne comptait pas.
 */
function proposeUnique(lignes: Adjudication[]): number {
  const parSeance = new Map<string, number>();
  let total = 0;
  for (const l of lignes) {
    if (l.nature !== 0) {
      if (l.amount > 0) total += l.amount;
      continue;
    }
    if (!(l.amountIssued > 0)) continue;
    parSeance.set(`${l.country}|${l.date}|${l.amountIssued}`, l.amountIssued);
  }
  for (const v of parSeance.values()) total += v;
  return total;
}

/** En millions de FCFA pour les montants, en % pour les taux. */
export function agreger(m: Metrique, lignes: Adjudication[]): number | null {
  if (lignes.length === 0) return null;
  switch (m) {
    case "retenu":
      return somme(lignes, (l) => l.amount);
    case "soumis":
      return somme(lignes, (l) => l.amountSubmitted);
    case "propose":
      return proposeUnique(lignes);
    case "absorption": {
      const s = somme(lignes, (l) => l.amountSubmitted);
      return s > 0 ? (somme(lignes, (l) => l.amount) / s) * 100 : null;
    }
    case "couverture": {
      const r = umoaCoverageRatio(lignes);
      return r === null ? null : r * 100;
    }
    case "nombre":
      return lignes.length;
    default:
      return moyennePonderee(lignes, m);
  }
}

/**
 * Maturités que cette métrique renseigne vraiment.
 *
 * UNE COLONNE VIDE DE BOUT EN BOUT NE DIT RIEN, elle occupe seulement de la
 * place — et le cas n'est pas marginal : un bon du Trésor n'ayant pas de
 * coupon, le tableau des taux d'intérêt garde sinon les colonnes 3, 6 et
 * 12 mois entièrement vides, là où le tableau des montants, lui, en a besoin.
 * Tableau et graphique partagent ce filtre pour montrer la même chose.
 */
export function tenorsRenseignes(
  m: Metrique,
  lignes: Adjudication[],
  tenors: number[],
): number[] {
  return tenors.filter((t) => agreger(m, lignes.filter((l) => l.tenor === t)) !== null);
}

/**
 * Part du montant retenu qui porte RÉELLEMENT la donnée moyennée, de 0 à 1.
 *
 * Une moyenne pondérée ne dit pas sur quoi elle porte, et ici l'écart est
 * énorme : le taux d'intérêt n'existe que pour les OAT — un bon s'adjuge à
 * l'escompte, sans coupon — tandis que le taux moyen pondéré n'est publié que
 * pour les bons. Affichées côte à côte sans cet avertissement, les deux
 * colonnes d'un même total décrivent en fait deux marchés différents.
 *
 * Renvoie null pour les métriques qui ne sont pas des moyennes.
 */
export function assiseMetrique(m: Metrique, lignes: Adjudication[]): number | null {
  if (!estMoyenne(m)) return null;
  let porteur = 0;
  let total = 0;
  for (const l of lignes) {
    if (!(l.amount > 0)) continue;
    total += l.amount;
    if (l[m] !== null) porteur += l.amount;
  }
  return total > 0 ? porteur / total : null;
}

/** Maturité moyenne en ANNÉES, pondérée par les montants retenus. */
export function maturiteMoyenne(lignes: Adjudication[]): number | null {
  let num = 0;
  let den = 0;
  for (const l of lignes) {
    if (!(l.amount > 0)) continue;
    num += (l.tenor / 12) * l.amount;
    den += l.amount;
  }
  return den > 0 ? num / den : null;
}

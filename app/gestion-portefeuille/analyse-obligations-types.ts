// === Compartiment obligations BRVM : forme transportée et agrégats ===
//
// CE MODULE EST PUR : il est importé par le panneau (client) comme par le
// chargeur (serveur). Rien ici ne lit le disque.

import { assise, moyennePonderee, somme } from "./analyse-agregats";

/** Une tombée annuelle d'une ligne, en FCFA, pour tout le gisement émis. */
export type FluxAnnuel = {
  /** Année civile. */
  annee: number;
  /** Intérêts. */
  coupon: number;
  /** Amortissements et remboursement final. */
  principal: number;
};

export type LigneObligation = {
  isin: string;
  code: string;
  nom: string;
  emetteur: string;
  typeEmetteur: string;
  pays: string;
  /** Encours restant dû, en FCFA, tel que publié au référentiel. */
  encours: number;
  /** Montant émis à l'origine, en FCFA. */
  emis: number;
  /** Coupon facial, en %. */
  coupon: number;
  /** Nombre de détachements par an. */
  frequence: number;
  dateEmission: string;
  dateEcheance: string;
  /** Maturité RÉSIDUELLE, en années. */
  maturite: number;
  /** Clé de tranche de maturité résiduelle. */
  tranche: string;
  amortissement: string;
  notation: string;
  vert: boolean;
  remboursableAnticipe: boolean;
  /** Dernier cours pied de coupon connu, pour 10 000 F de nominal. */
  cours: number | null;
  dateCours: string;
  /** Rendement actuariel sur ce cours, en %. Null sans cours de marché. */
  ytm: number | null;
  /** Duration modifiée, en années. */
  duration: number | null;
  flux: FluxAnnuel[];
};

// === TRANCHES DE MATURITÉ ===
//
// Des BORNES FIXES et non une grille logarithmique comme pour les
// adjudications : ici la maturité est RÉSIDUELLE et continue — une ligne à
// 7 ans en porte 4,3 aujourd'hui — il n'y a donc aucune tranche d'émission sur
// laquelle se caler. Les bornes retenues sont celles dont parle la gestion
// obligataire : le court, le moyen, le long.

export const TRANCHES_OBLIG: { cle: string; titre: string; max: number }[] = [
  { cle: "0-1", titre: "< 1 an", max: 1 },
  { cle: "1-3", titre: "1 à 3 ans", max: 3 },
  { cle: "3-5", titre: "3 à 5 ans", max: 5 },
  { cle: "5-7", titre: "5 à 7 ans", max: 7 },
  { cle: "7-10", titre: "7 à 10 ans", max: 10 },
  { cle: "10+", titre: "plus de 10 ans", max: Infinity },
];

export function trancheDe(annees: number): string {
  for (const t of TRANCHES_OBLIG) if (annees < t.max) return t.cle;
  return TRANCHES_OBLIG[TRANCHES_OBLIG.length - 1].cle;
}

// === MÉTRIQUES ===

export type UniteObligation = "milliardsF" | "pourcent" | "annees" | "entier";

export type MetriqueObligation =
  | "encours"
  | "poids"
  | "nombre"
  | "coupon"
  | "ytm"
  | "maturite"
  | "duration";

export const METRIQUES_OBLIGATION: Record<
  MetriqueObligation,
  { libelle: string; court: string; unite: UniteObligation; aide: string }
> = {
  encours: {
    libelle: "Encours",
    court: "Encours",
    unite: "milliardsF",
    aide: "Capital restant dû, tel que publié au référentiel de la cote.",
  },
  poids: {
    libelle: "Poids dans le compartiment",
    court: "Poids",
    unite: "pourcent",
    aide: "Part de l'encours de l'univers retenu par les filtres.",
  },
  nombre: {
    libelle: "Nombre de lignes",
    court: "Lignes",
    unite: "entier",
    aide: "Nombre d'emprunts cotés.",
  },
  coupon: {
    libelle: "Coupon facial",
    court: "Coupon",
    unite: "pourcent",
    aide: "Taux nominal, pondéré par les encours.",
  },
  ytm: {
    libelle: "Rendement actuariel",
    court: "YTM",
    unite: "pourcent",
    aide: "Rendement à l'échéance sur le dernier cours coté, pondéré par les encours.",
  },
  maturite: {
    libelle: "Maturité résiduelle",
    court: "Maturité",
    unite: "annees",
    aide: "Années restant jusqu'à l'échéance, pondérées par les encours.",
  },
  duration: {
    libelle: "Duration modifiée",
    court: "Duration",
    unite: "annees",
    aide: "Sensibilité du prix à une variation de taux, en années, pondérée par les encours.",
  },
};

export const METRIQUES_OBLIGATION_PIVOT: MetriqueObligation[] = [
  "encours",
  "poids",
  "nombre",
  "coupon",
  "ytm",
  "maturite",
  "duration",
];

/**
 * LE POIDS EST TOUJOURS L'ENCOURS. Une moyenne de coupons à parts égales
 * donnerait autant de voix à un emprunt de 2 milliards qu'à un souverain de
 * 300 : elle décrirait la cote, pas le marché.
 */
const poidsEncours = (l: LigneObligation) => l.encours;

export function agregerObligation(
  m: MetriqueObligation,
  lignes: LigneObligation[],
  univers: LigneObligation[],
): number | null {
  if (lignes.length === 0) return null;
  switch (m) {
    case "encours":
      return somme(lignes, (l) => l.encours);
    case "poids": {
      const total = somme(univers, (l) => l.encours);
      return total > 0 ? (somme(lignes, (l) => l.encours) / total) * 100 : null;
    }
    case "nombre":
      return lignes.length;
    case "coupon":
      return moyennePonderee(lignes, (l) => l.coupon, poidsEncours);
    case "ytm":
      return moyennePonderee(lignes, (l) => l.ytm, poidsEncours);
    case "maturite":
      return moyennePonderee(lignes, (l) => l.maturite, poidsEncours);
    case "duration":
      return moyennePonderee(lignes, (l) => l.duration, poidsEncours);
  }
}

/** Part de l'encours qui porte réellement la donnée, de 0 à 1. */
export function assiseObligation(
  m: MetriqueObligation,
  lignes: LigneObligation[],
): number | null {
  if (m === "ytm") return assise(lignes, (l) => l.ytm, poidsEncours);
  if (m === "duration") return assise(lignes, (l) => l.duration, poidsEncours);
  return null;
}

/** Tombées agrégées par année civile, sur l'univers passé. */
export function echeancier(lignes: LigneObligation[]): FluxAnnuel[] {
  const parAnnee = new Map<number, FluxAnnuel>();
  for (const l of lignes) {
    for (const f of l.flux) {
      const deja = parAnnee.get(f.annee);
      if (deja) {
        deja.coupon += f.coupon;
        deja.principal += f.principal;
      } else {
        parAnnee.set(f.annee, { annee: f.annee, coupon: f.coupon, principal: f.principal });
      }
    }
  }
  return [...parAnnee.values()].sort((a, b) => a.annee - b.annee);
}

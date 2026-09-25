// === Marché des OPCVM de l'UMOA : forme transportée et agrégats ===
//
// CE MODULE EST PUR : importé par le panneau (client) comme par le chargeur
// (serveur). Rien ici ne lit le disque.

import { assise, moyennePonderee, somme } from "./analyse-agregats";

/** Un point d'actif net trimestriel. */
export type PointActif = { trimestre: string; actifNet: number };

export type LigneFcp = {
  id: string;
  nom: string;
  gestionnaire: string;
  categorie: string;
  type: string;
  /** Actif net au trimestre de référence, en FCFA. Null si non publié. */
  actifNet: number | null;
  /** Dernière valeur liquidative connue. */
  vl: number | null;
  dateVl: string;
  /** Vrai quand la VL date d'avant le seuil de fraîcheur du marché. */
  perimee: boolean;
  cadence: string;
  /** Ancienneté du fonds, en années. */
  age: number | null;
  /** Niveau de risque PUBLIÉ par la société de gestion, jamais déduit. */
  risque: number | null;
  risqueEchelle: number | null;
  /** Performances en %, cumulées sauf `a3` qui est ANNUALISÉE. */
  perf: {
    ytd: number | null;
    m3: number | null;
    m6: number | null;
    a1: number | null;
    a3: number | null;
  };
  historique: PointActif[];
};

// === MÉTRIQUES ===

export type UniteFcp = "milliardsF" | "pourcent" | "perf" | "entier" | "annees";

export type MetriqueFcp =
  | "actifNet"
  | "poids"
  | "nombre"
  | "perfYtd"
  | "perfA1"
  | "perfA3"
  | "perfM3"
  | "age"
  | "risque";

export const METRIQUES_FCP: Record<
  MetriqueFcp,
  { libelle: string; court: string; unite: UniteFcp; aide: string }
> = {
  actifNet: {
    libelle: "Actif net",
    court: "Actif net",
    unite: "milliardsF",
    aide: "Actif net au dernier trimestre publié.",
  },
  poids: {
    libelle: "Part de marché",
    court: "Part",
    unite: "pourcent",
    aide: "Part de l'actif net de l'univers retenu par les filtres.",
  },
  nombre: {
    libelle: "Nombre de fonds",
    court: "Fonds",
    unite: "entier",
    aide: "Nombre d'OPCVM.",
  },
  perfYtd: {
    libelle: "Performance depuis le 1er janvier",
    court: "Depuis janvier",
    unite: "perf",
    aide: "Variation de la valeur liquidative depuis le dernier 31 décembre, pondérée par les actifs nets.",
  },
  perfA1: {
    libelle: "Performance 1 an",
    court: "1 an",
    unite: "perf",
    aide: "Variation de la valeur liquidative sur un an, pondérée par les actifs nets.",
  },
  perfA3: {
    libelle: "Performance 3 ans annualisée",
    court: "3 ans p.a.",
    unite: "perf",
    aide: "Rendement annuel moyen sur trois ans, pondéré par les actifs nets.",
  },
  perfM3: {
    libelle: "Performance 3 mois",
    court: "3 mois",
    unite: "perf",
    aide: "Variation de la valeur liquidative sur trois mois, pondérée par les actifs nets.",
  },
  age: {
    libelle: "Ancienneté",
    court: "Ancienneté",
    unite: "annees",
    aide: "Années depuis la première valeur liquidative connue, pondérées par les actifs nets.",
  },
  risque: {
    libelle: "Niveau de risque",
    court: "Risque",
    unite: "annees",
    aide: "Niveau publié par la société de gestion, sur son échelle. Jamais déduit de la catégorie.",
  },
};

export const METRIQUES_FCP_PIVOT: MetriqueFcp[] = [
  "actifNet",
  "poids",
  "nombre",
  "perfYtd",
  "perfA1",
  "perfA3",
  "perfM3",
  "age",
  "risque",
];

/**
 * LE POIDS EST L'ACTIF NET. Un fonds de 200 millions et un fonds de 80
 * milliards ne décrivent pas le même marché ; les moyenner à parts égales
 * donnerait la performance d'un investisseur qui aurait mis la même somme dans
 * chacun — personne.
 *
 * Un fonds sans actif net publié ne pèse donc rien dans les moyennes. Il compte
 * en revanche dans le NOMBRE de fonds, qui ne se pondère pas.
 */
const poidsActif = (l: LigneFcp) => l.actifNet ?? 0;

export function agregerFcp(
  m: MetriqueFcp,
  lignes: LigneFcp[],
  univers: LigneFcp[],
): number | null {
  if (lignes.length === 0) return null;
  switch (m) {
    case "actifNet": {
      const avec = lignes.filter((l) => l.actifNet !== null);
      return avec.length > 0 ? somme(avec, (l) => l.actifNet) : null;
    }
    case "poids": {
      const total = somme(univers, (l) => l.actifNet);
      return total > 0 ? (somme(lignes, (l) => l.actifNet) / total) * 100 : null;
    }
    case "nombre":
      return lignes.length;
    case "perfYtd":
      return moyennePonderee(lignes, (l) => l.perf.ytd, poidsActif);
    case "perfA1":
      return moyennePonderee(lignes, (l) => l.perf.a1, poidsActif);
    case "perfA3":
      return moyennePonderee(lignes, (l) => l.perf.a3, poidsActif);
    case "perfM3":
      return moyennePonderee(lignes, (l) => l.perf.m3, poidsActif);
    case "age":
      return moyennePonderee(lignes, (l) => l.age, poidsActif);
    case "risque":
      return moyennePonderee(lignes, (l) => l.risque, poidsActif);
  }
}

export function assiseFcp(m: MetriqueFcp, lignes: LigneFcp[]): number | null {
  switch (m) {
    case "perfYtd":
      return assise(lignes, (l) => l.perf.ytd, poidsActif);
    case "perfA1":
      return assise(lignes, (l) => l.perf.a1, poidsActif);
    case "perfA3":
      return assise(lignes, (l) => l.perf.a3, poidsActif);
    case "perfM3":
      return assise(lignes, (l) => l.perf.m3, poidsActif);
    case "risque":
      return assise(lignes, (l) => l.risque, poidsActif);
    default:
      return null;
  }
}

/** Actif net total par trimestre, sur l'univers passé. */
export function actifParTrimestre(
  lignes: LigneFcp[],
): { trimestre: string; actifNet: number; fonds: number }[] {
  const parTrimestre = new Map<string, { actifNet: number; fonds: number }>();
  for (const l of lignes) {
    for (const p of l.historique) {
      const deja = parTrimestre.get(p.trimestre);
      if (deja) {
        deja.actifNet += p.actifNet;
        deja.fonds += 1;
      } else {
        parTrimestre.set(p.trimestre, { actifNet: p.actifNet, fonds: 1 });
      }
    }
  }
  return [...parTrimestre.entries()]
    .map(([trimestre, v]) => ({ trimestre, ...v }))
    .sort((a, b) => a.trimestre.localeCompare(b.trimestre));
}

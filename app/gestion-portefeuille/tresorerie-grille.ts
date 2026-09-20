import "server-only";

// === Grille de saisie des soldes : banques en colonnes, fonds en lignes ===
//
// La saisie ne se fait plus dans le tableau du point, pour deux raisons.
//
// Un relevé bancaire se lit PAR BANQUE : on ouvre le relevé de la BOA, et on
// y trouve les comptes de tous les fonds. Saisir fonds par fonds obligeait à
// rouvrir le même relevé autant de fois qu'il y a de portefeuilles.
//
// Et le tableau du point est une RESTITUTION : y mêler des champs de saisie
// rendait chaque cellule ambiguë — celle-ci se corrige, celle-là se calcule,
// et rien ne les distinguait qu'une bordure.

import type { PointTresorerie } from "./tresorerie-types";
import { construirePointTresorerie } from "./tresorerie-data";

export type ColonneBanque = {
  cle: string;
  nom: string;
  pays: string;
  sens: string;
  groupe: string;
};

export type LigneFonds = {
  fondsId: string;
  fondsNom: string;
  /** Soldes déjà saisis, par clef d'établissement. Une clef absente signifie
   *  que ce fonds n'a PAS de compte dans cet établissement : la cellule est
   *  alors barrée, pas mise à zéro. */
  soldes: Record<string, number>;
  /** Établissements où ce fonds détient effectivement un compte. */
  comptes: string[];
};

export type GrilleSoldes = {
  banques: ColonneBanque[];
  lignes: LigneFonds[];
  /** Date du dernier jeu de soldes connu, proposée comme date de saisie. */
  derniereDate: string | null;
};

/** Rang d'affichage d'un groupe, repris de `ordonnerEtablissements`. */
function rangGroupe(groupe: string): number {
  if (groupe === "Comptes dépositaires") return 0;
  if (groupe === "Comptes espèce") return 1;
  return 2;
}

/**
 * Points de chaque fonds, dans l'ordre donné.
 *
 * Extrait pour être partagé entre la consolidation et la grille de saisie :
 * les deux doivent voir exactement les mêmes colonnes, et deux calculs
 * parallèles auraient fini par diverger.
 */
export async function chargerPoints(
  fonds: { id: string; nom: string }[],
  dateEngagements?: string | null,
): Promise<PointTresorerie[]> {
  const points = await Promise.all(
    fonds.map((f) => construirePointTresorerie(f.id, f.nom, dateEngagements)),
  );
  return points.filter((p): p is PointTresorerie => p !== null);
}

/**
 * Grille de saisie construite depuis les points déjà calculés.
 *
 * Les colonnes sont l'UNION des établissements de tous les fonds, et chaque
 * ligne ne déclare que ceux où le fonds a réellement un compte. C'est la
 * demande exacte : on ne saisit un solde que pour les fonds qui détiennent un
 * compte dans la banque en question.
 */
export function construireGrille(points: PointTresorerie[]): GrilleSoldes {
  const parCle = new Map<string, ColonneBanque>();
  for (const p of points) {
    for (const e of p.etablissements) {
      if (!parCle.has(e.cle)) parCle.set(e.cle, e);
    }
  }

  const banques = [...parCle.values()].sort(
    (a, b) =>
      rangGroupe(a.groupe) - rangGroupe(b.groupe) ||
      a.pays.localeCompare(b.pays, "fr") ||
      a.nom.localeCompare(b.nom, "fr") ||
      a.sens.localeCompare(b.sens, "fr"),
  );

  const lignes: LigneFonds[] = points.map((p) => {
    const solde = p.lignes.find((l) => l.libelle === "SOLDE");
    const soldes: Record<string, number> = {};
    for (const b of p.banques) {
      const v = solde?.parBanque[b];
      if (typeof v === "number") soldes[b] = v;
    }
    return {
      fondsId: p.fondsId,
      fondsNom: p.fonds,
      soldes,
      comptes: p.banques,
    };
  });

  const derniereDate =
    points
      .map((p) => p.soldesSaisisLe)
      .filter((d): d is string => !!d)
      .sort()
      .pop() ?? null;

  return { banques, lignes, derniereDate };
}

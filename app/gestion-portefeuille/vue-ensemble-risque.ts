// === Ce qu'une courbe de valeur liquidative dit du risque ================
//
// MODULE PUR. Ni base ni fichier : il se vérifie sur des nombres.
//
// UNE PERFORMANCE SEULE NE DIT RIEN. Deux fonds à + 6 % ne se valent pas si
// l'un y est allé droit et l'autre en perdant douze points en chemin — le
// porteur qui est sorti au creux n'a pas touché les + 6 %. Un poste de gestion
// qui affiche la performance sans la volatilité ni le pire recul montre la
// moitié du métier.

/** Un point de courbe : une date, une valeur. */
export type Point = { date: string; valeur: number };

const MS_JOUR = 86_400_000;
const jours = (a: string, b: string): number =>
  (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / MS_JOUR;

/**
 * Volatilité ANNUALISEE, en %.
 *
 * L'ANNUALISATION SE FAIT SUR L'ESPACEMENT REEL DES POINTS, et c'est le détail
 * qui fait tout : une VL hebdomadaire et une VL quotidienne n'ont pas le même
 * √n. Multiplier aveuglément par √252 ferait passer un fonds à VL mensuelle
 * pour trois fois plus agité qu'il n'est.
 *
 * Rend null sous quatre observations : un écart-type sur trois points n'est
 * pas une volatilité, c'est un hasard arrondi.
 */
export function volatiliteAnnualisee(points: Point[]): number | null {
  const utiles = points.filter((p) => p.valeur > 0);
  if (utiles.length < 4) return null;

  const rendements: number[] = [];
  for (let i = 1; i < utiles.length; i++) {
    rendements.push(Math.log(utiles[i].valeur / utiles[i - 1].valeur));
  }
  const n = rendements.length;
  const moyenne = rendements.reduce((s, r) => s + r, 0) / n;
  const variance = rendements.reduce((s, r) => s + (r - moyenne) ** 2, 0) / (n - 1);
  const ecartType = Math.sqrt(variance);

  const duree = jours(utiles[0].date, utiles[utiles.length - 1].date);
  if (!(duree > 0)) return null;
  const espacement = duree / n; // jours moyens entre deux observations
  const parAn = 365 / espacement;
  return ecartType * Math.sqrt(parAn) * 100;
}

/**
 * PIRE RECUL (maximum drawdown), en % — toujours négatif ou nul.
 *
 * La plus forte baisse entre un sommet et le creux qui le suit. C'est le
 * chiffre que le porteur ressent : ce qu'il aurait perdu en étant entré au
 * plus haut et sorti au plus bas.
 */
export function pireRecul(points: Point[]): number | null {
  const utiles = points.filter((p) => p.valeur > 0);
  if (utiles.length < 2) return null;
  let sommet = utiles[0].valeur;
  let pire = 0;
  for (const p of utiles) {
    if (p.valeur > sommet) sommet = p.valeur;
    const recul = p.valeur / sommet - 1;
    if (recul < pire) pire = recul;
  }
  return pire * 100;
}

/** Une série indexée base 100 à son premier point exploitable. */
export function base100(points: Point[]): Point[] {
  const premier = points.find((p) => p.valeur > 0);
  if (!premier) return [];
  return points
    .filter((p) => p.valeur > 0)
    .map((p) => ({ date: p.date, valeur: (p.valeur / premier.valeur) * 100 }));
}

/** Une série à laquelle on a enlevé des points pour tenir dans un graphique,
 *  sans jamais perdre le premier ni le dernier — ce sont eux qui portent la
 *  performance affichée à côté. */
export function alleger(points: Point[], maximum = 180): Point[] {
  if (points.length <= maximum) return points;
  const pas = Math.ceil(points.length / maximum);
  const out = points.filter((_, i) => i % pas === 0);
  const dernier = points[points.length - 1];
  if (out[out.length - 1]?.date !== dernier.date) out.push(dernier);
  return out;
}

/**
 * L'INDICE DE LA MAISON : la performance consolidée, chaînée pas à pas.
 *
 * ON NE PEUT PAS MOYENNER DES COURBES qui ne commencent pas le même jour. Un
 * fonds lancé en juin n'a rien à dire du premier semestre, et le faire entrer
 * à 100 au 1ᵉʳ janvier inventerait une performance plate pour la maison.
 *
 * On chaîne donc : à chaque pas, le rendement de la maison est la moyenne des
 * rendements des fonds PRESENTS AUX DEUX BOUTS DU PAS, pondérée par leur
 * encours au début du pas. Un fonds qui naît rejoint l'indice au pas suivant,
 * sans le faire sauter. C'est la construction d'un indice à composition
 * variable, et c'est la seule honnête ici.
 */
export function indiceMaison(
  fonds: { serie: Point[]; encours: Point[] }[],
): Point[] {
  const dates = [...new Set(fonds.flatMap((f) => f.serie.map((p) => p.date)))].sort();
  if (dates.length === 0) return [];

  // Accès « dernière valeur connue à cette date » pour chaque fonds.
  const valeurAu = (serie: Point[], d: string): number | null => {
    let retenue: number | null = null;
    for (const p of serie) {
      if (p.date > d) break;
      if (p.valeur > 0) retenue = p.valeur;
    }
    return retenue;
  };
  // Un fonds n'entre dans l'indice qu'à partir de sa PREMIERE VL : avant, il
  // n'existe pas, et « sa dernière valeur connue » n'existe pas non plus.
  const depuis = fonds.map((f) => f.serie.find((p) => p.valeur > 0)?.date ?? null);

  const out: Point[] = [{ date: dates[0], valeur: 100 }];
  let niveau = 100;

  for (let i = 1; i < dates.length; i++) {
    const avant = dates[i - 1];
    const apres = dates[i];
    let num = 0;
    let poids = 0;
    for (let k = 0; k < fonds.length; k++) {
      const debut = depuis[k];
      if (!debut || debut > avant) continue; // pas encore né au début du pas
      const v0 = valeurAu(fonds[k].serie, avant);
      const v1 = valeurAu(fonds[k].serie, apres);
      if (v0 == null || v1 == null || !(v0 > 0)) continue;
      const e = valeurAu(fonds[k].encours, avant) ?? 0;
      if (!(e > 0)) continue;
      num += e * (v1 / v0 - 1);
      poids += e;
    }
    if (poids > 0) niveau *= 1 + num / poids;
    out.push({ date: apres, valeur: niveau });
  }
  return out;
}

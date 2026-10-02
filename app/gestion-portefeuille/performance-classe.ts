// === Performance d'une classe d'actif quand il y a eu des transactions ===
//
// LE RAPPORT DE VALORISATIONS EST FAUX DES QU'ON ACHETE. Un fonds qui porte
// 500 millions d'actions au 31 décembre et 900 au 30 septembre n'a pas gagné
// 80 % : il en a peut-être acheté 350 en mars. La valorisation de fin mélange
// ce que le marché a donné et ce que le gérant a apporté, et rien dans le
// rapport des deux ne les sépare.
//
// LA METHODE DE DIETZ MODIFIEE les sépare. Elle retranche les apports du gain,
// et les ajoute à la base au PRORATA DU TEMPS pendant lequel ils ont travaillé :
//
//        V_fin − V_début − F
//   R = ──────────────────────        F = Σ Fᵢ        pondération wᵢ = (T − tᵢ)/T
//        V_début + Σ Fᵢ · wᵢ
//
// Un apport du dernier jour ne doit presque rien rapporter — il entre donc au
// dénominateur pour presque rien. Un apport du premier jour a travaillé toute
// la période et compte plein. C'est la convention du GIPS pour une période sans
// valorisation quotidienne, et c'est exactement notre cas : on a deux
// inventaires et des mouvements datés entre les deux.
//
// MODULE PUR. Ni base ni fichier : il se vérifie sur des nombres.

/** Un mouvement de capital daté. Positif : le capital ENTRE dans la classe. */
export type Flux = { date: string; montant: number };

const jours = (a: string, b: string): number =>
  (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000;

/**
 * Performance d'une poche sur une période, en %, flux neutralisés.
 *
 * Rend null quand la période n'a pas de durée, ou quand le capital moyen
 * engagé est nul ou négatif — une classe ouverte puis soldée dans la même
 * période n'a pas de base sur laquelle rapporter un gain, et inventer un
 * dénominateur donnerait un pourcentage à cinq chiffres.
 */
export function dietzModifie(
  vDebut: number,
  vFin: number,
  flux: Flux[],
  debut: string,
  fin: string,
): number | null {
  const duree = jours(debut, fin);
  if (!(duree > 0)) return null;

  let net = 0;
  let pondere = 0;
  for (const f of flux) {
    if (f.date < debut || f.date > fin || !Number.isFinite(f.montant)) continue;
    net += f.montant;
    // Le poids est la part de la période qui RESTE après l'apport.
    const w = (duree - jours(debut, f.date)) / duree;
    pondere += f.montant * Math.min(1, Math.max(0, w));
  }

  const base = vDebut + pondere;
  if (!(base > 0)) return null;
  return ((vFin - vDebut - net) / base) * 100;
}

/**
 * Le poids des flux dans la période, pour dire quand la mesure est tendue.
 *
 * Dietz modifiée suppose que les apports sont petits devant le capital, ou
 * bien répartis. Quand ils pèsent plus que la poche elle-même — une classe
 * doublée en cours d'année —, le chiffre reste le meilleur disponible, mais il
 * cesse d'être une performance au sens strict, et l'écran doit le dire.
 */
export function tensionDesFlux(vDebut: number, flux: Flux[]): number {
  const brut = flux.reduce((s, f) => s + Math.abs(f.montant), 0);
  const base = Math.abs(vDebut);
  if (base <= 0) return brut > 0 ? Infinity : 0;
  return brut / base;
}

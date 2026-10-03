import "server-only";

// === Le rendement d'une poche de titres, mouvements reconstruits ============
//
// UNE POCHE N'EST PAS UN TITRE. Entre deux inventaires, le gérant a acheté,
// vendu, encaissé des coupons et reçu des amortissements. Le rapport des
// valorisations compte tout cela comme de la performance ; mesurer ligne à
// ligne le seul prix unitaire élimine les apports, mais oblige à JETER toute
// ligne vendue — et chez NSIA FONDS DIVERSIFIE, les trois quarts de la poche
// obligataire ont tourné : on mesurait 23 % et on extrapolait le reste.
//
// ON RECONSTRUIT DONC LES MOUVEMENTS, et on applique la Dietz modifiée.
//
//   R = (V₁ − V₀ − ΣF) ÷ (V₀ + Σ Fᵢ·wᵢ)      wᵢ = (T − tᵢ)/T
//
// CE QUE CETTE FORME CONTIENT, SANS QU'IL FAILLE L'AJOUTER :
//
//   LES COUPONS COURUS. La valorisation d'inventaire porte le couru ; V₁ − V₀
//   contient donc l'intérêt couru sur la période, et le coupon DETACHE, qui
//   sort de la poche, revient au numérateur en tant que flux. La somme des
//   deux est exactement le coupon couru de la période — c'est une identité,
//   pas une approximation : couru₁ − couru₀ + coupons détachés = taux × VN ×
//   jours/365.
//
//   LA DECOTE ET LA SURCOTE. Un titre acheté sous le pair entre au
//   dénominateur pour son PRIX DE REVIENT et ressort au numérateur pour sa
//   valeur d'inventaire : l'écart au nominal se constate de lui-même. Acheté
//   au-dessus du pair, il joue en sens inverse.
//
//   LES AMORTISSEMENTS N'Y SONT PAS, et c'est voulu. Un remboursement de
//   capital est un FLUX DE SORTIE, pas un produit : la Dietz le retranche du
//   gain, donc il ne rapporte rien. Il sort aussi du dénominateur au prorata
//   du temps restant, ce qui est juste — ce capital-là ne travaille plus.
//
// D'OU VIENNENT LES MOUVEMENTS. Des ORDRES DENOUES quand le carnet en porte
// la trace — date et montant réels, frais et courus compris. Sinon, de l'écart
// de quantité entre les deux inventaires, daté AU MILIEU DE LA PERIODE : c'est
// la convention retenue faute de mieux, et pour une fenêtre d'exercice plein
// elle tombe sur le 30 juin.

import {
  loadOperationsMarche,
} from "./operations-marche-data";
import {
  montantExecution,
  sensDe,
  type Instrument,
} from "./operations-marche-types";

/** Un mouvement de capital daté. Positif : le capital ENTRE dans la poche. */
export type Flux = { date: string; montant: number };

export const jours = (a: string, b: string): number =>
  (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000;

/**
 * Le milieu de la période — la date par défaut des mouvements non tracés.
 *
 * Pour un exercice plein, du 31 décembre au 31 décembre, elle tombe sur le
 * 30 juin. Un apport du dernier jour ne doit presque rien rapporter, un apport
 * du premier jour compte plein ; à défaut de savoir, le milieu est le choix
 * qui ne penche d'aucun côté.
 */
export function milieuDe(debut: string, fin: string): string {
  const t = (new Date(`${debut}T00:00:00Z`).getTime() + new Date(`${fin}T00:00:00Z`).getTime()) / 2;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Dietz modifiée : performance d'une poche, flux neutralisés au prorata du
 * temps pendant lequel ils ont travaillé. Convention GIPS pour une période
 * sans valorisation quotidienne — deux inventaires, et des mouvements datés
 * entre les deux.
 *
 * Rend null quand le capital moyen engagé est nul ou négatif : une poche
 * ouverte puis soldée dans la même période n'a pas de base sur laquelle
 * rapporter un gain, et inventer un dénominateur donnerait cinq chiffres.
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
    if (!Number.isFinite(f.montant) || f.montant === 0) continue;
    const t = f.date < debut ? debut : f.date > fin ? fin : f.date;
    net += f.montant;
    const w = (duree - jours(debut, t)) / duree;
    pondere += f.montant * Math.min(1, Math.max(0, w));
  }

  const base = vDebut + pondere;
  if (!(base > 0)) return null;
  return ((vFin - vDebut - net) / base) * 100;
}

/** Un mouvement de titres lu au carnet d'ordres : quantité ET argent. */
export type MouvementOrdre = { date: string; quantite: number; montant: number };

/**
 * Les mouvements DENOUES du carnet, par titre, dans la fenêtre.
 *
 * ON NE COMPTE QUE CE QUI EST DENOUE : un ordre passé et non servi n'a déplacé
 * aucun capital. C'est la date de dénouement qui fait foi, celle où le titre
 * entre au portefeuille, et non la date de l'ordre.
 *
 * La clef est le CODE de l'ordre, normalisé — le même identifiant que celui
 * sous lequel l'inventaire range ses lignes.
 */
export async function mouvementsDuCarnet(
  fundId: string,
  debut: string,
  fin: string,
  instruments: Instrument[],
  normId: (s: string | null | undefined) => string,
): Promise<Map<string, MouvementOrdre[]>> {
  const operations = await loadOperationsMarche(fundId);
  const out = new Map<string, MouvementOrdre[]>();
  const vise = new Set(instruments);

  for (const o of operations) {
    if (!vise.has(o.instrument)) continue;
    const k = normId(o.code);
    if (!k) continue;
    const signe = sensDe(o.description) === "achat" ? 1 : -1;
    for (const e of o.executions) {
      const date = e.dateDenouement;
      if (!date || date < debut || date > fin) continue;
      const montant = montantExecution(o, e);
      if (!Number.isFinite(montant) || montant === 0) continue;
      const liste = out.get(k) ?? [];
      liste.push({ date, quantite: signe * e.quantite, montant: signe * montant });
      out.set(k, liste);
    }
  }
  return out;
}

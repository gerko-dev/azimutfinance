// Helpers de formatage partagés — source unique pour l'affichage des montants
// en FCFA. Le formatage était jusqu'ici dupliqué (et divergent) dans ~6
// fichiers : page d'accueil, espace pro, macro immobilier, et les `format.ts`
// des domaines compte-titre / simulateur / admin.
//
// La centralisation est un simple dédoublonnage : chaque rendu préexistant est
// conservé à l'identique, exposé ici sous un nom explicite. Aucune page ne
// change d'apparence — les variantes divergentes sont préservées via le
// paramètre `variant` de `fmtFCFAShort`.

/**
 * Montant brut, séparateurs de milliers fr-FR, sans arrondi ni garde.
 * Équivalent littéral de `v.toLocaleString("fr-FR")`.
 * Utilisé par les pages simulateur qui passent des valeurs déjà entières
 * (prix BRVM, volumes) ou qui veulent afficher les décimales telles quelles.
 */
export function fmtFCFAPlain(v: number): string {
  return v.toLocaleString("fr-FR");
}

/**
 * Montant entier, séparateurs fr-FR. Arrondi à l'unité, `"—"` si valeur non
 * finie. C'est le rendu « exact » du simulateur et du suivi de compte titre.
 */
export function fmtFCFAExact(v: number): string {
  if (!isFinite(v)) return "—";
  return Math.round(v).toLocaleString("fr-FR");
}

export type FCFAShortVariant = "default" | "admin" | "simulator";

/**
 * Montant abrégé (« 1,5 M »). Trois variantes, correspondant aux trois
 * comportements préexistants — à conserver à l'identique :
 *  - `"default"`   : Md / M (1 déc.) / k — page d'accueil, macro immobilier
 *  - `"admin"`     : M (1 déc.) / k — pas de palier Md
 *  - `"simulator"` : Md / M (2 déc.) — pas de palier k (nombre entier sous 1 M)
 *
 * Accepte `null` (toléré par la variante macro) → `"—"`.
 */
export function fmtFCFAShort(
  v: number | null,
  variant: FCFAShortVariant = "default",
): string {
  if (v === null || !isFinite(v)) return "—";
  const abs = Math.abs(v);

  if (variant === "admin") {
    if (abs >= 1_000_000)
      return `${(v / 1_000_000).toFixed(1).replace(".", ",")} M`;
    if (abs >= 1_000)
      return `${Math.round(v / 1_000).toLocaleString("fr-FR")} k`;
    return Math.round(v).toLocaleString("fr-FR");
  }

  if (variant === "simulator") {
    if (abs >= 1_000_000_000)
      return `${(v / 1_000_000_000).toFixed(2).replace(".", ",")} Md`;
    if (abs >= 1_000_000)
      return `${(v / 1_000_000).toFixed(2).replace(".", ",")} M`;
    return Math.round(v).toLocaleString("fr-FR");
  }

  // "default" — page d'accueil + macro immobilier
  if (abs >= 1_000_000_000)
    return `${(v / 1_000_000_000).toFixed(2).replace(".", ",")} Md`;
  if (abs >= 1_000_000)
    return `${(v / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (abs >= 1_000)
    return `${Math.round(v / 1_000).toLocaleString("fr-FR")} k`;
  return Math.round(v).toLocaleString("fr-FR");
}

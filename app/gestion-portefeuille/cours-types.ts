// === Dernier cours d'un titre : type et sélecteur ===
//
// CE FICHIER NE LIT RIEN. Il est importé par des composants clients, et la
// lecture des cours vit dans `cours-data.ts`, qui ouvre des fichiers avec le
// `fs` de Node — inutilisable au navigateur.
//
// Les avoir mêlés faisait entrer `dataLoader` dans le bundle client, et le
// module entier refusait de se construire : « module not found: fs ». Le type
// et le sélecteur, eux, sont de simples opérations sur une Map.

export type CoursSite = {
  /** Dernier cours connu. */
  prix: number;
  /** Date de ce cours. Affichée : un cours sans date se croit du jour. */
  date: string;
  /** D'où il vient, pour que le chiffre soit traçable. */
  source: "BRVM — actions" | "BRVM — obligations";
};

export const cleCours = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase().replace(/\s+/g, "");

/** Dernier cours d'une ligne, cherchée sous ses désignations successives. */
export function coursDe(
  index: Map<string, CoursSite>,
  ...designations: (string | null | undefined)[]
): CoursSite | null {
  for (const d of designations) {
    const c = index.get(cleCours(d));
    if (c) return c;
  }
  return null;
}

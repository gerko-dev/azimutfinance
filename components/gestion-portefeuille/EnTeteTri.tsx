"use client";

// === Un en-tête de colonne qui trie ===
//
// LE MEME GESTE PARTOUT. Le carnet d'opérations trie par clic sur l'en-tête ;
// le récapitulatif du primaire doit trier de la même façon, sinon on apprend
// deux habitudes pour une seule idée. Le composant est donc GENERIQUE sur le
// nom de colonne : chaque tableau garde sa propre liste de colonnes, et ne
// partage que la mécanique.

import type { ReactNode } from "react";

/** Colonne de tri, et son sens. */
export type Tri<C extends string> = { col: C; desc: boolean };

/**
 * LA FLECHE NE S'AFFICHE QUE SUR LA COLONNE ACTIVE. Un chevron gris sur chaque
 * colonne dit « on peut trier » et noie celle qui trie réellement ; c'est le
 * curseur et le survol qui annoncent la possibilité.
 */
export default function EnTeteTri<C extends string>({
  col,
  tri,
  onTrier,
  aDroite,
  children,
}: {
  col: C;
  tri: Tri<C>;
  onTrier: (c: C) => void;
  aDroite?: boolean;
  children: ReactNode;
}) {
  const actif = tri.col === col;
  return (
    <th className={`px-3 py-2 font-medium ${aDroite ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onTrier(col)}
        className={`inline-flex items-center gap-1 hover:text-slate-900 ${
          actif ? "text-slate-900" : ""
        }`}
      >
        {children}
        {actif && <span className="text-[9px]">{tri.desc ? "▼" : "▲"}</span>}
      </button>
    </th>
  );
}

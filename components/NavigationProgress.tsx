"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

/**
 * Barre de progression affichée pendant une navigation.
 *
 * `useLinkStatus` ne se lit QUE depuis un descendant d'un `<Link>` : il n'y a
 * pas d'état de navigation global à observer. L'indicateur vit donc dans le
 * lien, et se positionne en `fixed` pour s'afficher en haut de la fenêtre —
 * il est rendu depuis le lien, mais ne s'affiche pas à côté de lui.
 *
 * Le retard de 100 ms est porté par l'animation CSS, pas par un `setTimeout` :
 * un minuteur imposerait un état React de plus par lien monté, et il y en a
 * des dizaines par page.
 */
function BarreDeProgression() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span aria-hidden className="az-nav-progress" />;
}

/**
 * `<Lien>` — un `next/link` qui signale son propre chargement.
 *
 * Remplacement direct de `<Link>` : mêmes props, même comportement. Il ajoute
 * seulement la barre de progression quand la navigation dure.
 *
 * EMPLOYÉ PARTOUT, et sans coût quand il ne sert pas : sur une destination
 * préchargée, `pending` ne passe jamais à vrai et le composant ne rend
 * AUCUN nœud. Il n'y a donc ni décalage de mise en page ni élément parasite
 * dans les liens — seulement un appel de hook de plus par lien monté.
 *
 * Ce n'est pas la réponse de fond : `loading.tsx` l'est, parce qu'il montre la
 * structure de la page au lieu d'un simple trait. Les deux se complètent — la
 * barre couvre l'instant où le squelette lui-même n'est pas encore arrivé,
 * réseau lent ou préchargement inachevé.
 */
export default function Lien(props: ComponentProps<typeof Link>) {
  const { children, ...reste } = props;
  return (
    <Link {...reste}>
      {children}
      <BarreDeProgression />
    </Link>
  );
}

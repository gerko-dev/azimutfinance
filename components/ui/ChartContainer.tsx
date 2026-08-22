"use client";

import * as React from "react";
import { ResponsiveContainer as RechartsResponsiveContainer } from "recharts";

type ResponsiveContainerProps = React.ComponentProps<
  typeof RechartsResponsiveContainer
>;

/**
 * `ResponsiveContainer` de Recharts avec une dimension initiale positive.
 *
 * Par défaut Recharts initialise le conteneur à `{ width: -1, height: -1 }` :
 * au tout premier rendu (SSR puis première peinture côté client), avant que le
 * `ResizeObserver` n'ait mesuré le conteneur, cette taille négative déclenche
 * l'avertissement « The width(-1) and height(-1) of chart should be greater
 * than 0 ». On fournit une taille initiale positive, immédiatement remplacée
 * par la taille réelle dès que l'observateur se déclenche.
 */
export function ResponsiveContainer({
  initialDimension = { width: 100, height: 100 },
  ...props
}: ResponsiveContainerProps) {
  return (
    <RechartsResponsiveContainer initialDimension={initialDimension} {...props} />
  );
}

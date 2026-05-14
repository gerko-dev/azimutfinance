import "server-only";

import { loadAllActions, loadListedBonds } from "@/lib/dataLoader";
import type { WatchlistTargetType } from "./types";

export type TargetOption = {
  /** Valeur stockée (target_code), toujours en majuscules pour stock/bond/index/currency,
   *  en minuscules pour commodity (cohérent avec validate.ts). */
  value: string;
  /** Libellé affichable dans la datalist. */
  label: string;
};

export type TargetOptionsByType = Record<WatchlistTargetType, TargetOption[]>;

const KNOWN_INDICES: Array<[string, string]> = [
  ["BRVMC", "BRVM Composite"],
  ["BRVM30", "BRVM 30"],
  ["BRVMPA", "BRVM Principal"],
  ["BRVM-SF", "BRVM Services Financiers"],
  ["BRVM-IN", "BRVM Industries"],
  ["BRVM-CB", "BRVM Conso. de base"],
  ["BRVM-CD", "BRVM Conso. discrétionnaire"],
  ["BRVM-EN", "BRVM Énergie"],
  ["BRVM-SP", "BRVM Services Publics"],
  ["BRVM-TEL", "BRVM Télécommunications"],
];

const KNOWN_CURRENCIES: Array<[string, string]> = [
  ["USD/XOF", "USD / XOF"],
  ["EUR/XOF", "EUR / XOF"],
  ["GBP/XOF", "GBP / XOF"],
  ["JPY/XOF", "JPY / XOF"],
  ["NGN/XOF", "NGN / XOF"],
  ["TRY/XOF", "TRY / XOF"],
  ["ZAR/XOF", "ZAR / XOF"],
  ["BRL/XOF", "BRL / XOF"],
  ["AED/XOF", "AED / XOF"],
  ["CAD/XOF", "CAD / XOF"],
  ["GBP/USD", "GBP / USD"],
  ["EUR/USD", "EUR / USD"],
  ["USD/CNY", "USD / CNY"],
  ["DXY", "Dollar Index"],
];

const KNOWN_COMMODITIES: Array<[string, string]> = [
  ["cacao", "Cacao"],
  ["cafe", "Café"],
  ["brent", "Pétrole Brent"],
  ["wti", "Pétrole WTI"],
  ["or", "Or"],
  ["sugar", "Sucre"],
  ["coton", "Coton"],
  ["caoutchouc", "Caoutchouc"],
  ["huile-de-palme", "Huile de palme"],
  ["anacarde", "Anacarde"],
];

/**
 * Construit le dictionnaire complet des cibles valides par target_type.
 * Sérialisable (que des string), donc passable en prop d'un composant client.
 */
export function getTargetOptions(): TargetOptionsByType {
  const stocks: TargetOption[] = loadAllActions()
    .map((a) => ({
      value: a.code.toUpperCase(),
      label: `${a.code.toUpperCase()} — ${a.name}`,
    }))
    .sort((a, b) => a.value.localeCompare(b.value));

  const bonds: TargetOption[] = loadListedBonds()
    .filter((b) => b.code && b.code.trim() !== "")
    .map((b) => ({
      value: b.code.toUpperCase(),
      label: `${b.code} — ${b.issuer}`,
    }))
    .sort((a, b) => a.value.localeCompare(b.value));

  return {
    stock: stocks,
    bond: bonds,
    index: KNOWN_INDICES.map(([value, label]) => ({ value, label })),
    currency: KNOWN_CURRENCIES.map(([value, label]) => ({ value, label })),
    commodity: KNOWN_COMMODITIES.map(([value, label]) => ({ value, label })),
  };
}

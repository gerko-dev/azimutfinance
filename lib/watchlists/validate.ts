import "server-only";

import { loadAllActions, loadListedBonds } from "@/lib/dataLoader";
import type { WatchlistTargetType } from "./types";

/**
 * Liste des indices BRVM connus (fichiers presents dans data/historique_sika_indices/).
 * Cles : code -> label affichable.
 */
const KNOWN_INDICES: Record<string, string> = {
  BRVMC: "BRVM Composite",
  BRVM30: "BRVM 30",
  BRVMPA: "BRVM Principal",
  "BRVM-SF": "BRVM Services Financiers",
  "BRVM-IN": "BRVM Industries",
  "BRVM-CB": "BRVM Conso. de base",
  "BRVM-CD": "BRVM Conso. discrétionnaire",
  "BRVM-EN": "BRVM Énergie",
  "BRVM-SP": "BRVM Services Publics",
  "BRVM-TEL": "BRVM Télécommunications",
};

/**
 * Paires de devises suivies (data/<PAIR>.csv).
 */
const KNOWN_CURRENCIES: Record<string, string> = {
  "USD/XOF": "USD / XOF",
  "EUR/XOF": "EUR / XOF",
  "GBP/XOF": "GBP / XOF",
  "JPY/XOF": "JPY / XOF",
  "NGN/XOF": "NGN / XOF",
  "TRY/XOF": "TRY / XOF",
  "ZAR/XOF": "ZAR / XOF",
  "BRL/XOF": "BRL / XOF",
  "AED/XOF": "AED / XOF",
  "CAD/XOF": "CAD / XOF",
  "GBP/USD": "GBP / USD",
  "EUR/USD": "EUR / USD",
  "USD/CNY": "USD / CNY",
  DXY: "Dollar Index",
};

/**
 * Matieres premieres avec une page dediee (data/<slug>.csv).
 */
const KNOWN_COMMODITIES: Record<string, string> = {
  cacao: "Cacao",
  cafe: "Café",
  brent: "Pétrole Brent",
  wti: "Pétrole WTI",
  or: "Or",
  sugar: "Sucre",
  coton: "Coton",
  caoutchouc: "Caoutchouc",
  "huile-de-palme": "Huile de palme",
  anacarde: "Anacarde",
};

export type ValidateTargetResult =
  | { ok: true; label: string }
  | { ok: false; error: string };

/**
 * Valide qu'un (target_type, target_code) existe dans nos datasets.
 * Retourne ok+label si valide, sinon ok:false + message d'erreur clair.
 *
 * Cas particulier : target_code = '*' pour news_mention sur "any" → autorise
 * pour les alertes (mais pas pour la watchlist, le caller doit gerer ca).
 */
export function validateTarget(
  targetType: WatchlistTargetType,
  targetCode: string,
): ValidateTargetResult {
  const code = targetCode.toUpperCase().trim();
  if (!code) return { ok: false, error: "Code requis." };

  switch (targetType) {
    case "stock": {
      const actions = loadAllActions();
      const found = actions.find((a) => a.code.toUpperCase() === code);
      if (!found) {
        return {
          ok: false,
          error: `Action « ${code} » introuvable sur la BRVM. Vérifie le ticker (ex: SNTS, SGBC, ETIT).`,
        };
      }
      return { ok: true, label: found.name };
    }
    case "bond": {
      const bonds = loadListedBonds();
      const found = bonds.find((b) => b.code.toUpperCase() === code);
      if (!found) {
        return {
          ok: false,
          error: `Obligation « ${code} » introuvable. Utilise le symbole BRVM (ex: TPBF.O12).`,
        };
      }
      return { ok: true, label: `${found.issuer} — ${found.name}` };
    }
    case "index": {
      const label = KNOWN_INDICES[code];
      if (!label) {
        return {
          ok: false,
          error: `Indice « ${code} » inconnu. Disponibles : ${Object.keys(KNOWN_INDICES).join(", ")}.`,
        };
      }
      return { ok: true, label };
    }
    case "currency": {
      // Le code peut etre avec ou sans /
      const normalized = code.includes("/") ? code : `${code.slice(0, 3)}/${code.slice(3)}`;
      const label = KNOWN_CURRENCIES[normalized];
      if (!label) {
        return {
          ok: false,
          error: `Paire « ${code} » inconnue. Disponibles : ${Object.keys(KNOWN_CURRENCIES).join(", ")}.`,
        };
      }
      return { ok: true, label };
    }
    case "commodity": {
      const lower = code.toLowerCase();
      const label = KNOWN_COMMODITIES[lower];
      if (!label) {
        return {
          ok: false,
          error: `Matière première « ${code} » inconnue. Disponibles : ${Object.keys(KNOWN_COMMODITIES).join(", ")}.`,
        };
      }
      return { ok: true, label };
    }
  }
}

/** Variante qui accepte target_type='any' + code '*' pour les alertes news_mention. */
export function validateAlertTarget(
  targetType: string,
  targetCode: string,
): ValidateTargetResult {
  if (targetType === "any" && (targetCode === "*" || targetCode === "")) {
    return { ok: true, label: "Toutes les cibles" };
  }
  if (
    targetType === "stock" ||
    targetType === "bond" ||
    targetType === "index" ||
    targetType === "currency" ||
    targetType === "commodity"
  ) {
    return validateTarget(targetType, targetCode);
  }
  return { ok: false, error: "Type de cible invalide." };
}

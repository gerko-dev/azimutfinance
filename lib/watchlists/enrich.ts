import "server-only";

import { loadAllActions, loadListedBonds, loadPriceHistory } from "@/lib/dataLoader";
import type { WatchlistItem, WatchlistTargetType } from "./types";

export type EnrichedItem = WatchlistItem & {
  enriched: {
    price: number | null;
    unit: string | null;
    /** Variation Year-To-Date : (cours live − premier cours de l'année) / premier cours × 100. */
    ytdPct: number | null;
    sublabel: string | null;
    error: string | null;
  };
};

/**
 * Premier cours de l'année courante pour ce code (depuis historique Sika).
 * Renvoie null si aucun point depuis le 1er janvier (ex. titre suspendu, historique vide).
 */
function findYtdReferencePrice(code: string): number | null {
  const ytdStart = `${new Date().getUTCFullYear()}-01-01`;
  const history = loadPriceHistory(code);
  for (const h of history) {
    if (h.date >= ytdStart && h.value > 0) return h.value;
  }
  return null;
}

function computeYtdPct(currentPrice: number, ytdRef: number | null): number | null {
  if (!ytdRef || ytdRef <= 0 || !isFinite(currentPrice)) return null;
  return ((currentPrice - ytdRef) / ytdRef) * 100;
}

/**
 * Enrichit chaque item d'une watchlist avec son prix actuel + variation YTD.
 * Lecture des CSV cote serveur (memoisé par loadAllActions / loadListedBonds /
 * loadPriceHistory).
 */
export function enrichWatchlistItems(items: WatchlistItem[]): EnrichedItem[] {
  if (items.length === 0) return [];

  const needsStocks = items.some((i) => i.target_type === "stock");
  const needsBonds = items.some((i) => i.target_type === "bond");
  const actions = needsStocks ? loadAllActions() : [];
  const bonds = needsBonds ? loadListedBonds() : [];

  const actionsByCode = new Map(
    actions.map((a) => [a.code.toUpperCase(), a]),
  );
  const bondsByCode = new Map(
    bonds
      .filter((b) => b.code && b.code.trim() !== "")
      .map((b) => [b.code.toUpperCase(), b]),
  );

  return items.map((item) => {
    const t = item.target_type as WatchlistTargetType;
    const code = item.target_code.toUpperCase();

    if (t === "stock") {
      const a = actionsByCode.get(code);
      if (!a) {
        return {
          ...item,
          enriched: {
            price: null,
            unit: null,
            ytdPct: null,
            sublabel: null,
            error: "Titre introuvable",
          },
        };
      }
      const ytdRef = findYtdReferencePrice(code);
      return {
        ...item,
        enriched: {
          price: a.price,
          unit: "FCFA",
          ytdPct: computeYtdPct(a.price, ytdRef),
          sublabel: `${a.sector} · ${a.country}`,
          error: null,
        },
      };
    }

    if (t === "index") {
      // Indices : pas de snapshot live distinct, on prend le dernier point
      // de l'historique Sika comme cours live et le premier de l'année comme ref.
      const history = loadPriceHistory(code);
      if (history.length === 0) {
        return {
          ...item,
          enriched: {
            price: null,
            unit: null,
            ytdPct: null,
            sublabel: null,
            error: "Indice introuvable",
          },
        };
      }
      const last = history[history.length - 1];
      const ytdRef = findYtdReferencePrice(code);
      return {
        ...item,
        enriched: {
          price: last.value,
          unit: "pts",
          ytdPct: computeYtdPct(last.value, ytdRef),
          sublabel: `au ${last.date}`,
          error: null,
        },
      };
    }

    if (t === "bond") {
      const b = bondsByCode.get(code);
      if (!b) {
        return {
          ...item,
          enriched: {
            price: null,
            unit: null,
            ytdPct: null,
            sublabel: null,
            error: "Obligation introuvable",
          },
        };
      }
      return {
        ...item,
        enriched: {
          price: null,
          unit: null,
          ytdPct: null,
          sublabel: `${b.issuerType} · ${b.country}`,
          error: null,
        },
      };
    }

    // currency, commodity : pas de live ni d'YTD pour cette itération
    return {
      ...item,
      enriched: {
        price: null,
        unit: null,
        ytdPct: null,
        sublabel: null,
        error: null,
      },
    };
  });
}

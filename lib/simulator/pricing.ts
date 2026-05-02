// === Helper : derniers prix de cloture pour le simulateur ===
//
// Lit l'historique CSV (memoise par dataLoader) et expose une map
// code -> { price, date } correspondant au dernier cours connu.

import { loadStocks, loadPriceHistory } from "@/lib/dataLoader";

let _latestCache: Map<string, { price: number; date: string; name: string; sector: string }> | null = null;

export type LatestPrice = {
  code: string;
  name: string;
  sector: string;
  price: number;
  date: string; // YYYY-MM-DD
};

export function getLatestPrices(): LatestPrice[] {
  if (_latestCache) {
    return Array.from(_latestCache.entries()).map(([code, v]) => ({
      code,
      name: v.name,
      sector: v.sector,
      price: v.price,
      date: v.date,
    }));
  }

  const stocks = loadStocks();
  const cache = new Map<string, { price: number; date: string; name: string; sector: string }>();

  for (const s of stocks) {
    const code = s.code?.trim();
    if (!code) continue;
    const history = loadPriceHistory(code);
    if (!history.length) continue;
    // Tri croissant + prendre le dernier
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    if (!last || !(last.value > 0)) continue;
    cache.set(code, {
      price: last.value,
      date: last.date,
      name: s.name?.trim() ?? code,
      sector: s.sector?.trim() ?? "—",
    });
  }

  _latestCache = cache;
  return Array.from(cache.entries()).map(([code, v]) => ({
    code,
    name: v.name,
    sector: v.sector,
    price: v.price,
    date: v.date,
  }));
}

export function getLatestPrice(code: string): LatestPrice | null {
  // Force le warm-up
  getLatestPrices();
  const v = _latestCache?.get(code.toUpperCase());
  if (!v) return null;
  return {
    code: code.toUpperCase(),
    name: v.name,
    sector: v.sector,
    price: v.price,
    date: v.date,
  };
}

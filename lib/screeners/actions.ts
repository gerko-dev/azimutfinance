import "server-only";

import {
  loadAllActionsEnriched,
  buildRiskReturnDataset,
  loadMultipleIndicesHistory,
  loadAverageVolumes,
} from "@/lib/dataLoader";
import { computeAllQuadrants, computeReturnsMatrix } from "@/lib/stockStats";
import { computeFundScreenerSnapshotsMulti } from "@/lib/fundamentalsCalc";

/**
 * Lignes du screener actions.
 *
 * Extrait de app/pros/screener pour que le Pro Terminal et l'espace Outils
 * partagent une seule construction : deux copies auraient diverge des la
 * premiere colonne ajoutee d'un cote seulement.
 *
 * Chaque source est appelee UNE fois puis indexee — `loadMultipleIndicesHistory`
 * lit tout l'historique d'un coup plutot qu'un appel par titre.
 */
export async function buildActionsScreenerRows() {
  const actions = await loadAllActionsEnriched();
  const riskReturn = buildRiskReturnDataset();
  const quadrants = computeAllQuadrants(riskReturn.points);
  const volMap = new Map(riskReturn.points.map((p) => [p.code, p.volatility]));
  const fundMultiMap = computeFundScreenerSnapshotsMulti();
  const avgVolume30 = loadAverageVolumes(30);

  const histories = loadMultipleIndicesHistory(actions.map((a) => a.code));
  const yearChangeMap = new Map<string, number | null>();
  for (const a of actions) {
    const m = computeReturnsMatrix(histories[a.code] ?? []);
    yearChangeMap.set(a.code, m["1A"]);
  }

  return actions.map((a) => ({
    ...a,
    volatility: volMap.get(a.code) ?? null,
    quadrant: quadrants.get(a.code) ?? null,
    yearChange: yearChangeMap.get(a.code) ?? null,
    avgVolume: avgVolume30.get(a.code) ?? null,
    fundByWindow: fundMultiMap.get(a.code) ?? null,
  }));
}

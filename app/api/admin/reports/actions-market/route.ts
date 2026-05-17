// Genere le PDF "Marche des actions BRVM" pour partage reseaux sociaux.
// Reserve aux super-admins (level 1). Le payload final est un PDF binaire.

import { createElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAdmin } from "@/lib/admin/auth";
import {
  loadAllActionsEnriched,
  getActionsMarketStats,
} from "@/lib/dataLoader";
import { getBrvmIndicesSnapshot } from "@/lib/brvm/liveIndices";
import { getBrvmSnapshot } from "@/lib/brvm/liveQuotes";
import {
  ActionsMarketReport,
  type ActionsReportData,
} from "@/lib/reports/actionsMarketReport";

// react-pdf utilise des modules natifs (yoga, fontkit) -> Node runtime requis.
export const runtime = "nodejs";
// Le PDF est genere a la volee avec les donnees live courantes.
export const dynamic = "force-dynamic";

export async function GET() {
  // Reserve aux super-admins (N1).
  await requireAdmin(1);

  // Donnees live + statiques pour le rapport.
  const [actions, indicesSnapshot, brvmSnapshot] = await Promise.all([
    loadAllActionsEnriched(),
    getBrvmIndicesSnapshot(),
    getBrvmSnapshot(),
  ]);

  // Reconciliation : utilise les cours live BRVM pour les actions.
  const liveByCode = new Map(brvmSnapshot.quotes.map((q) => [q.code, q]));
  const enrichedActions = actions.map((a) => {
    const live = liveByCode.get(a.code);
    if (!live || !Number.isFinite(live.currentPrice) || live.currentPrice <= 0) {
      return a;
    }
    return {
      ...a,
      price: live.currentPrice,
      changePercent: Number.isFinite(live.variationPct) ? live.variationPct : a.changePercent,
      volume: Number.isFinite(live.volume) ? live.volume : a.volume,
    };
  });

  const marketStats = getActionsMarketStats(enrichedActions);

  const data: ActionsReportData = {
    generatedAt: new Date(),
    actions: enrichedActions,
    indices: indicesSnapshot.indices,
    sessionLabel: indicesSnapshot.sessionLabel ?? brvmSnapshot.sessionLabel,
    marketStats: {
      totalActions: marketStats.totalActions,
      totalCapitalization: marketStats.totalCapitalization,
      totalVolume: marketStats.totalVolume,
      averagePer: marketStats.averagePer,
      averageYield: marketStats.averageYield,
      bySector: marketStats.bySector,
    },
  };

  // Rendu PDF -> Buffer Node. createElement plutot que JSX pour rester en .ts
  // (Next 16 n'accepte pas les route handlers en .tsx).
  const buffer = await renderToBuffer(createElement(ActionsMarketReport, { data }));

  const dateTag = new Date().toISOString().slice(0, 10);
  const filename = `azimutfinance-marche-actions-${dateTag}.pdf`;

  return new NextResponse(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLatestPrices } from "@/lib/simulator/pricing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/evaluate-simulator-orders
 *
 * À déclencher après chaque ingestion BRVM (workflows scrape-* qui mettent
 * à jour `data/historique_sika/*.csv`). Pour chaque saison active :
 *   1. Lit les nouveaux cours BRVM CSV (getLatestPrices → ref_prices)
 *   2. Appelle simulator_evaluate_pending_orders qui :
 *      - annule les LIMIT/STOP hors bande ±7,5 % (refund cash BUY)
 *      - déclenche les STOP touchés, les convertit en MARKET, matche
 *      - retente le matching des LIMIT toujours dans la bande
 *   3. Appelle simulator_expire_orders pour les DAY/GTD échus
 *
 * Auth : header `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const { data: seasons, error: seasonsErr } = await admin
    .from("simulator_seasons")
    .select("id, name, status")
    .eq("status", "active");
  if (seasonsErr) {
    return NextResponse.json(
      { ok: false, error: seasonsErr.message },
      { status: 500 },
    );
  }
  const activeSeasons = seasons ?? [];

  const latest = getLatestPrices();
  const refPrices: Record<string, number> = {};
  for (const s of latest) {
    if (s.price > 0) refPrices[s.code] = Math.round(s.price);
  }

  const perSeason: Array<{
    season_id: string;
    name: string;
    cancelled_out_of_band: number;
    stop_triggered: number;
    limit_rematched: number;
    total_refund: number;
  }> = [];

  for (const s of activeSeasons as Array<{ id: string; name: string }>) {
    const { data, error } = await admin.rpc(
      "simulator_evaluate_pending_orders",
      {
        p_season_id: s.id,
        p_ref_prices: refPrices,
      },
    );
    if (error) {
      perSeason.push({
        season_id: s.id,
        name: s.name,
        cancelled_out_of_band: 0,
        stop_triggered: 0,
        limit_rematched: 0,
        total_refund: 0,
      });
      continue;
    }
    const r = (data ?? {}) as {
      cancelled_out_of_band?: number;
      stop_triggered?: number;
      limit_rematched?: number;
      total_refund?: number;
    };
    perSeason.push({
      season_id: s.id,
      name: s.name,
      cancelled_out_of_band: r.cancelled_out_of_band ?? 0,
      stop_triggered: r.stop_triggered ?? 0,
      limit_rematched: r.limit_rematched ?? 0,
      total_refund: r.total_refund ?? 0,
    });
  }

  // Housekeeping : ordres DAY/GTD échus
  const { data: expData } = await admin.rpc("simulator_expire_orders");
  const expired = (expData ?? {}) as {
    expired_count?: number;
    total_refund?: number;
  };

  return NextResponse.json({
    ok: true,
    active_seasons: activeSeasons.length,
    ref_prices_count: Object.keys(refPrices).length,
    per_season: perSeason,
    expired_count: expired.expired_count ?? 0,
    expired_refund: expired.total_refund ?? 0,
  });
}

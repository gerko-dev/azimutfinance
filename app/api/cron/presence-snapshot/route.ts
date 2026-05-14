import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/presence-snapshot
 *
 * Déclenche le snapshot 8 h de présence du site (RPC presence_take_snapshot) :
 *  - archive les sessions terminées dans public.presence_sessions
 *  - insère un agrégat par rôle dans public.presence_snapshots
 *
 * Auth : header `Authorization: Bearer <CRON_SECRET>` (env var).
 * Cadence : toutes les 8 h — cf. .github/workflows/presence-snapshot.yml.
 * Idempotent : rejouable sans casse (chaque appel produit un nouveau snapshot).
 *
 * Pré-requis : la migration supabase/presence_v2.sql doit avoir été appliquée.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré sur le serveur." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("presence_take_snapshot");
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, result: data });
}

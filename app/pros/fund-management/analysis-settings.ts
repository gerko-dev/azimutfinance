"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

// Réglages saisis sur l'onglet Analyse de performance, persistés par fonds.
// Tous les champs sont optionnels (l'UI applique ses défauts si absent).
export type AnalysisSettings = {
  dateDebut?: string;
  dateFin?: string;
  rf?: string; // taux sans risque (%)
  objW?: Record<string, string>; // pondérations objectives par classe (%)
  beDiff?: Record<string, string>; // cible diff. perf. breakeven par classe (%)
  secW?: Record<string, string>; // pondération nécessaire par secteur (%)
  secBe?: Record<string, string>; // cible diff. perf. breakeven par secteur (%)
  allocValidee?: Record<string, string>; // allocation validée par classe (%) — rééquilibrage
  secAllocValidee?: Record<string, string>; // allocation validée par secteur Actions (%)
  allocProposee?: Record<string, string>; // allocation proposée par classe (%) — proposition
  secAllocProposee?: Record<string, string>; // allocation proposée par secteur Actions (%)
};

export async function loadAnalysisSettings(
  fundId: string,
): Promise<ActionResult<{ settings: AnalysisSettings }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { data, error } = await supabase
    .from("fund_analysis_settings")
    .select("settings")
    .eq("fund_id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { settings: (data?.settings ?? {}) as AnalysisSettings } };
}

export async function saveAnalysisSettings(
  fundId: string,
  settings: AnalysisSettings,
): Promise<ActionResult<Record<string, never>>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { error } = await supabase
    .from("fund_analysis_settings")
    .upsert(
      { fund_id: fundId, owner_id: user.id, settings },
      { onConflict: "fund_id,owner_id" },
    );
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: {} };
}

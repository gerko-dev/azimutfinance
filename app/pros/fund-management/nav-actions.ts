"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";
import { parseNavBuffer } from "./nav-parse";

// Saisie d'un point de VL (valeurs en texte, converties à la persistance).
export type NavPointInput = {
  date: string;
  vl: string;
  parts: string;
  actifNet: string;
  actifBrut: string;
};

function parseNum(s: string): number | null {
  const v = (s ?? "").toString().trim().replace(/[\s  ]/g, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type FundCtx =
  | { ok: false; error: string }
  | { ok: true; supabase: ServerClient; userId: string };

async function requireFund(fundId: string): Promise<FundCtx> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };
  const { data: fund } = await supabase
    .from("managed_funds")
    .select("id")
    .eq("id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!fund) return { ok: false, error: "Fonds introuvable." };
  return { ok: true, supabase, userId: user.id };
}

// Ajoute ou met à jour un point de VL (upsert par date).
export async function upsertNavPointAction(
  fundId: string,
  input: NavPointInput,
): Promise<ActionResult<null>> {
  const ctx = await requireFund(fundId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, userId } = ctx;

  const date = (input.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { ok: false, error: "Date invalide (format attendu AAAA-MM-JJ)." };

  const { error } = await supabase.from("fund_nav_history").upsert(
    {
      owner_id: userId,
      fund_id: fundId,
      as_of_date: date,
      vl: parseNum(input.vl),
      nombre_parts: parseNum(input.parts),
      actif_net: parseNum(input.actifNet),
      actif_brut: parseNum(input.actifBrut),
    },
    { onConflict: "fund_id,as_of_date" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/pros/fund-management/fonds/${fundId}`);
  return { ok: true, data: null };
}

// Supprime le point de VL d'une date donnée.
export async function deleteNavPointAction(
  fundId: string,
  date: string,
): Promise<ActionResult<null>> {
  const ctx = await requireFund(fundId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase } = ctx;

  const { error } = await supabase
    .from("fund_nav_history")
    .delete()
    .eq("fund_id", fundId)
    .eq("as_of_date", date);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/pros/fund-management/fonds/${fundId}`);
  return { ok: true, data: null };
}

// Importe un historique VL / actif net (.xlsx) pour un fonds.
// Upsert par date : ajoute les dates manquantes, écrase les dates existantes.
export async function importNavAction(
  fundId: string,
  formData: FormData,
): Promise<ActionResult<{ imported: number; minDate: string; maxDate: string }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté pour importer." };

  const { data: fund } = await supabase
    .from("managed_funds")
    .select("id")
    .eq("id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!fund) return { ok: false, error: "Fonds introuvable." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Aucun fichier reçu." };
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xlsm"))
    return { ok: false, error: "Format non supporté : dépose un fichier Excel (.xlsx)." };

  let points;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    points = await parseNavBuffer(buffer);
  } catch {
    return { ok: false, error: "Impossible de lire le fichier Excel." };
  }
  if (points.length === 0)
    return { ok: false, error: "Aucune ligne de valeur liquidative détectée." };

  const rows = points.map((p) => ({
    owner_id: user.id,
    fund_id: fundId,
    as_of_date: p.date,
    vl: p.vl,
    nombre_parts: p.parts,
    actif_net: p.actifNet,
    actif_brut: p.actifBrut,
  }));

  // Upsert par (fund_id, as_of_date) : additif + écrasement des dates connues.
  // Insertion par lots pour rester sous les limites de payload.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("fund_nav_history")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "fund_id,as_of_date" });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/pros/fund-management/fonds/${fundId}`);
  return {
    ok: true,
    data: { imported: points.length, minDate: points[0].date, maxDate: points[points.length - 1].date },
  };
}

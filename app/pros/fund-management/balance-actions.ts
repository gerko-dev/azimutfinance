"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";
import { parseBalanceBuffer, type ClassMap } from "./balance-parse";

// Balance telle que stockée / rechargée. `gain` = résultat de la période par
// classe (comptes de la balance) ; la performance est calculée dans
// l'attribution en rapportant ce gain à la valorisation d'inventaire de fin.
export type FundBalance = {
  asOfDate: string;
  allocation: ClassMap; // valeur de marché comptable (indicatif)
  gain: ClassMap; // résultat de période par classe
  total: number;
};

// Importe une balance générale (.xlsx) pour un fonds à une date d'arrêté.
// Upsert par date : ré-importer une même date remplace les valeurs.
export async function importBalanceAction(
  fundId: string,
  formData: FormData,
): Promise<ActionResult<FundBalance>> {
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
  const asOfDate = String(formData.get("asOfDate") ?? "").trim();
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Aucun fichier reçu." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate))
    return { ok: false, error: "Renseigne la date d'arrêté de la balance." };
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xlsm"))
    return { ok: false, error: "Format non supporté : dépose un fichier Excel (.xlsx)." };

  let res: Awaited<ReturnType<typeof parseBalanceBuffer>>;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    res = await parseBalanceBuffer(buffer);
  } catch {
    return { ok: false, error: "Impossible de lire la balance." };
  }
  if (res.total === 0)
    return { ok: false, error: "Aucun solde d'actif détecté dans la balance." };

  const { error } = await supabase.from("fund_balances").upsert(
    {
      owner_id: user.id,
      fund_id: fundId,
      as_of_date: asOfDate,
      allocation: res.allocation,
      gain: res.gain,
      performance: res.performance,
      income: {},
      total: res.total,
    },
    { onConflict: "fund_id,as_of_date" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/pros/fund-management/fonds/${fundId}`);
  return {
    ok: true,
    data: { asOfDate, allocation: res.allocation, gain: res.gain, total: res.total },
  };
}

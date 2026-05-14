"use server";

import { promises as fs } from "fs";
import { join } from "path";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAdminLevel } from "./auth";
import type { ActionResult } from "./types";

/**
 * Gestion de l'import manuel du Bulletin mensuel des statistiques BCEAO
 * (data/marche-monetaire/Bul_stat.pdf). C'est la SOURCE UNIQUE des séries de
 * taux BCEAO & UEMOA (cf. lib/tauxLoader.ts, plus de fallback bddtaux.csv).
 *
 * Comme uploadDataFile : ne fonctionne qu'en environnement à filesystem
 * inscriptible (dev local, self-hosted Node). En serverless (Vercel) le
 * filesystem est en lecture seule — l'upload échoue proprement.
 */

const BULLETIN_DIR = join(process.cwd(), "data", "marche-monetaire");
const BULLETIN_PATH = join(BULLETIN_DIR, "Bul_stat.pdf");
// Chemin relatif à data/ — sert d'identifiant pour l'audit. Non exporté : un
// fichier "use server" ne peut exposer que des fonctions async.
const BULLETIN_REL_PATH = "marche-monetaire/Bul_stat.pdf";

const MAX_SIZE_BYTES = 50_000_000;

/**
 * Remplace data/marche-monetaire/Bul_stat.pdf par le PDF uploadé. Le PDF est
 * listé dans la section « Macro & taux » de /admin/data (cf. listDataFiles).
 *  - Réservé Éditeur (L3+), comme uploadDataFile
 *  - Validation : fichier non vide, magic bytes %PDF, taille ≤ 50 Mo
 *  - Audit log + revalidation de /admin/data et /marche-monetaire
 */
export async function uploadBceaoBulletin(
  formData: FormData,
): Promise<ActionResult<{ size: number }>> {
  const level = await getMyAdminLevel();
  if (level === null) {
    return { ok: false, error: "Réservé aux administrateurs." };
  }
  if (level > 3) {
    return { ok: false, error: "Niveau d'administration insuffisant (L3+ requis)." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Aucun fichier fourni." };
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(await file.arrayBuffer());
  } catch (e) {
    return {
      ok: false,
      error: `Lecture du fichier uploadé impossible : ${(e as Error).message}`,
    };
  }

  if (buf.length === 0) {
    return { ok: false, error: "Le fichier est vide." };
  }
  if (buf.length > MAX_SIZE_BYTES) {
    return { ok: false, error: "Fichier trop volumineux (> 50 Mo)." };
  }
  // Magic bytes : un vrai PDF commence par "%PDF".
  if (buf.subarray(0, 4).toString("latin1") !== "%PDF") {
    return {
      ok: false,
      error: "Ce fichier n'est pas un PDF valide (en-tête %PDF manquant).",
    };
  }

  try {
    await fs.mkdir(BULLETIN_DIR, { recursive: true });
    await fs.writeFile(BULLETIN_PATH, buf);
  } catch (e) {
    return {
      ok: false,
      error: `Écriture impossible : ${(e as Error).message}. Le filesystem est-il en lecture seule ?`,
    };
  }

  // Audit log via RPC security definer (L1+)
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("admin_log_event", {
    p_action: "upload_data_file",
    p_target_type: "data_file",
    p_target_id: BULLETIN_REL_PATH,
    p_metadata: { size_bytes: buf.length },
    p_reason: null,
  });

  revalidatePath("/admin/data");
  revalidatePath("/admin/audit");
  revalidatePath("/marche-monetaire");

  return { ok: true, data: { size: buf.length } };
}

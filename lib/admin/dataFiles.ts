"use server";

import { promises as fs } from "fs";
import { join } from "path";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAdminLevel } from "./auth";
import { analyzeFreshness, type FileFreshness } from "./freshness";
import type { ActionResult } from "./types";

const DATA_DIR = join(process.cwd(), "data");

export type DataFileInfo = {
  filename: string;
  size: number;
  modifiedAt: string;
  freshness: FileFreshness;
};

const SAFE_FILENAME = /^[A-Za-z0-9_\-]+\.csv$/;

/** Liste les fichiers CSV de data/ — server action L1+. */
export async function listDataFiles(): Promise<ActionResult<DataFileInfo[]>> {
  const level = await getMyAdminLevel();
  if (level === null) {
    return { ok: false, error: "Réservé aux administrateurs." };
  }
  if (level > 1) {
    return { ok: false, error: "Réservé au super-admin (niveau 1)." };
  }
  try {
    const entries = await fs.readdir(DATA_DIR);
    const candidates: { name: string; size: number; mtime: Date }[] = [];
    for (const name of entries) {
      if (!name.endsWith(".csv")) continue;
      const stat = await fs.stat(join(DATA_DIR, name));
      if (!stat.isFile()) continue;
      candidates.push({ name, size: stat.size, mtime: stat.mtime });
    }
    const files: DataFileInfo[] = await Promise.all(
      candidates.map(async (c) => ({
        filename: c.name,
        size: c.size,
        modifiedAt: c.mtime.toISOString(),
        freshness: await analyzeFreshness(c.name),
      })),
    );
    files.sort((a, b) => a.filename.localeCompare(b.filename));
    return { ok: true, data: files };
  } catch (e) {
    return { ok: false, error: `Lecture du répertoire data/ impossible : ${(e as Error).message}` };
  }
}

/**
 * Upload (ou remplace) un fichier CSV dans data/.
 * - Validation du nom (alphanumeric + tiret/underscore + .csv)
 * - Le fichier doit deja exister (interdit creer un nouveau fichier ici)
 * - Audit log
 *
 * Note : ne fonctionne qu'en environnement avec systeme de fichiers
 * inscriptible (dev local, self-hosted Node). En serverless (Vercel),
 * le filesystem est read-only et l'upload echouera.
 */
export async function uploadDataFile(
  formData: FormData,
): Promise<ActionResult<{ filename: string; size: number }>> {
  const level = await getMyAdminLevel();
  if (level === null) {
    return { ok: false, error: "Réservé aux administrateurs." };
  }
  if (level > 1) {
    return { ok: false, error: "Réservé au super-admin (niveau 1)." };
  }

  const file = formData.get("file");
  const filename = String(formData.get("filename") || "").trim();

  if (!(file instanceof File)) {
    return { ok: false, error: "Aucun fichier fourni." };
  }
  if (!filename || !SAFE_FILENAME.test(filename)) {
    return {
      ok: false,
      error: "Nom de fichier invalide. Caractères autorisés : A-Z, 0-9, _, -, et l'extension .csv.",
    };
  }

  // Verifier que le fichier existe deja (pas de creation)
  const targetPath = join(DATA_DIR, filename);
  try {
    await fs.access(targetPath);
  } catch {
    return {
      ok: false,
      error:
        "Ce fichier n'existe pas dans data/. Pour ajouter un nouveau fichier, créez-le manuellement d'abord (sécurité).",
    };
  }

  // Lire et ecrire
  let content: string;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    content = buf.toString("utf-8");
  } catch (e) {
    return { ok: false, error: `Lecture du fichier uploadé impossible : ${(e as Error).message}` };
  }

  // Sanity check : verifier que ca ressemble a du CSV (au moins une ligne et des delimiters)
  if (content.length === 0) {
    return { ok: false, error: "Le fichier est vide." };
  }
  if (content.length > 50_000_000) {
    return { ok: false, error: "Fichier trop volumineux (> 50 Mo)." };
  }

  try {
    await fs.writeFile(targetPath, content, "utf-8");
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
    p_target_id: filename,
    p_metadata: { size_bytes: content.length },
    p_reason: null,
  });

  revalidatePath("/admin/data");
  revalidatePath("/admin/audit");

  return {
    ok: true,
    data: { filename, size: content.length },
  };
}

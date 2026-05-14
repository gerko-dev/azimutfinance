"use server";

import { promises as fs } from "fs";
import { join } from "path";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAdminLevel } from "./auth";
import {
  analyzeFreshness,
  documentFreshness,
  type FileFreshness,
} from "./freshness";
import { HIDDEN_DATA_FILES, DATA_FILES_CATALOG } from "./dataFilesCatalog";
import type { ActionResult } from "./types";

const DATA_DIR = join(process.cwd(), "data");

export type DataFileInfo = {
  /** Nom du fichier (CSV) ou chemin relatif à data/ (documents PDF gérés). */
  filename: string;
  /** Type de document : pilote le format d'upload accepté côté UI. */
  kind: "csv" | "pdf";
  size: number;
  /** ISO timestamp de dernière modification ("" si le document est absent). */
  modifiedAt: string;
  freshness: FileFreshness;
};

/**
 * Documents non-CSV gérés manuellement, listés dans le panneau /admin/data au
 * milieu des CSV. Pour l'instant : le Bulletin BCEAO (PDF), rangé dans
 * « Macro & taux » — il trie après macro.csv ("macro" < "marche").
 */
const MANAGED_PDF_DOCUMENTS: {
  filename: string;
  category: string;
  cadence: "monthly";
  description: string;
}[] = [
  {
    filename: "marche-monetaire/Bul_stat.pdf",
    category: "Macro & taux",
    cadence: "monthly",
    description:
      "Bulletin mensuel des statistiques BCEAO — source unique des taux UEMOA",
  },
];

const SAFE_FILENAME = /^[A-Za-z0-9_\-]+\.csv$/;

/** Liste les fichiers CSV de data/ — server action L1+. */
export async function listDataFiles(): Promise<ActionResult<DataFileInfo[]>> {
  const level = await getMyAdminLevel();
  if (level === null) {
    return { ok: false, error: "Réservé aux administrateurs." };
  }
  if (level > 3) {
    return { ok: false, error: "Niveau d'administration insuffisant (L3+ requis)." };
  }
  try {
    const entries = await fs.readdir(DATA_DIR);
    const candidates: { name: string; size: number; mtime: Date }[] = [];
    for (const name of entries) {
      if (!name.endsWith(".csv")) continue;
      // Masque les CSV rafraîchis automatiquement par les workflows GitHub
      // Actions et les fichiers legacy sans influence : ils n'ont plus besoin
      // d'un import manuel depuis cette page.
      if (HIDDEN_DATA_FILES.has(name)) continue;
      const stat = await fs.stat(join(DATA_DIR, name));
      if (!stat.isFile()) continue;
      candidates.push({ name, size: stat.size, mtime: stat.mtime });
    }
    const files: DataFileInfo[] = await Promise.all(
      candidates.map(async (c) => ({
        filename: c.name,
        kind: "csv" as const,
        size: c.size,
        modifiedAt: c.mtime.toISOString(),
        freshness: await analyzeFreshness(c.name),
      })),
    );

    // Documents PDF gérés (ex : Bulletin BCEAO). Listés même s'ils sont absents
    // — l'admin doit pouvoir les importer une première fois.
    for (const doc of MANAGED_PDF_DOCUMENTS) {
      let mtimeMs: number | null = null;
      let size = 0;
      try {
        const stat = await fs.stat(join(DATA_DIR, doc.filename));
        if (stat.isFile()) {
          mtimeMs = stat.mtimeMs;
          size = stat.size;
        }
      } catch {
        // Absent : on liste quand même la ligne (statut « non importé »).
      }
      files.push({
        filename: doc.filename,
        kind: "pdf",
        size,
        modifiedAt: mtimeMs !== null ? new Date(mtimeMs).toISOString() : "",
        freshness: documentFreshness(doc, mtimeMs),
      });
    }

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
  if (level > 3) {
    return { ok: false, error: "Niveau d'administration insuffisant (L3+ requis)." };
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
  // Refuse les fichiers gérés automatiquement (scraping GitHub Actions) ou
  // legacy : un upload manuel serait soit écrasé au prochain cron, soit inutile.
  if (HIDDEN_DATA_FILES.has(filename)) {
    return {
      ok: false,
      error:
        "Ce fichier est géré automatiquement (scraping) ou obsolète : il n'est pas importable manuellement.",
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

  // Validation des colonnes : l'en-tête du fichier importé doit contenir toutes
  // les colonnes attendues du catalogue. Garde-fou contre un mauvais fichier
  // déposé dans la mauvaise ligne (ou un mauvais délimiteur).
  const meta = DATA_FILES_CATALOG[filename];
  if (meta?.columns && meta.columns.length > 0) {
    let header = content.split(/\r?\n/, 1)[0] ?? "";
    if (header.charCodeAt(0) === 0xfeff) header = header.slice(1);
    const actual = new Set(
      header.split(meta.delimiter).map((c) => c.trim().replace(/^﻿/, "")),
    );
    const missing = meta.columns.filter((c) => !actual.has(c));
    if (missing.length > 0) {
      return {
        ok: false,
        error:
          `Colonnes attendues absentes de l'en-tête : ${missing.join(", ")}. ` +
          `Le fichier importé ne correspond pas à « ${filename} » ` +
          `(mauvais fichier ou mauvais délimiteur ?).`,
      };
    }
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

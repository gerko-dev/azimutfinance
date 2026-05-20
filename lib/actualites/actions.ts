"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAdminLevel } from "@/lib/admin/auth";
import type { ActionResult, Actualite } from "./types";
import { STORAGE_BUCKET } from "./types";
import { NEWS_TYPES, type NewsType } from "@/lib/newsTypes";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

/** Valide la categorie recue du formulaire ; repli 'communique' si inconnue. */
function parseCategory(raw: FormDataEntryValue | null): NewsType {
  const v = String(raw || "").trim();
  return (NEWS_TYPES as string[]).includes(v) ? (v as NewsType) : "communique";
}

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 100);
}

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Upload un fichier dans le bucket et renvoie son chemin/nom/taille. */
async function uploadAttachmentFile(
  supabase: SupabaseServer,
  file: File,
): Promise<
  | { ok: true; path: string; name: string; size: number }
  | { ok: false; error: string }
> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "Pièce jointe trop volumineuse (max 20 Mo)." };
  }
  const safeName = sanitizeFilename(file.name);
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const uniq = Math.random().toString(36).slice(2, 8);
  const path = `${yyyy}/${mm}/${uniq}-${safeName}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
  if (error) return { ok: false, error: `Upload : ${error.message}` };
  return { ok: true, path, name: file.name, size: file.size };
}

/**
 * Resout un emplacement de pièce jointe a la mise a jour : conserve, remplace
 * ou supprime. Renvoie les valeurs DB a ecrire, le chemin a effacer apres coup
 * (ancien fichier remplace/supprime) et le chemin tout juste uploade (a effacer
 * en cas d'echec DB).
 */
async function resolveAttachmentSlot(
  supabase: SupabaseServer,
  existingPath: string | null,
  file: FormDataEntryValue | null,
  remove: boolean,
): Promise<
  | {
      ok: true;
      path: string | null;
      name: string | null;
      size: number | null;
      oldToRemove: string | null;
      uploaded: string | null;
    }
  | { ok: false; error: string }
> {
  let path = existingPath;
  let name: string | null = null;
  let size: number | null = null;
  let oldToRemove: string | null = null;
  let uploaded: string | null = null;

  if (remove && path) {
    oldToRemove = path;
    path = null;
  }
  if (file instanceof File && file.size > 0) {
    if (path) oldToRemove = path; // remplacement : on efface l'ancien apres
    const r = await uploadAttachmentFile(supabase, file);
    if (!r.ok) return r;
    path = r.path;
    name = r.name;
    size = r.size;
    uploaded = r.path;
  }
  return { ok: true, path, name, size, oldToRemove, uploaded };
}

// Garde des actions actualites : Editeur (N3+) — page placee dans groupe
// Editeur de la sidebar. Nom de la fonction conserve pour eviter de toucher
// tous les call sites locaux.
async function ensureAdmin2(): Promise<{ ok: true } | { ok: false; error: string }> {
  const level = await getMyAdminLevel();
  if (level === null) return { ok: false, error: "Réservé aux administrateurs." };
  if (level > 3) return { ok: false, error: "Niveau d'administration insuffisant (L3+ requis)." };
  return { ok: true };
}

/**
 * Cree une actualite. Si formData contient un fichier (champ "attachment"),
 * il est uploade dans le bucket storage actualites-attachments.
 *
 * Champs FormData attendus :
 *   - ticker (string, required)
 *   - title (string, required)
 *   - excerpt (string, optional)
 *   - body (string, required)
 *   - source_url (string, optional)
 *   - publish (string "1" ou absent)
 *   - attachment (File, optional)   — pièce jointe principale
 *   - attachment2 (File, optional)  — pièce jointe secondaire
 */
export async function createActualite(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const category = parseCategory(formData.get("category"));
  const title = String(formData.get("title") || "").trim();
  const excerpt = String(formData.get("excerpt") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const sourceUrl = String(formData.get("source_url") || "").trim();
  const publish = formData.get("publish") === "1";
  const attachment = formData.get("attachment");
  const attachment2 = formData.get("attachment2");

  if (!ticker) return { ok: false, error: "Le ticker est obligatoire." };
  if (!title) return { ok: false, error: "Le titre est obligatoire." };
  if (!body) return { ok: false, error: "Le corps de l'article est obligatoire." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  // Upload des pièces jointes (rollback de tout fichier deja uploade si l'une
  // des etapes echoue).
  const uploadedPaths: string[] = [];
  const slots: { path: string | null; name: string | null; size: number | null }[] = [];
  for (const file of [attachment, attachment2]) {
    if (file instanceof File && file.size > 0) {
      const r = await uploadAttachmentFile(supabase, file);
      if (!r.ok) {
        if (uploadedPaths.length) {
          await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
        }
        return { ok: false, error: r.error };
      }
      uploadedPaths.push(r.path);
      slots.push({ path: r.path, name: r.name, size: r.size });
    } else {
      slots.push({ path: null, name: null, size: null });
    }
  }

  const { data, error } = await supabase
    .from("actualites")
    .insert({
      ticker,
      category,
      title,
      excerpt: excerpt || null,
      body,
      source_url: sourceUrl || null,
      attachment_path: slots[0].path,
      attachment_name: slots[0].name,
      attachment_size_bytes: slots[0].size,
      attachment2_path: slots[1].path,
      attachment2_name: slots[1].name,
      attachment2_size_bytes: slots[1].size,
      published_at: publish ? new Date().toISOString() : null,
      author_id: user.id,
    })
    .select("id")
    .single();
  if (error) {
    // Rollback des fichiers si insertion echoue
    if (uploadedPaths.length) {
      await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/actualites");
  revalidatePath("/actualites");
  return { ok: true, data: { id: data.id as string } };
}

/**
 * Met a jour une actualite. Chaque pièce jointe (principale + secondaire) peut
 * etre :
 *   - laissee telle quelle (pas de champ "attachment"/"attachment2" envoye)
 *   - remplacee (un nouveau File arrive)
 *   - supprimee ("remove_attachment"/"remove_attachment2" = "1")
 */
export async function updateActualite(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const category = parseCategory(formData.get("category"));
  const title = String(formData.get("title") || "").trim();
  const excerpt = String(formData.get("excerpt") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const sourceUrl = String(formData.get("source_url") || "").trim();
  const publish = formData.get("publish") === "1";

  if (!ticker || !title || !body) {
    return { ok: false, error: "Ticker, titre et corps obligatoires." };
  }

  const supabase = await createSupabaseServerClient();

  // Recuperer la version actuelle pour gerer les pièces jointes
  const { data: existing } = await supabase
    .from("actualites")
    .select("attachment_path, attachment2_path, published_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Actualité introuvable." };
  const prev = existing as Actualite;

  // Resolution des deux emplacements (conserver / remplacer / supprimer).
  const slot1 = await resolveAttachmentSlot(
    supabase,
    prev.attachment_path ?? null,
    formData.get("attachment"),
    formData.get("remove_attachment") === "1",
  );
  if (!slot1.ok) return { ok: false, error: slot1.error };

  const slot2 = await resolveAttachmentSlot(
    supabase,
    prev.attachment2_path ?? null,
    formData.get("attachment2"),
    formData.get("remove_attachment2") === "1",
  );
  if (!slot2.ok) {
    // Rollback du fichier slot1 tout juste uploade le cas echeant
    if (slot1.uploaded) {
      await supabase.storage.from(STORAGE_BUCKET).remove([slot1.uploaded]);
    }
    return { ok: false, error: slot2.error };
  }

  // Update DB — on n'ecrit les colonnes d'une PJ que si elle a change.
  const updateData: Record<string, unknown> = {
    ticker,
    category,
    title,
    excerpt: excerpt || null,
    body,
    source_url: sourceUrl || null,
    published_at: publish
      ? prev.published_at ?? new Date().toISOString()
      : null,
  };
  if (slot1.path !== (prev.attachment_path ?? null)) {
    updateData.attachment_path = slot1.path;
    updateData.attachment_name = slot1.name;
    updateData.attachment_size_bytes = slot1.size;
  }
  if (slot2.path !== (prev.attachment2_path ?? null)) {
    updateData.attachment2_path = slot2.path;
    updateData.attachment2_name = slot2.name;
    updateData.attachment2_size_bytes = slot2.size;
  }

  const { error } = await supabase.from("actualites").update(updateData).eq("id", id);
  if (error) {
    // En cas d'echec, supprimer les nouveaux fichiers qu'on aurait uploades
    const toRollback = [slot1.uploaded, slot2.uploaded].filter(
      (p): p is string => !!p,
    );
    if (toRollback.length) {
      await supabase.storage.from(STORAGE_BUCKET).remove(toRollback);
    }
    return { ok: false, error: error.message };
  }

  // Supprimer les anciens fichiers (remplaces ou supprimes) apres succes
  const toRemove = [slot1.oldToRemove, slot2.oldToRemove].filter(
    (p): p is string => !!p,
  );
  if (toRemove.length) {
    await supabase.storage.from(STORAGE_BUCKET).remove(toRemove);
  }

  revalidatePath("/admin/actualites");
  revalidatePath(`/admin/actualites/${id}`);
  revalidatePath("/actualites");
  revalidatePath(`/actualites/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteActualite(id: string): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("actualites")
    .select("attachment_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("actualites").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if ((existing as Actualite | null)?.attachment_path) {
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([(existing as Actualite).attachment_path as string]);
  }

  revalidatePath("/admin/actualites");
  revalidatePath("/actualites");
  return { ok: true, data: undefined };
}

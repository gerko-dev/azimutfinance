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
 *   - attachment (File, optional)
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

  if (!ticker) return { ok: false, error: "Le ticker est obligatoire." };
  if (!title) return { ok: false, error: "Le titre est obligatoire." };
  if (!body) return { ok: false, error: "Le corps de l'article est obligatoire." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  // Upload de la pièce jointe si présente
  let attachmentPath: string | null = null;
  let attachmentName: string | null = null;
  let attachmentSize: number | null = null;
  if (attachment instanceof File && attachment.size > 0) {
    if (attachment.size > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: "Pièce jointe trop volumineuse (max 20 Mo)." };
    }
    attachmentName = attachment.name;
    attachmentSize = attachment.size;
    const safeName = sanitizeFilename(attachment.name);
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const uniq = Math.random().toString(36).slice(2, 8);
    attachmentPath = `${yyyy}/${mm}/${uniq}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(attachmentPath, attachment, {
        cacheControl: "3600",
        upsert: false,
        contentType: attachment.type || undefined,
      });
    if (upErr) {
      return { ok: false, error: `Upload de la pièce jointe : ${upErr.message}` };
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
      attachment_path: attachmentPath,
      attachment_name: attachmentName,
      attachment_size_bytes: attachmentSize,
      published_at: publish ? new Date().toISOString() : null,
      author_id: user.id,
    })
    .select("id")
    .single();
  if (error) {
    // Rollback du fichier si insertion echoue
    if (attachmentPath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([attachmentPath]);
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/actualites");
  revalidatePath("/actualites");
  return { ok: true, data: { id: data.id as string } };
}

/**
 * Met a jour une actualite. Le fichier joint peut etre :
 *   - laisse tel quel (pas de champ "attachment" envoye)
 *   - remplace (un nouveau File arrive)
 *   - supprime ("remove_attachment" = "1")
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
  const removeAttachment = formData.get("remove_attachment") === "1";
  const attachment = formData.get("attachment");

  if (!ticker || !title || !body) {
    return { ok: false, error: "Ticker, titre et corps obligatoires." };
  }

  const supabase = await createSupabaseServerClient();

  // Recuperer la version actuelle pour gerer la pièce jointe
  const { data: existing } = await supabase
    .from("actualites")
    .select("attachment_path, published_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Actualité introuvable." };

  let attachmentPath: string | null = (existing as Actualite).attachment_path ?? null;
  let attachmentName: string | null = null;
  let attachmentSize: number | null = null;
  let oldPathToRemove: string | null = null;

  if (removeAttachment && attachmentPath) {
    oldPathToRemove = attachmentPath;
    attachmentPath = null;
  }

  if (attachment instanceof File && attachment.size > 0) {
    if (attachment.size > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: "Pièce jointe trop volumineuse (max 20 Mo)." };
    }
    if (attachmentPath) {
      oldPathToRemove = attachmentPath; // on remplace donc on supprime l'ancien apres
    }
    attachmentName = attachment.name;
    attachmentSize = attachment.size;
    const safeName = sanitizeFilename(attachment.name);
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const uniq = Math.random().toString(36).slice(2, 8);
    attachmentPath = `${yyyy}/${mm}/${uniq}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(attachmentPath, attachment, {
        cacheControl: "3600",
        upsert: false,
        contentType: attachment.type || undefined,
      });
    if (upErr) {
      return { ok: false, error: `Upload : ${upErr.message}` };
    }
  }

  // Update DB
  const updateData: Record<string, unknown> = {
    ticker,
    category,
    title,
    excerpt: excerpt || null,
    body,
    source_url: sourceUrl || null,
    published_at: publish
      ? (existing as Actualite).published_at ?? new Date().toISOString()
      : null,
  };
  if (attachmentPath !== (existing as Actualite).attachment_path || removeAttachment) {
    updateData.attachment_path = attachmentPath;
    updateData.attachment_name = attachmentName;
    updateData.attachment_size_bytes = attachmentSize;
  }

  const { error } = await supabase.from("actualites").update(updateData).eq("id", id);
  if (error) {
    // En cas d'echec, supprimer le nouveau fichier qu'on aurait uploade
    if (attachment instanceof File && attachment.size > 0 && attachmentPath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([attachmentPath]);
    }
    return { ok: false, error: error.message };
  }

  // Supprimer l'ancien fichier si tout s'est bien passe
  if (oldPathToRemove) {
    await supabase.storage.from(STORAGE_BUCKET).remove([oldPathToRemove]);
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";
import type { ForumReportCategoryCode } from "./types";

const REPORT_CATEGORY_CODES: ForumReportCategoryCode[] = [
  "spam",
  "harcelement",
  "insulte",
  "arnaque",
  "autre",
];

const RPC_ERRORS: Record<string, string> = {
  NOT_AUTHENTICATED: "Tu dois être connecté.",
  CATEGORY_NOT_FOUND: "Catégorie introuvable.",
  TOPIC_NOT_FOUND: "Discussion introuvable.",
  TOPIC_LOCKED: "Cette discussion est verrouillée.",
  REPLY_NOT_FOUND: "Réponse introuvable.",
  INVALID_VALUE: "Valeur de vote invalide.",
  INVALID_CATEGORY: "Catégorie de signalement invalide.",
  INVALID_TARGET_TYPE: "Type de cible invalide.",
  NOTE_TOO_LONG: "Le motif ne doit pas dépasser 500 caractères.",
  ALREADY_REPORTED: "Tu as déjà signalé cet élément.",
  NOT_AUTHORIZED: "Action non autorisée.",
  USER_SUSPENDED:
    "Ton compte est suspendu ou banni : tu ne peux pas publier sur le forum.",
  INVALID_TITLE: "Le titre doit faire entre 5 et 200 caractères.",
  INVALID_BODY: "Le message doit faire entre 10 et 10 000 caractères.",
};

function translateError(message: string): string {
  for (const code of Object.keys(RPC_ERRORS)) {
    if (message.includes(code)) return RPC_ERRORS[code];
  }
  return message;
}

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

// Detection auto des tickers BRVM dans un texte : majuscules de 3 a 6 lettres
function autoDetectTickers(text: string): string[] {
  const matches = text.match(/\b[A-Z]{3,6}\b/g) ?? [];
  return Array.from(new Set(matches)).slice(0, 10);
}

export async function createTopicAction(fd: FormData): Promise<
  ActionResult<{ topicId: string; slug: string; categorySlug: string }>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    redirect(`/connexion?redirect=${encodeURIComponent("/communaute/forum/nouveau")}`);

  const categorySlug = str(fd.get("category_slug"));
  const title = str(fd.get("title"));
  const body = str(fd.get("body"));
  const tickersRaw = str(fd.get("tickers"));

  if (!categorySlug) return { ok: false, error: "Catégorie requise." };
  if (title.length < 5)
    return { ok: false, error: "Le titre doit faire au moins 5 caractères." };
  if (title.length > 200)
    return { ok: false, error: "Le titre ne doit pas dépasser 200 caractères." };
  if (body.length < 10)
    return { ok: false, error: "Le message doit faire au moins 10 caractères." };
  if (body.length > 10000)
    return { ok: false, error: "Le message ne doit pas dépasser 10 000 caractères." };

  // Tickers : si l'utilisateur a saisi explicitement, on prend sa liste ; sinon auto-detect
  let tickers: string[] | null = null;
  if (tickersRaw) {
    tickers = tickersRaw
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{2,8}$/.test(s));
  } else {
    const detected = autoDetectTickers(`${title} ${body}`);
    tickers = detected.length > 0 ? detected : null;
  }

  const { data, error } = await supabase.rpc("forum_create_topic", {
    p_category_slug: categorySlug,
    p_title: title,
    p_body: body,
    p_tickers: tickers,
  });
  if (error) return { ok: false, error: translateError(error.message) };

  const topicId = String(data ?? "");
  revalidatePath("/communaute/forum");
  revalidatePath(`/communaute/forum/c/${categorySlug}`);

  return {
    ok: true,
    data: { topicId, slug: title, categorySlug },
  };
}

export async function createReplyAction(fd: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const topicId = str(fd.get("topic_id"));
  const body = str(fd.get("body"));

  if (!user)
    redirect(
      `/connexion?redirect=${encodeURIComponent(`/communaute/forum/t/${topicId}`)}`,
    );

  if (!topicId) return { ok: false, error: "Identifiant de discussion manquant." };
  if (body.length < 1)
    return { ok: false, error: "Le message ne peut pas être vide." };
  if (body.length > 10000)
    return { ok: false, error: "Le message ne doit pas dépasser 10 000 caractères." };

  const { error } = await supabase.rpc("forum_create_reply", {
    p_topic_id: topicId,
    p_body: body,
  });
  if (error) return { ok: false, error: translateError(error.message) };

  revalidatePath(`/communaute/forum/t/${topicId}`);
  return { ok: true, data: undefined };
}

export async function voteTopicAction(
  topicId: string,
  value: -1 | 0 | 1,
): Promise<ActionResult<{ score: number }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté pour voter." };

  const { data, error } = await supabase.rpc("forum_vote_topic", {
    p_topic_id: topicId,
    p_value: value,
  });
  if (error) return { ok: false, error: translateError(error.message) };

  return { ok: true, data: { score: typeof data === "number" ? data : 0 } };
}

export async function voteReplyAction(
  replyId: string,
  value: -1 | 0 | 1,
): Promise<ActionResult<{ score: number }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté pour voter." };

  const { data, error } = await supabase.rpc("forum_vote_reply", {
    p_reply_id: replyId,
    p_value: value,
  });
  if (error) return { ok: false, error: translateError(error.message) };

  return { ok: true, data: { score: typeof data === "number" ? data : 0 } };
}

export async function reportForumItemAction(fd: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const targetType = str(fd.get("target_type"));
  const targetId = str(fd.get("target_id"));
  const category = str(fd.get("category")) as ForumReportCategoryCode;
  const note = str(fd.get("note"));

  if (targetType !== "topic" && targetType !== "reply")
    return { ok: false, error: "Type de cible invalide." };
  if (!targetId) return { ok: false, error: "Identifiant manquant." };
  if (!REPORT_CATEGORY_CODES.includes(category))
    return { ok: false, error: "Catégorie de signalement invalide." };

  const { error } = await supabase.rpc("forum_report", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_category: category,
    p_note: note || null,
  });
  if (error) return { ok: false, error: translateError(error.message) };

  return { ok: true, data: undefined };
}

export async function updateTopicAction(fd: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const topicId = str(fd.get("topic_id"));
  const title = str(fd.get("title"));
  const body = str(fd.get("body"));
  const tickersRaw = str(fd.get("tickers"));

  if (!topicId) return { ok: false, error: "Identifiant manquant." };
  if (title.length < 5)
    return { ok: false, error: "Le titre doit faire au moins 5 caractères." };
  if (title.length > 200)
    return { ok: false, error: "Le titre ne doit pas dépasser 200 caractères." };
  if (body.length < 10)
    return { ok: false, error: "Le message doit faire au moins 10 caractères." };
  if (body.length > 10000)
    return { ok: false, error: "Le message ne doit pas dépasser 10 000 caractères." };

  let tickers: string[] | null = null;
  if (tickersRaw) {
    tickers = tickersRaw
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{2,8}$/.test(s));
    if (tickers.length === 0) tickers = null;
  }

  const { error } = await supabase.rpc("forum_update_topic", {
    p_topic_id: topicId,
    p_title: title,
    p_body: body,
    p_tickers: tickers,
  });
  if (error) return { ok: false, error: translateError(error.message) };

  revalidatePath(`/communaute/forum/t/${topicId}`);
  return { ok: true, data: undefined };
}

export async function updateReplyAction(fd: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const replyId = str(fd.get("reply_id"));
  const topicId = str(fd.get("topic_id"));
  const body = str(fd.get("body"));

  if (!replyId) return { ok: false, error: "Identifiant manquant." };
  if (body.length < 1)
    return { ok: false, error: "Le message ne peut pas être vide." };
  if (body.length > 10000)
    return { ok: false, error: "Le message ne doit pas dépasser 10 000 caractères." };

  const { error } = await supabase.rpc("forum_update_reply", {
    p_reply_id: replyId,
    p_body: body,
  });
  if (error) return { ok: false, error: translateError(error.message) };

  if (topicId) revalidatePath(`/communaute/forum/t/${topicId}`);
  return { ok: true, data: undefined };
}

export async function deleteOwnTopicAction(
  topicId: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { error } = await supabase.rpc("forum_delete_own_topic", {
    p_topic_id: topicId,
  });
  if (error) return { ok: false, error: translateError(error.message) };

  revalidatePath("/communaute/forum");
  return { ok: true, data: undefined };
}

export async function deleteOwnReplyAction(
  replyId: string,
  topicId: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { error } = await supabase.rpc("forum_delete_own_reply", {
    p_reply_id: replyId,
  });
  if (error) return { ok: false, error: translateError(error.message) };

  revalidatePath(`/communaute/forum/t/${topicId}`);
  return { ok: true, data: undefined };
}

// === Actions admin in-context (L2+ pour pin/lock, L3+ pour delete) ===

export async function adminSetTopicFlagAction(
  topicId: string,
  flags: { pinned?: boolean; locked?: boolean },
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { error } = await supabase.rpc("admin_forum_set_topic_flag", {
    p_topic_id: topicId,
    p_pinned: flags.pinned ?? null,
    p_locked: flags.locked ?? null,
  });
  if (error) return { ok: false, error: translateError(error.message) };

  revalidatePath(`/communaute/forum/t/${topicId}`);
  revalidatePath("/communaute/forum");
  return { ok: true, data: undefined };
}

export async function adminDeleteTopicAction(
  topicId: string,
  reason: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };
  if (!reason.trim()) return { ok: false, error: "Motif requis." };

  const { error } = await supabase.rpc("admin_forum_delete_topic", {
    p_topic_id: topicId,
    p_reason: reason.trim(),
  });
  if (error) return { ok: false, error: translateError(error.message) };

  revalidatePath("/communaute/forum");
  return { ok: true, data: undefined };
}

export async function adminDeleteReplyAction(
  replyId: string,
  topicId: string,
  reason: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };
  if (!reason.trim()) return { ok: false, error: "Motif requis." };

  const { error } = await supabase.rpc("admin_forum_delete_reply", {
    p_reply_id: replyId,
    p_reason: reason.trim(),
  });
  if (error) return { ok: false, error: translateError(error.message) };

  revalidatePath(`/communaute/forum/t/${topicId}`);
  return { ok: true, data: undefined };
}

export async function markTopicReadAction(topicId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.rpc("forum_mark_topic_read", { p_topic_id: topicId });
}

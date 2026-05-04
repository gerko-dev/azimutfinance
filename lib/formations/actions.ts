"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAdminLevel } from "@/lib/admin/auth";
import type {
  ActionResult,
  InscriptionStatus,
  PaymentMethod,
} from "./types";
import type {
  FormationCategory,
  FormationFormat,
  FormationLevel,
  FormationModule,
  FormationPricingType,
} from "@/lib/formations";

const SLUG_RE = /^[a-z0-9-]+$/;

async function ensureAdmin2(): Promise<{ ok: true } | { ok: false; error: string }> {
  const level = await getMyAdminLevel();
  if (level === null) return { ok: false, error: "Réservé aux administrateurs." };
  if (level > 2) return { ok: false, error: "Niveau d'administration insuffisant (L2+ requis)." };
  return { ok: true };
}

type FormationPayload = {
  slug: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  level: FormationLevel;
  format: FormationFormat;
  category: FormationCategory;
  modules: FormationModule[];
  prerequisites: string[];
  outcomes: string[];
  pricingType: FormationPricingType;
  priceFcfa: number;
  tags: string[];
  instructorName: string;
  instructorTitle: string;
  featured: boolean;
  publish: boolean;
};

function parseFormationPayload(formData: FormData): {
  ok: true;
  data: FormationPayload;
} | { ok: false; error: string } {
  const slug = String(formData.get("slug") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const shortDescription = String(formData.get("shortDescription") || "").trim();
  const longDescription = String(formData.get("longDescription") || "").trim();
  const level = String(formData.get("level") || "") as FormationLevel;
  const format = String(formData.get("format") || "") as FormationFormat;
  const category = String(formData.get("category") || "") as FormationCategory;
  const pricingType = String(formData.get("pricingType") || "") as FormationPricingType;
  const priceRaw = String(formData.get("priceFcfa") || "0").replace(/\s+/g, "");
  const priceFcfa = parseInt(priceRaw, 10) || 0;
  const instructorName = String(formData.get("instructorName") || "").trim();
  const instructorTitle = String(formData.get("instructorTitle") || "").trim();
  const featured = formData.get("featured") === "1";
  const publish = formData.get("publish") === "1";

  if (!slug || !SLUG_RE.test(slug)) {
    return { ok: false, error: "Slug invalide (lettres minuscules, chiffres, tirets uniquement)." };
  }
  if (!title) return { ok: false, error: "Le titre est obligatoire." };
  if (!shortDescription) return { ok: false, error: "La description courte est obligatoire." };
  if (!longDescription) return { ok: false, error: "La description longue est obligatoire." };
  if (!["debutant", "intermediaire", "avance"].includes(level)) {
    return { ok: false, error: "Niveau invalide." };
  }
  if (!["cours", "atelier", "certifiant"].includes(format)) {
    return { ok: false, error: "Format invalide." };
  }
  if (!["bourse", "obligations", "analyse", "macro", "portefeuille", "pratique"].includes(category)) {
    return { ok: false, error: "Catégorie invalide." };
  }
  if (!["gratuit", "premium", "certifiant"].includes(pricingType)) {
    return { ok: false, error: "Tarification invalide." };
  }
  if (pricingType === "gratuit" && priceFcfa !== 0) {
    return { ok: false, error: "Une formation gratuite a un prix de 0 FCFA." };
  }
  if (pricingType !== "gratuit" && priceFcfa <= 0) {
    return { ok: false, error: "Le prix doit être strictement positif." };
  }

  // Modules : champs paralleles
  const moduleTitles = formData.getAll("module_title").map((v) => String(v).trim());
  const moduleDurations = formData.getAll("module_duration").map((v) => parseInt(String(v), 10) || 0);
  const modulePreviews = formData.getAll("module_preview").map((v) => v === "1");
  const modules: FormationModule[] = [];
  for (let i = 0; i < moduleTitles.length; i++) {
    const t = moduleTitles[i];
    if (!t) continue;
    if (moduleDurations[i] <= 0) {
      return { ok: false, error: `Durée du module "${t}" invalide.` };
    }
    modules.push({
      title: t,
      durationMinutes: moduleDurations[i],
      ...(modulePreviews[i] ? { preview: true } : {}),
    });
  }
  if (modules.length === 0) {
    return { ok: false, error: "Au moins un module est requis." };
  }

  const prerequisites = String(formData.get("prerequisites") || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const outcomes = String(formData.get("outcomes") || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (outcomes.length === 0) {
    return { ok: false, error: "Au moins un objectif (outcome) est requis." };
  }
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ok: true,
    data: {
      slug, title, shortDescription, longDescription, level, format, category,
      modules, prerequisites, outcomes, pricingType, priceFcfa, tags,
      instructorName, instructorTitle, featured, publish,
    },
  };
}

export async function createFormation(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = parseFormationPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const p = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("formations")
    .insert({
      slug: p.slug,
      title: p.title,
      short_description: p.shortDescription,
      long_description: p.longDescription,
      level: p.level,
      format: p.format,
      category: p.category,
      modules: p.modules,
      prerequisites: p.prerequisites,
      outcomes: p.outcomes,
      pricing_type: p.pricingType,
      price_fcfa: p.priceFcfa,
      tags: p.tags,
      instructor_name: p.instructorName || null,
      instructor_title: p.instructorTitle || null,
      featured: p.featured,
      published_at: p.publish ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/formations");
  revalidatePath("/academie/formations");
  return { ok: true, data: { id: data.id as string } };
}

export async function updateFormation(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = parseFormationPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const p = parsed.data;

  const supabase = await createSupabaseServerClient();

  // Recuperer le published_at courant pour ne pas l'ecraser betement
  const { data: existing } = await supabase
    .from("formations")
    .select("published_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Formation introuvable." };
  const existingPublishedAt = (existing as { published_at: string | null }).published_at;

  const { error } = await supabase
    .from("formations")
    .update({
      slug: p.slug,
      title: p.title,
      short_description: p.shortDescription,
      long_description: p.longDescription,
      level: p.level,
      format: p.format,
      category: p.category,
      modules: p.modules,
      prerequisites: p.prerequisites,
      outcomes: p.outcomes,
      pricing_type: p.pricingType,
      price_fcfa: p.priceFcfa,
      tags: p.tags,
      instructor_name: p.instructorName || null,
      instructor_title: p.instructorTitle || null,
      featured: p.featured,
      published_at: p.publish
        ? existingPublishedAt ?? new Date().toISOString()
        : null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/formations");
  revalidatePath(`/admin/formations/${id}`);
  revalidatePath("/academie/formations");
  revalidatePath(`/academie/formations/${p.slug}`);
  return { ok: true, data: undefined };
}

export async function deleteFormation(id: string): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("formations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/formations");
  revalidatePath("/academie/formations");
  return { ok: true, data: undefined };
}

// =============================================================================
// USER : INSCRIPTION
// =============================================================================

const VALID_PAYMENT: PaymentMethod[] = [
  "gratuit",
  "orange_money",
  "wave",
  "virement",
  "sur_place",
];

export async function inscrireFormation(
  formData: FormData,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const formationId = String(formData.get("formation_id") || "").trim();
  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const country = String(formData.get("country") || "").trim();
  const paymentMethod = String(formData.get("payment_method") || "") as PaymentMethod;

  if (!formationId) return { ok: false, error: "Formation introuvable." };
  if (!fullName) return { ok: false, error: "Le nom complet est obligatoire." };
  if (!email) return { ok: false, error: "L'email est obligatoire." };
  if (!phone) return { ok: false, error: "Le numéro de téléphone est obligatoire." };
  if (!VALID_PAYMENT.includes(paymentMethod)) {
    return { ok: false, error: "Mode de paiement invalide." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Vous devez être connecté pour vous inscrire." };

  // Recupere la formation pour figer le montant et verifier la coherence
  const { data: formation } = await supabase
    .from("formations")
    .select("id, slug, pricing_type, price_fcfa, published_at")
    .eq("id", formationId)
    .maybeSingle();
  if (!formation) return { ok: false, error: "Formation introuvable." };
  const f = formation as {
    id: string;
    slug: string;
    pricing_type: FormationPricingType;
    price_fcfa: number;
    published_at: string | null;
  };
  if (!f.published_at) {
    return { ok: false, error: "Cette formation n'est pas encore disponible." };
  }
  if (f.pricing_type === "gratuit" && paymentMethod !== "gratuit") {
    return { ok: false, error: "Mode de paiement incompatible avec une formation gratuite." };
  }
  if (f.pricing_type !== "gratuit" && paymentMethod === "gratuit") {
    return { ok: false, error: "Mode de paiement requis pour une formation payante." };
  }

  const { data, error } = await supabase
    .from("formation_inscriptions")
    .insert({
      formation_id: f.id,
      user_id: user.id,
      status: f.pricing_type === "gratuit" ? "confirmee" : "en_attente",
      payment_method: paymentMethod,
      montant_fcfa: f.price_fcfa,
      full_name: fullName,
      email,
      phone,
      country: country || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Vous êtes déjà inscrit à cette formation." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/academie/formations/${f.slug}`);
  revalidatePath("/admin/inscriptions");
  return { ok: true, data: { id: data.id as string, slug: f.slug } };
}

export async function setInscriptionStatus(
  inscriptionId: string,
  status: InscriptionStatus,
  notes?: string,
): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_inscription_status", {
    p_inscription_id: inscriptionId,
    p_status: status,
    p_notes: notes ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/inscriptions");
  revalidatePath("/admin/formations");
  return { ok: true, data: undefined };
}

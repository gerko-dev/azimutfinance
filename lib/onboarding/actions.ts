"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  COUNTRY_CODES,
  EXPERIENCE_CODES,
  HORIZON_CODES,
  INTEREST_CODES,
  NUDGE_FIELDS,
  PROFESSIONAL_SECTORS,
  nudgeIdFor,
  type CountryCode,
  type ExperienceLevel,
  type Horizon,
  type Interest,
  type NudgeField,
} from "./types";

export type OnboardingState = {
  error?: string;
  step?: number;
  done?: boolean;
} | null;

const STEP_TO_FIELDS: Record<number, NudgeField[]> = {
  1: ["country"],
  2: ["experience_level"],
  3: ["interests"],
  4: ["investment_horizon"],
};

function isCountry(v: unknown): v is CountryCode {
  return typeof v === "string" && (COUNTRY_CODES as string[]).includes(v);
}
function isExperience(v: unknown): v is ExperienceLevel {
  return typeof v === "string" && (EXPERIENCE_CODES as string[]).includes(v);
}
function isHorizon(v: unknown): v is Horizon {
  return typeof v === "string" && (HORIZON_CODES as string[]).includes(v);
}
function isInterest(v: unknown): v is Interest {
  return typeof v === "string" && (INTEREST_CODES as string[]).includes(v);
}
function isSector(v: unknown): v is string {
  return typeof v === "string" && (PROFESSIONAL_SECTORS as readonly string[]).includes(v);
}

async function requireUserId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/connexion?redirect=/bienvenue");
  }
  return user.id;
}

/**
 * Sauvegarde une etape du wizard. L'utilisateur peut quitter a mi-chemin :
 * chaque etape valide ce qu'elle connait, sans toucher onboarded_at.
 * La derniere etape (4) marque onboarded_at = now().
 */
export async function saveOnboardingStepAction(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const userId = await requireUserId();
  const step = Number(formData.get("step") ?? 0);

  if (!STEP_TO_FIELDS[step]) {
    return { error: "Étape inconnue." };
  }

  const update: Record<string, unknown> = {};

  if (step === 1) {
    const v = formData.get("country");
    if (!isCountry(v)) return { error: "Pays invalide.", step };
    update.country = v;
  }

  if (step === 2) {
    const v = formData.get("experience_level");
    if (!isExperience(v)) return { error: "Niveau invalide.", step };
    update.experience_level = v;
    if (v === "expert") {
      const s = formData.get("professional_sector");
      if (s != null && s !== "" && !isSector(s)) {
        return { error: "Secteur invalide.", step };
      }
      update.professional_sector = isSector(s) ? s : null;
    } else {
      update.professional_sector = null;
    }
  }

  if (step === 3) {
    const all = formData.getAll("interests").filter(isInterest);
    const dedup = Array.from(new Set(all));
    if (dedup.length === 0) {
      return { error: "Choisis au moins un centre d'intérêt.", step };
    }
    update.interests = dedup;
  }

  if (step === 4) {
    const v = formData.get("investment_horizon");
    if (!isHorizon(v)) return { error: "Horizon invalide.", step };
    update.investment_horizon = v;
    update.onboarded_at = new Date().toISOString();
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId);

  if (error) {
    return { error: "Impossible d'enregistrer pour le moment.", step };
  }

  revalidatePath("/compte");
  revalidatePath("/bienvenue");

  if (step === 4) {
    return { done: true };
  }
  return { step: step + 1 };
}

/**
 * Bouton "Plus tard" du wizard : marque onboarded_at sans renseigner les
 * champs manquants. Les nudges JIT prendront le relais.
 */
export async function skipOnboardingAction() {
  const userId = await requireUserId();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", userId);
  revalidatePath("/", "layout");
  redirect("/compte");
}

// ----------------------------------------------------------------
// Nudges JIT
// ----------------------------------------------------------------

function validateNudgeAnswer(field: NudgeField, raw: FormDataEntryValue | FormDataEntryValue[] | null) {
  if (field === "country") {
    return isCountry(raw) ? { country: raw } : null;
  }
  if (field === "experience_level") {
    return isExperience(raw) ? { experience_level: raw } : null;
  }
  if (field === "investment_horizon") {
    return isHorizon(raw) ? { investment_horizon: raw } : null;
  }
  if (field === "interests") {
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const filtered = arr.filter(isInterest);
    const dedup = Array.from(new Set(filtered));
    return dedup.length > 0 ? { interests: dedup } : null;
  }
  return null;
}

/**
 * Reponse a un nudge contextuel (ex: "Quel pays vous intéresse ?" sur
 * la page Obligations). Sauve la reponse sans toucher dismissed_nudges.
 */
export async function answerNudgeAction(formData: FormData) {
  const userId = await requireUserId();
  const field = String(formData.get("field") ?? "") as NudgeField;
  if (!NUDGE_FIELDS.includes(field)) return;

  const raw = field === "interests" ? formData.getAll("value") : formData.get("value");
  const update = validateNudgeAnswer(field, raw);
  if (!update) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("profiles").update(update).eq("id", userId);

  const path = String(formData.get("revalidate") ?? "/");
  revalidatePath(path);
}

/**
 * Fermeture d'un nudge ("plus tard"). On l'ajoute a dismissed_nudges
 * pour ne plus l'afficher, sans toucher au champ cible.
 */
export async function dismissNudgeAction(formData: FormData) {
  const userId = await requireUserId();
  const field = String(formData.get("field") ?? "") as NudgeField;
  if (!NUDGE_FIELDS.includes(field)) return;

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("dismissed_nudges")
    .eq("id", userId)
    .single();

  const id = nudgeIdFor(field);
  const current: string[] = profile?.dismissed_nudges ?? [];
  if (current.includes(id)) {
    const path = String(formData.get("revalidate") ?? "/");
    revalidatePath(path);
    return;
  }

  await supabase
    .from("profiles")
    .update({ dismissed_nudges: [...current, id] })
    .eq("id", userId);

  const path = String(formData.get("revalidate") ?? "/");
  revalidatePath(path);
}

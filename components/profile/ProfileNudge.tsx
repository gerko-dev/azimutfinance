import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  COUNTRIES,
  HORIZONS,
  INTERESTS,
  nudgeIdFor,
} from "@/lib/onboarding/types";
import type { NudgeField } from "@/lib/onboarding/types";
import ProfileNudgeClient from "./ProfileNudgeClient";

/**
 * Bandeau JIT qui propose a l'utilisateur connecte de completer un champ
 * de son profil (pays, horizon, interets...) au moment ou il navigue sur
 * une page contextuelle. Ne render rien si :
 *   - utilisateur non connecte
 *   - champ deja renseigne
 *   - nudge deja ferme par l'utilisateur (dismissed_nudges)
 *
 * Usage :
 *   <ProfileNudge field="country" revalidate="/marches/obligations" />
 */
export default async function ProfileNudge({
  field,
  revalidate,
}: {
  field: NudgeField;
  revalidate: string;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(`${field}, dismissed_nudges`)
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  // Champ deja renseigne ?
  const current = (profile as Record<string, unknown>)[field];
  if (field === "interests") {
    if (Array.isArray(current) && current.length > 0) return null;
  } else if (current) {
    return null;
  }

  // Nudge deja ferme ?
  const dismissed: string[] = profile.dismissed_nudges ?? [];
  if (dismissed.includes(nudgeIdFor(field))) return null;

  const config = NUDGE_CONFIG[field];

  return (
    <ProfileNudgeClient
      field={field}
      revalidate={revalidate}
      title={config.title}
      multi={config.multi}
      options={config.options}
    />
  );
}

const NUDGE_CONFIG: Record<
  NudgeField,
  {
    title: string;
    multi: boolean;
    options: { value: string; label: string; icon?: string }[];
  }
> = {
  country: {
    title: "Quel pays vous intéresse en priorité ?",
    multi: false,
    options: COUNTRIES.map((c) => ({
      value: c.code,
      label: c.label,
      icon: c.flag,
    })),
  },
  experience_level: {
    title: "Comment décrivez-vous votre niveau ?",
    multi: false,
    options: [
      { value: "debutant", label: "Débutant" },
      { value: "initie", label: "Initié" },
      { value: "expert", label: "Expert" },
    ],
  },
  interests: {
    title: "Quels marchés suivez-vous ?",
    multi: true,
    options: INTERESTS.map((i) => ({
      value: i.code,
      label: i.label,
      icon: i.icon,
    })),
  },
  investment_horizon: {
    title: "Sur quel horizon investissez-vous ?",
    multi: false,
    options: HORIZONS.map((h) => ({ value: h.code, label: h.label })),
  },
};

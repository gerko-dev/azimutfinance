import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import OnboardingWizard from "./OnboardingWizard";
import type { ProfileExtras } from "@/lib/onboarding/types";

export const metadata = {
  title: "Bienvenue — AzimutFinance",
};

export default async function BienvenuePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion?redirect=/bienvenue");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, country, experience_level, professional_sector, interests, investment_horizon, onboarded_at, dismissed_nudges"
    )
    .eq("id", user.id)
    .single();

  // Note : on ne redirige PAS si onboarded_at est set. La page reste accessible
  // pour modifier le profil ou completer un onboarding skipe ("Plus tard").
  // computeInitialStep cote wizard place l'utilisateur sur la 1re question
  // sans reponse, ou sur l'etape 4 si tout est deja rempli.

  const initial: ProfileExtras = {
    country: profile?.country ?? null,
    experience_level: profile?.experience_level ?? null,
    professional_sector: profile?.professional_sector ?? null,
    interests: profile?.interests ?? [],
    investment_horizon: profile?.investment_horizon ?? null,
    onboarded_at: profile?.onboarded_at ?? null,
    dismissed_nudges: profile?.dismissed_nudges ?? [],
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <OnboardingWizard
          initial={initial}
          firstName={profile?.full_name?.split(" ")[0] ?? null}
          isEditMode={!!profile?.onboarded_at}
        />
      </main>
    </div>
  );
}

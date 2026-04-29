import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import {
  COUNTRIES,
  EXPERIENCE_LEVELS,
  HORIZONS,
  INTERESTS,
} from "@/lib/onboarding/types";

export const metadata = {
  title: "Mon compte — AzimutFinance",
};

const ROLE_LABELS: Record<string, { label: string; tone: string }> = {
  member: { label: "Membre", tone: "bg-blue-100 text-blue-700" },
  premium: { label: "Premium", tone: "bg-amber-100 text-amber-800" },
  pro: { label: "Pro", tone: "bg-purple-100 text-purple-700" },
};

const COUNTRY_LABEL = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, `${c.flag} ${c.label}`])
);
const EXPERIENCE_LABEL = Object.fromEntries(
  EXPERIENCE_LEVELS.map((e) => [e.code, e.label])
);
const HORIZON_LABEL = Object.fromEntries(HORIZONS.map((h) => [h.code, h.label]));
const INTEREST_LABEL = Object.fromEntries(INTERESTS.map((i) => [i.code, i.label]));

export default async function ComptePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Garde-fou : le proxy.ts redirige deja les anonymes,
  // mais on revérifie ici (cf. doc Next 16 : ne pas se reposer uniquement sur le proxy).
  if (!user) {
    redirect("/connexion?redirect=/compte");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "email, username, full_name, role, created_at, country, experience_level, professional_sector, interests, investment_horizon, onboarded_at"
    )
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "member";
  const roleBadge = ROLE_LABELS[role] ?? ROLE_LABELS.member;
  const interests: string[] = profile?.interests ?? [];

  // Bandeau "Complétez votre profil" : on regarde les champs réellement
  // manquants plutôt qu'onboarded_at, pour rattraper les utilisateurs qui
  // ont cliqué "Plus tard" en cours de wizard.
  const hasMissingFields =
    !profile?.country ||
    !profile?.experience_level ||
    interests.length === 0 ||
    !profile?.investment_horizon;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
              Mon compte
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Bienvenue{profile?.full_name ? `, ${profile.full_name}` : ""}.
            </p>
          </div>
          <SignOutButton />
        </div>

        {hasMissingFields && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-amber-900">
                Complétez votre profil
              </div>
              <div className="text-xs text-amber-800 mt-0.5">
                Quelques questions rapides pour personnaliser votre expérience.
              </div>
            </div>
            <Link
              href="/bienvenue"
              className="px-4 py-2 text-xs font-medium bg-amber-700 text-white rounded-md hover:bg-amber-800 whitespace-nowrap"
            >
              Continuer
            </Link>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              Statut
            </div>
            <span
              className={`inline-block text-xs px-2 py-1 rounded font-medium ${roleBadge.tone}`}
            >
              {roleBadge.label}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <Field label="Email" value={profile?.email ?? user.email ?? "—"} />
            <Field label="Nom complet" value={profile?.full_name ?? "—"} />
            <Field label="Identifiant" value={profile?.username ?? "—"} />
            <Field
              label="Membre depuis"
              value={
                profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString("fr-FR")
                  : "—"
              }
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-900">
              Mon profil investisseur
            </h2>
            <Link
              href="/bienvenue"
              className="text-xs text-blue-700 hover:underline"
            >
              Modifier
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <Field
              label="Pays"
              value={profile?.country ? COUNTRY_LABEL[profile.country] : "—"}
            />
            <Field
              label="Niveau"
              value={
                profile?.experience_level
                  ? EXPERIENCE_LABEL[profile.experience_level]
                  : "—"
              }
            />
            {profile?.experience_level === "expert" && (
              <Field
                label="Secteur d'activité"
                value={profile?.professional_sector ?? "—"}
              />
            )}
            <Field
              label="Horizon"
              value={
                profile?.investment_horizon
                  ? HORIZON_LABEL[profile.investment_horizon]
                  : "—"
              }
            />
            <div className="sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                Centres d&apos;intérêt
              </div>
              {interests.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {interests.map((code) => (
                    <span
                      key={code}
                      className="inline-block text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full"
                    >
                      {INTEREST_LABEL[code] ?? code}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-900">—</div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 text-sm text-blue-900">
          <p className="font-medium mb-1">Bientôt disponible</p>
          <p className="text-blue-800">
            Portefeuille personnel, alertes, watchlists, accès aux outils Pro… On
            ajoute les fonctionnalités au fur et à mesure.
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </div>
      <div className="text-sm text-slate-900">{value}</div>
    </div>
  );
}

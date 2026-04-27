import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export const metadata = {
  title: "Mon compte — AzimutFinance",
};

const ROLE_LABELS: Record<string, { label: string; tone: string }> = {
  member: { label: "Membre", tone: "bg-blue-100 text-blue-700" },
  pro: { label: "Membre Pro", tone: "bg-purple-100 text-purple-700" },
};

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
    .select("email, username, full_name, role, created_at")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "member";
  const roleBadge = ROLE_LABELS[role] ?? ROLE_LABELS.member;

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

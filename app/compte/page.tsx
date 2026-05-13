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
import { getMyInscriptions } from "@/lib/formations/queries";
import {
  INSCRIPTION_STATUS_COLOR,
  INSCRIPTION_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@/lib/formations";
import { getPremiumStatus, daysUntil } from "@/lib/auth/premium";
import { PLANS } from "@/lib/premium/plans";
import { listTopics, listUserReplies } from "@/lib/forum/queries";
import { listMyWatchlists } from "@/lib/watchlists/queries";
import { listMyAlerts } from "@/lib/alerts/queries";
import CancelPremiumButton from "./CancelPremiumButton";

export const metadata = {
  title: "Mon compte — AzimutFinance",
};

export const dynamic = "force-dynamic";

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

  const inscriptions = await getMyInscriptions();
  const premium = await getPremiumStatus();
  const [myTopics, myReplies, myWatchlists, myAlerts] = await Promise.all([
    listTopics({ authorId: user.id, limit: 5 }),
    listUserReplies(user.id, 5),
    listMyWatchlists(),
    listMyAlerts(),
  ]);
  const activeAlerts = myAlerts.filter((a) => a.active).length;
  const showPremiumSection = !(role === "pro" || role.startsWith("adminlevel"));
  const daysLeft = premium.isPremium ? daysUntil(premium.premiumUntil) : 0;

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

        {showPremiumSection && (
          <PremiumStatusCard
            isPremium={premium.isPremium}
            premiumUntil={premium.premiumUntil}
            plan={premium.plan}
            daysLeft={daysLeft}
          />
        )}

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

        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-900">
              Mes formations
            </h2>
            <Link
              href="/academie/formations"
              className="text-xs text-blue-700 hover:underline"
            >
              Catalogue
            </Link>
          </div>
          {inscriptions.length === 0 ? (
            <div className="text-sm text-slate-500 pt-2 border-t border-slate-100">
              Vous n&apos;êtes inscrit à aucune formation pour le moment.{" "}
              <Link href="/academie/formations" className="text-blue-700 hover:underline">
                Découvrir le catalogue →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 -mx-2">
              {inscriptions.map((i) => {
                const color = INSCRIPTION_STATUS_COLOR[i.status];
                return (
                  <li key={i.id} className="px-2 py-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <Link
                        href={`/academie/formations/${i.formation_slug}`}
                        className="text-sm font-medium text-slate-900 hover:text-blue-700 truncate"
                      >
                        {i.formation_title}
                      </Link>
                      <span
                        className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: color + "15", color }}
                      >
                        {INSCRIPTION_STATUS_LABEL[i.status]}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span>{PAYMENT_METHOD_LABEL[i.payment_method]}</span>
                      {i.montant_fcfa > 0 && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="tabular-nums">
                            {i.montant_fcfa.toLocaleString("fr-FR")} FCFA
                          </span>
                        </>
                      )}
                      <span className="text-slate-300">·</span>
                      <span>
                        Inscrit le{" "}
                        {new Date(i.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Mes outils : watchlists + alertes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-slate-900">
                Mes watchlists
              </h2>
              <Link
                href="/outils/watchlist"
                className="text-xs text-blue-700 hover:underline"
              >
                Gérer →
              </Link>
            </div>
            {myWatchlists.length === 0 ? (
              <div className="text-xs text-slate-500">
                Aucune liste pour le moment.{" "}
                <Link
                  href="/outils/watchlist"
                  className="text-blue-700 hover:underline"
                >
                  Créer la première
                </Link>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {myWatchlists.slice(0, 4).map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <Link
                      href={`/outils/watchlist?id=${w.id}`}
                      className="text-slate-900 hover:text-blue-700 truncate"
                    >
                      {w.name}
                    </Link>
                    <span className="text-[11px] tabular-nums text-slate-500 shrink-0 ml-2">
                      {w.item_count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-slate-900">Mes alertes</h2>
              <Link
                href="/outils/alertes"
                className="text-xs text-blue-700 hover:underline"
              >
                Gérer →
              </Link>
            </div>
            {myAlerts.length === 0 ? (
              <div className="text-xs text-slate-500">
                Aucune alerte configurée. Réservées aux membres Premium.
              </div>
            ) : (
              <div>
                <div className="text-2xl font-semibold tabular-nums text-slate-900">
                  {activeAlerts}
                  <span className="text-sm font-normal text-slate-500 ml-1">
                    actives
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  sur {myAlerts.length} configurée
                  {myAlerts.length > 1 ? "s" : ""}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mon activité forum */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-900">
              Mon activité forum
            </h2>
            <Link
              href="/communaute/forum"
              className="text-xs text-blue-700 hover:underline"
            >
              Aller au forum
            </Link>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
              Mes discussions ({myTopics.length})
            </div>
            {myTopics.length === 0 ? (
              <div className="text-xs text-slate-500">
                Vous n&apos;avez pas encore créé de discussion.{" "}
                <Link
                  href="/communaute/forum/nouveau"
                  className="text-blue-700 hover:underline"
                >
                  Démarrer une discussion →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 -mx-1">
                {myTopics.map((t) => (
                  <li key={t.id} className="px-1 py-2">
                    <Link
                      href={`/communaute/forum/t/${t.id}`}
                      className="text-sm text-slate-900 hover:text-blue-700 font-medium line-clamp-1"
                    >
                      {t.title}
                    </Link>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span>{t.category_name}</span>
                      <span className="text-slate-300">·</span>
                      <span className="tabular-nums">
                        {t.reply_count} rép.
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="tabular-nums">
                        {t.vote_score >= 0 ? "+" : ""}
                        {t.vote_score} votes
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>
                        {new Date(t.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {myReplies.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                Mes dernières réponses ({myReplies.length})
              </div>
              <ul className="divide-y divide-slate-100 -mx-1">
                {myReplies.map((r) => (
                  <li key={r.reply_id} className="px-1 py-2">
                    <Link
                      href={`/communaute/forum/t/${r.topic_id}`}
                      className="text-sm text-slate-900 hover:text-blue-700 font-medium line-clamp-1"
                    >
                      ↳ {r.topic_title}
                    </Link>
                    <div className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">
                      {r.body_preview}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(r.created_at).toLocaleDateString("fr-FR")}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
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

function PremiumStatusCard({
  isPremium,
  premiumUntil,
  plan,
  daysLeft,
}: {
  isPremium: boolean;
  premiumUntil: Date | null;
  plan: keyof typeof PLANS | null;
  daysLeft: number;
}) {
  if (!isPremium || !premiumUntil) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-amber-50 border border-amber-200 rounded-lg p-5 md:p-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <span>⭐</span> Passe à Premium
          </div>
          <div className="text-xs text-slate-700 mt-1 max-w-md">
            Débloque les analyses macro UEMOA, outils Pro et données
            historiques étendues. À partir de 9 999 FCFA / mois.
          </div>
        </div>
        <Link
          href="/premium"
          className="px-4 py-2 text-xs font-medium bg-amber-500 text-white rounded-md hover:bg-amber-600 whitespace-nowrap"
        >
          Découvrir
        </Link>
      </div>
    );
  }

  const expiringSoon = daysLeft <= 30;
  const planLabel = plan ? PLANS[plan].label : "Premium";

  return (
    <div className="bg-white border border-emerald-200 rounded-lg p-5 md:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <span>⭐</span> Abonnement {planLabel} actif
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Accès valide jusqu&apos;au{" "}
            <span className="font-medium text-slate-900">
              {premiumUntil.toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>{" "}
            <span
              className={
                expiringSoon
                  ? "text-amber-700 font-medium"
                  : "text-slate-500"
              }
            >
              ({daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""})
            </span>
          </div>
        </div>
        <Link
          href="/premium"
          className={`px-4 py-2 text-xs font-medium rounded-md whitespace-nowrap ${
            expiringSoon
              ? "bg-amber-500 text-white hover:bg-amber-600"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {expiringSoon ? "Renouveler maintenant" : "Gérer mon abonnement"}
        </Link>
      </div>
      <div className="border-t border-slate-100 mt-4 pt-3">
        <CancelPremiumButton />
      </div>
    </div>
  );
}

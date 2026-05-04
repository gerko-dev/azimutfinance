import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import InscriptionForm from "@/components/academie/InscriptionForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CATEGORY_META,
  LEVEL_META,
  pricingLabel,
  totalDurationLabel,
} from "@/lib/formations";
import {
  getMyInscriptionForFormation,
  getPublishedFormationBySlug,
} from "@/lib/formations/queries";

export const metadata = {
  title: "Inscription à une formation — AzimutFinance",
};

export const dynamic = "force-dynamic";

export default async function InscriptionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/connexion?redirect=${encodeURIComponent(
        `/academie/formations/${slug}/inscription`,
      )}`,
    );
  }

  const formation = await getPublishedFormationBySlug(slug);
  if (!formation) notFound();

  // Si deja inscrit, on redirige vers la confirmation
  const existing = await getMyInscriptionForFormation(formation.id);
  if (existing) {
    redirect(`/academie/formations/${formation.slug}/inscription/confirmation`);
  }

  // Recupere le profil pour pre-remplir le formulaire
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, country")
    .eq("id", user.id)
    .maybeSingle();

  const accent =
    formation.accentColor ?? CATEGORY_META[formation.category].color;
  const levelMeta = LEVEL_META[formation.level];

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5 flex-wrap">
          <Link href="/academie/formations" className="hover:text-slate-700">
            Catalogue
          </Link>
          <span>›</span>
          <Link
            href={`/academie/formations/${formation.slug}`}
            className="hover:text-slate-700"
          >
            {formation.title}
          </Link>
          <span>›</span>
          <span className="text-slate-700">Inscription</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
          Confirmer mon inscription
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Renseignez vos coordonnées pour vous inscrire à la formation. Vos informations sont visibles uniquement par l&apos;équipe AzimutFinance.
        </p>

        {/* Récap formation */}
        <section
          className="mt-5 bg-white rounded-lg border-t-4 border border-slate-200 p-4"
          style={{ borderTopColor: accent }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[11px] px-2 py-0.5 rounded font-medium"
              style={{ background: accent + "15", color: accent }}
            >
              {CATEGORY_META[formation.category].label}
            </span>
            <span
              className="text-[11px] px-2 py-0.5 rounded font-medium"
              style={{
                background: levelMeta.color + "15",
                color: levelMeta.color,
              }}
            >
              {levelMeta.label}
            </span>
          </div>
          <h2 className="text-base md:text-lg font-semibold text-slate-900 mt-2">
            {formation.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span>
              <span className="text-slate-400">Durée :</span>{" "}
              <span className="text-slate-700 font-medium tabular-nums">
                {totalDurationLabel(formation)}
              </span>
            </span>
            <span>
              <span className="text-slate-400">Tarif :</span>{" "}
              <span
                className={`font-semibold tabular-nums ${
                  formation.pricing.type === "gratuit"
                    ? "text-emerald-700"
                    : "text-slate-900"
                }`}
              >
                {pricingLabel(formation)}
              </span>
            </span>
          </div>
        </section>

        <div className="mt-5">
          <InscriptionForm
            formationId={formation.id}
            slug={formation.slug}
            isFree={formation.pricing.type === "gratuit"}
            priceFcfa={
              formation.pricing.type === "gratuit"
                ? 0
                : formation.pricing.priceFcfa
            }
            initial={{
              fullName: profile?.full_name ?? "",
              email: profile?.email ?? user.email ?? "",
              country: profile?.country ?? "",
            }}
          />
        </div>
      </main>
    </div>
  );
}

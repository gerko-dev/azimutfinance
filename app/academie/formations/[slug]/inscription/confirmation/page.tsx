import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  INSCRIPTION_STATUS_COLOR,
  INSCRIPTION_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  pricingLabel,
  totalDurationLabel,
} from "@/lib/formations";
import {
  getMyInscriptionForFormation,
  getPublishedFormationBySlug,
} from "@/lib/formations/queries";

export const metadata = {
  title: "Inscription confirmée — AzimutFinance",
};

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
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
    redirect(`/connexion?redirect=/academie/formations/${slug}`);
  }

  const formation = await getPublishedFormationBySlug(slug);
  if (!formation) notFound();

  const inscription = await getMyInscriptionForFormation(formation.id);
  if (!inscription) {
    redirect(`/academie/formations/${formation.slug}/inscription`);
  }

  const statusColor = INSCRIPTION_STATUS_COLOR[inscription.status];

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="bg-white rounded-lg border border-slate-200 p-6 md:p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <span className="text-3xl text-emerald-600">✓</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Inscription enregistrée
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Merci ! Votre inscription à <strong>{formation.title}</strong> a bien été prise en compte.
          </p>

          <div
            className="mt-5 inline-block text-xs px-3 py-1.5 rounded font-medium"
            style={{ background: statusColor + "15", color: statusColor }}
          >
            Statut : {INSCRIPTION_STATUS_LABEL[inscription.status]}
          </div>

          <div className="mt-6 bg-slate-50 border border-slate-200 rounded-lg p-4 text-left text-sm space-y-2">
            <Row label="Formation" value={formation.title} />
            <Row label="Durée" value={totalDurationLabel(formation)} />
            <Row label="Tarif" value={pricingLabel(formation)} />
            <Row
              label="Mode de paiement"
              value={PAYMENT_METHOD_LABEL[inscription.payment_method]}
            />
          </div>

          {inscription.status === "en_attente" && (
            <p className="text-xs text-slate-500 mt-5 leading-relaxed">
              Notre équipe vous contactera dans les <strong>24 h ouvrées</strong> par email à
              l&apos;adresse fournie pour finaliser le paiement et confirmer votre place.
              Vous pouvez retrouver à tout moment l&apos;état de votre inscription depuis votre espace personnel.
            </p>
          )}
          {inscription.status === "confirmee" && (
            <p className="text-xs text-slate-500 mt-5 leading-relaxed">
              Votre inscription est confirmée. Vous recevrez par email les modalités d&apos;accès à la formation.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/compte"
              className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded"
            >
              Voir mes inscriptions
            </Link>
            <Link
              href="/academie/formations"
              className="text-sm text-slate-700 hover:text-slate-900 underline"
            >
              Retour au catalogue
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 font-medium text-right">{value}</span>
    </div>
  );
}

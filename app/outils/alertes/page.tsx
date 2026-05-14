import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PremiumPaywall from "@/components/PremiumPaywall";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPremiumStatus } from "@/lib/auth/premium";
import { listMyAlerts, listMyAlertTriggers } from "@/lib/alerts/queries";
import { getTargetOptions } from "@/lib/watchlists/targetOptions";
import AlertsManager from "./AlertsManager";

export const metadata = {
  title: "Mes alertes — AzimutFinance",
  description:
    "Configurez des alertes sur les titres BRVM, obligations, indices et devises : seuils de prix, variations, échéances.",
};

export const dynamic = "force-dynamic";

export default async function AlertesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion?redirect=/outils/alertes");
  }

  // Gate Premium+ / Pro / Admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role ?? "member";
  const premium = await getPremiumStatus();
  const isPremiumAccess =
    role === "pro" ||
    role.startsWith("adminlevel") ||
    role === "premium" ||
    premium.isPremium;

  if (!isPremiumAccess) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <PremiumPaywall
          breadcrumb={[
            { label: "Outils", href: "/outils" },
            { label: "Alertes" },
          ]}
          title="Alertes personnalisées"
          description="Recevez des notifications email et in-app dès qu'un seuil de prix, une variation, une échéance d'obligation ou une actualité ciblée se déclenche."
          features={[
            "Alertes seuil de prix (≥ X ou ≤ X) sur actions et obligations",
            "Alertes variation % du jour (±X %) sur n'importe quel titre",
            "Alertes échéance obligataire (J-30, J-7, J-1)",
            "Alertes seuil sur indices BRVM et taux de change",
            "Alertes nouvelle actualité sur un titre suivi",
            "Email récapitulatif + badge in-app sur l'icône cloche",
          ]}
          isMember={true}
          back={{ label: "Retour aux outils", href: "/outils" }}
        />
      </div>
    );
  }

  const [alerts, triggers] = await Promise.all([
    listMyAlerts(),
    listMyAlertTriggers(20),
  ]);
  const targetOptions = getTargetOptions();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            Accueil › Outils ›{" "}
            <span className="text-slate-200">Mes alertes</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold text-white">
            Mes alertes
          </h1>
          <p className="text-sm md:text-base text-slate-300 mt-1 max-w-2xl">
            Configurez vos alertes sur les titres, indices, devises et matières
            premières. Vous recevrez un email + un badge in-app à chaque
            déclenchement.
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-6 md:py-8">
        <AlertsManager
          alerts={alerts}
          triggers={triggers}
          targetOptions={targetOptions}
        />
      </main>
    </div>
  );
}

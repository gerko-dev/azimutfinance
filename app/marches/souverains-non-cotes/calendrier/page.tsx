import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import Link from "next/link";
import BondsEventsCalendar from "@/components/BondsEventsCalendar";
import BondsPaywallSection from "@/components/BondsPaywallSection";
import { loadUmoaEmissions } from "@/lib/dataLoader";
import {
  aggregateSovereignBonds,
  buildSovereignEvents,
} from "@/lib/listedBondsTypes";
import { fetchUserRole } from "@/lib/auth/userRole";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Calendrier obligataire souverain — AzimutFinance",
  path: "/marches/souverains-non-cotes/calendrier",
});

export const dynamic = "force-dynamic";

export default async function Page() {
  const userRole = await fetchUserRole();
  const isMember = userRole !== null;
  const isPremium = userRole === "premium" || userRole === "pro";

  if (!isPremium) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <Ticker />
        <BondsPaywallSection
          breadcrumb="Calendrier"
          title="Calendrier obligataire souverain"
          description="12 mois de coupons, amortissements et remboursements des titres souverains UMOA-Titres, pour préparer vos échéances de trésorerie."
          features={[
            "Coupons annuels projetés sur le capital restant dû",
            "Amortissements linéaires, différé d'amortissement pris en compte",
            "Remboursement final des OAT et échéance des BAT",
            "Liens directs vers la fiche de chaque ligne souveraine",
          ]}
          isMember={isMember}
        />
      </div>
    );
  }

  // Meme fenetre que le calendrier des obligations cotees : 90 jours en
  // arriere pour alimenter le bouton "Inclure le passe recent" sans recharger,
  // et 12 mois en avant.
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const past = new Date(today);
  past.setDate(past.getDate() - 90);
  const end = new Date(today);
  end.setFullYear(end.getFullYear() + 1);

  const todayISO = toISO(today);
  const startISO = toISO(past);
  const endISO = toISO(end);

  // L'echeancier souverain n'est pas saisi : il se deduit des caracteristiques
  // d'emission (coupon annuel sur capital restant du, amortissement lineaire
  // avec differe, ou in fine).
  const { bonds, events } = buildSovereignEvents(
    aggregateSovereignBonds(loadUmoaEmissions()),
    startISO,
    endISO,
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            <Link href="/" className="hover:text-white transition">
              Marchés
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <Link
              href="/marches/souverains-non-cotes"
              className="hover:text-white transition"
            >
              Souverains UMOA-Titres
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <span className="text-slate-200">Calendrier obligataire</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-white">
            Calendrier obligataire souverain
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            Coupons, amortissements et remboursements des titres souverains
            UMOA-Titres sur 12 mois glissants.
            {events.length > 0 && (
              <>
                {" "}
                {events.length} événement{events.length > 1 ? "s" : ""} sur{" "}
                {bonds.length} ligne{bonds.length > 1 ? "s" : ""}.
              </>
            )}
          </p>
        </div>
      </div>
      <BondsEventsCalendar
        bonds={bonds}
        events={events}
        startDate={startISO}
        endDate={endISO}
        todayISO={todayISO}
        hrefBase="/souverain"
      />
    </div>
  );
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

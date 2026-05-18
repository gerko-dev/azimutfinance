import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import BondsEventsCalendar from "@/components/BondsEventsCalendar";
import BondsPaywallSection from "@/components/BondsPaywallSection";
import BondsRelatedLinks from "@/components/BondsRelatedLinks";
import { loadListedBonds, loadListedBondEvents } from "@/lib/dataLoader";
import { fetchUserRole } from "@/lib/auth/userRole";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Calendrier obligataire BRVM — AzimutFinance",
  path: "/marches/obligations/calendrier",
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
          title="Calendrier obligataire BRVM"
          description="12 mois de coupons, amortissements et remboursements à venir, planifiés pour vos arbitrages de portefeuille."
          features={[
            "Coupons projetés par obligation sur 12 mois glissants",
            "Amortissements partiels (IF / AC / ACD) et remboursement final",
            "Calls anticipés et adjudications souveraines",
            "Liens directs vers la fiche de chaque obligation",
          ]}
          isMember={isMember}
        />
      </div>
    );
  }

  const bonds = loadListedBonds();
  const allEvents = loadListedBondEvents();

  // Fenetre de 12 mois glissants : aujourd'hui → +365 jours.
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  const startISO = toISO(start);
  const endISO = toISO(end);

  const events = allEvents
    .filter((e) => e.date >= startISO && e.date <= endISO)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <BondsEventsCalendar
        bonds={bonds}
        events={events}
        startDate={startISO}
        endDate={endISO}
      />
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-8 md:pb-10">
        <BondsRelatedLinks current="calendrier" />
      </div>
    </div>
  );
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

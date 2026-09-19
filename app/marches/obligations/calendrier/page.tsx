import Header from "@/components/Header";
import Link from "next/link";
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

  // Fenetre transmise : 90 jours en arriere → +365 jours. Le passe n'est pas
  // affiche par defaut ; il est envoye pour que le bouton "Inclure le passe
  // recent" n'ait pas a recharger la page. 90 jours couvrent un trimestre de
  // coupons, ce qu'un gerant relit couramment, sans alourdir la charge utile.
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

  const events = allEvents
    .filter((e) => e.date >= startISO && e.date <= endISO)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      {/* Le titre appartient a la page : le calendrier sert aussi le gisement
          souverain, qui a son propre en-tete. */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            <Link href="/" className="hover:text-white transition">
              Marchés
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <Link
              href="/marches/obligations"
              className="hover:text-white transition"
            >
              Obligations cotées
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <span className="text-slate-200">Calendrier obligataire</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-white">
            Calendrier obligataire BRVM
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            Coupons, amortissements et remboursements des obligations cotées sur
            12 mois glissants.
            {events.length > 0 && (
              <>
                {" "}
                {events.length} événement{events.length > 1 ? "s" : ""}.
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

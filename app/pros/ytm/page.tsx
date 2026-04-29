import YTMCalculator from "@/components/YTMCalculator";
import ProPageHeader from "@/components/pros/ProPageHeader";
import { loadBonds, loadIssuances } from "@/lib/dataLoader";

export const metadata = {
  title: "Simulateur YTM — Pro Terminal",
};

export default function YTMPage() {
  const bonds = loadBonds();
  const issuances = loadIssuances();

  return (
    <div className="space-y-4">
      <ProPageHeader
        title="Simulateur YTM & Pricing obligataire"
        subtitle={`Pricing, YTM, duration et intérêts courus · ${bonds.length} obligations UEMOA · Convention Act/365`}
        breadcrumb={[
          { label: "Pro Terminal", href: "/pros" },
          { label: "Simulateur YTM" },
        ]}
        badge="Premium"
      />
      <div className="pro-tool">
        <YTMCalculator bonds={bonds} issuances={issuances} />
      </div>
    </div>
  );
}

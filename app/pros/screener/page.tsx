import ScreenerView from "@/components/ScreenerView";
import ProPageHeader from "@/components/pros/ProPageHeader";
import { buildActionsScreenerRows } from "@/lib/screeners/actions";

export const metadata = {
  title: "Screener actions — Pro Terminal",
};

export default async function ScreenerPage() {
  const stocks = await buildActionsScreenerRows();

  return (
    <div className="space-y-4">
      <ProPageHeader
        title="Screener d'actions BRVM"
        subtitle={`Filtres multi-critères sur les ${stocks.length} titres cotés · Quadrants risque/rendement, fondamentaux, momentum`}
        breadcrumb={[
          { label: "Pro Terminal", href: "/pros" },
          { label: "Screener actions" },
        ]}
        badge="Premium"
      />
      <div className="pro-tool">
        <ScreenerView stocks={stocks} />
      </div>
    </div>
  );
}

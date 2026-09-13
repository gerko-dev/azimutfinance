import FCPScreenerView from "@/components/FCPScreenerView";
import ProPageHeader from "@/components/pros/ProPageHeader";
import { buildFcpScreenerPayload } from "@/lib/screeners/fcp";

export const metadata = {
  title: "Screener FCP — Pro Terminal",
};


export default function ScreenerFCPPage() {
  const payload = buildFcpScreenerPayload();
  const { rows, refQuarter, latestVLGlobal, stalenessCutoff, categories, managers, types } = payload;

  return (
    <div className="space-y-4">
      <ProPageHeader
        title="Screener FCP / OPCVM"
        subtitle={`Performance, AUM et fraîcheur des VL · ${rows.length} fonds suivis dans la zone UEMOA`}
        breadcrumb={[
          { label: "Pro Terminal", href: "/pros" },
          { label: "Screener FCP" },
        ]}
        badge="Premium"
      />
      <div className="pro-tool">
        <FCPScreenerView
          rows={rows}
          refQuarter={refQuarter}
          latestVLGlobal={latestVLGlobal}
          stalenessCutoff={stalenessCutoff}
          categories={categories}
          managers={managers}
          types={types}
        />
      </div>
    </div>
  );
}

import FCPScreenerView from "@/components/FCPScreenerView";
import ProPageHeader from "@/components/pros/ProPageHeader";
import {
  loadFunds,
  listQuarterEnds,
  getReferenceQuarter,
  getLatestVLDate,
  subtractCalendarDays,
  aumAt,
  categoryAt,
} from "@/lib/fcp";
import {
  perfWindow,
  perfYTD,
  perfLastPeriod,
  publicationCadence,
} from "@/lib/fcpMath";
import type { ScreenerRow } from "@/lib/screenerFCPTypes";

export const metadata = {
  title: "Screener FCP — Pro Terminal",
};

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export default function ScreenerFCPPage() {
  const funds = loadFunds();
  const quarterEnds = listQuarterEnds();
  const refQuarter = getReferenceQuarter(funds);
  const latestVLGlobal = getLatestVLDate(funds);
  const stalenessCutoff = latestVLGlobal
    ? subtractCalendarDays(latestVLGlobal, 15)
    : "";

  const refMs = new Date(refQuarter + "T00:00:00Z").getTime();

  const rows: ScreenerRow[] = funds.map((f) => {
    const aum = aumAt(f, refQuarter);
    const catRef = categoryAt(f, refQuarter) ?? f.categorie;
    const latestVLDate = f.latestVL?.date ?? "";
    const isStale = stalenessCutoff !== "" && latestVLDate < stalenessCutoff;
    const cadence = publicationCadence(f, latestVLGlobal || refQuarter, quarterEnds);
    const ageYears = f.firstObsDate
      ? (refMs - new Date(f.firstObsDate + "T00:00:00Z").getTime()) / MS_PER_YEAR
      : null;

    const last = perfLastPeriod(f);
    const ytd = perfYTD(f);
    const m3 = perfWindow(f, 0.25, "3M");
    const m6 = perfWindow(f, 0.5, "6M");
    const m9 = perfWindow(f, 0.75, "9M");
    const y1 = perfWindow(f, 1, "1Y");
    const y3 = perfWindow(f, 3, "3Y");

    return {
      id: f.id,
      nom: f.nom,
      gestionnaire: f.gestionnaire,
      categorie: catRef,
      type: f.type,
      aumAtRef: aum,
      latestVLDate,
      isStale,
      cadence: cadence.kind,
      ageYears,
      perf: {
        lastPeriod: last.available ? last.totalReturn : null,
        ytd: ytd.available ? ytd.totalReturn : null,
        m3: m3.available ? m3.totalReturn : null,
        m6: m6.available ? m6.totalReturn : null,
        m9: m9.available ? m9.totalReturn : null,
        y1: y1.available ? y1.totalReturn : null,
        y3: y3.available && y3.annualized !== 0 ? y3.annualized : null,
      },
    };
  });

  const categories = Array.from(new Set(rows.map((r) => r.categorie))).sort();
  const managers = Array.from(new Set(rows.map((r) => r.gestionnaire))).sort();
  const types = Array.from(new Set(rows.map((r) => r.type))).sort();

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

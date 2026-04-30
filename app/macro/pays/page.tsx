import Header from "@/components/Header";
import CountryFlag from "@/components/CountryFlag";
import MacroChart, {
  type ChartPoint,
  type ChartSeries,
} from "@/components/macro/MacroChart";
import { CHART } from "@/components/macro/macroColors";
import MacroCountrySelector from "@/components/macro/MacroCountrySelector";
import MacroCyclePanel from "@/components/macro/MacroCyclePanel";
import MacroKPIGrid from "@/components/macro/MacroKPIGrid";
import MacroPeriodSelector from "@/components/macro/MacroPeriodSelector";
import {
  DEFAULT_PERIOD,
  PERIOD_OPTIONS,
  periodToWindow,
  type PeriodId,
} from "@/components/macro/macroPeriod";
import MacroTabNav from "@/components/macro/MacroTabNav";
import MacroTopExports from "@/components/macro/MacroTopExports";
import MacroExplorer, {
  type ExplorerData,
  type ExplorerSeriesPoint,
} from "@/components/macro/MacroExplorer";
import MacroComparator, {
  type ComparatorIndicatorOption,
  type ComparatorPayload,
  type ComparatorSnapshot,
} from "@/components/macro/MacroComparator";
import {
  COUNTRY_BY_CODE,
  MACRO_COUNTRIES,
  computeYoY,
  derivedRatio,
  getCountryKPIs,
  getExplorerCatalog,
  getMultiCountrySeries,
  getSeries,
  getTopExportProducts,
  inferIndicatorUnit,
  type MacroCountryCode,
  type MacroRow,
  type Periodicity,
} from "@/lib/macroLoader";
import { getCyclePeerPoints, inferCycle } from "@/lib/macroCycle";
import { fmtMdsFCFA, fmtPctRaw } from "@/lib/macroFormat";

export const metadata = {
  title: "Indicateurs pays UEMOA — AzimutFinance",
  description:
    "Page pays UEMOA façon Article IV (FMI) : 7 KPI clés avec rang UMOA et critères de convergence ; économie réelle, finances publiques, secteur extérieur, monnaie & finance ; comparateur 8 pays + studio d'analyse complet.",
};

// =============================================================================
// HELPERS
// =============================================================================

function rowsToChartData(
  rowsBySeriesKey: Record<string, MacroRow[]>,
): ChartPoint[] {
  const map = new Map<string, ChartPoint>();
  for (const [key, rows] of Object.entries(rowsBySeriesKey)) {
    for (const r of rows) {
      const row = map.get(r.iso) ?? { iso: r.iso, label: r.label, sortKey: r.sortKey };
      row[key] = r.value;
      map.set(r.iso, row);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => (a.sortKey as number) - (b.sortKey as number),
  );
}

function lastN<T>(arr: T[], n: number | null): T[] {
  if (n === null || arr.length <= n) return arr;
  return arr.slice(-n);
}

function negate(rows: MacroRow[]): MacroRow[] {
  return rows.map((r) => ({ ...r, value: -r.value }));
}

// =============================================================================
// PARAMÈTRES URL
// =============================================================================

const DEFAULT_COUNTRY: MacroCountryCode = "CI";
const DEFAULT_EXPLORER = {
  feuille: "PIB nominal",
  indicator: "PIB nominal (en milliards de FCFA)",
};
const DEFAULT_COMPARATOR_KEY = "growth";

const COMPARATOR_OPTIONS: ComparatorIndicatorOption[] = [
  { key: "growth", feuille: "Global", indicator: ". Taux de croissance reel du PIB (en %)",
    label: "Croissance PIB réel (%)", unit: "raw_pct", decimals: 1 },
  { key: "inflation_avg", feuille: "Global", indicator: "Taux d'inflation moyen annuel (IPC) (en %)",
    label: "Inflation moyenne annuelle (%)", unit: "raw_pct", decimals: 2 },
  { key: "current_account", feuille: "Global", indicator: "Balance courante sur PIB (en %)",
    label: "Compte courant / PIB (%)", unit: "raw_pct", decimals: 1 },
  { key: "investment", feuille: "Global", indicator: ". Taux d'investissement (en %)",
    label: "Taux d'investissement (%)", unit: "raw_pct", decimals: 1 },
  { key: "savings", feuille: "Global", indicator: ". Taux d'epargne interieure (en %)",
    label: "Taux d'épargne intérieure (%)", unit: "raw_pct", decimals: 1 },
  { key: "openness", feuille: "Global", indicator: "Degre d'ouverture (Export B&S+Import B&S)/PIB (en %)",
    label: "Degré d'ouverture (%)", unit: "raw_pct", decimals: 1 },
  { key: "pib", feuille: "Global", indicator: "PIB nominal (en milliards de FCFA)",
    label: "PIB nominal (Mds FCFA)", unit: "Mds_FCFA", decimals: 0 },
  { key: "debt", feuille: "Global", indicator: "Encours de la dette",
    label: "Encours dette (Mds FCFA)", unit: "Mds_FCFA", decimals: 0 },
  { key: "budget_balance", feuille: "Global", indicator: "Solde budgetaire global, avec dons (base engagement) (R1 - D1)",
    label: "Solde budgétaire global (Mds FCFA)", unit: "Mds_FCFA", decimals: 0 },
];

// =============================================================================
// PAGE
// =============================================================================

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const get = (k: string): string | undefined =>
    typeof sp[k] === "string"
      ? (sp[k] as string)
      : Array.isArray(sp[k])
        ? (sp[k] as string[])[0]
        : undefined;

  const countryCode = (get("pays") as MacroCountryCode) ?? DEFAULT_COUNTRY;
  const country = COUNTRY_BY_CODE[countryCode] ?? COUNTRY_BY_CODE[DEFAULT_COUNTRY];
  const cc = country.code as MacroCountryCode;

  // ----- Periode (URL ?period=) : applique a tous les charts du dashboard -----
  const periodParam = get("period");
  const period: PeriodId =
    PERIOD_OPTIONS.find((p) => p.id === periodParam)?.id ?? DEFAULT_PERIOD;
  const winY = periodToWindow(period, "yearly");
  const winM = periodToWindow(period, "monthly");

  // ============================================================================
  // BLOC 1 — KPI scorecard (7 indicateurs cles, rang UMOA + criteres convergence)
  // ============================================================================
  const kpis = getCountryKPIs(cc);

  // ----- Cycle economique -----
  const cycleSnapshot = inferCycle(cc);
  const cyclePeers = getCyclePeerPoints();

  // Series PIB nominal (reutilisee pour ratios)
  const pibNominal = getSeries(cc, "Global", "PIB nominal (en milliards de FCFA)");

  // ============================================================================
  // BLOC 2 — ECONOMIE REELLE (2 charts)
  // ============================================================================

  // 2.1 Croissance & inflation (lines, annuel)
  const pibGrowth = getSeries(cc, "Global", ". Taux de croissance reel du PIB (en %)");
  const inflation = getSeries(cc, "Global", "Taux d'inflation moyen annuel (IPC) (en %)");
  const reel21Data = rowsToChartData({
    growth: lastN(pibGrowth, winY),
    infl: lastN(inflation, winY),
  });
  const reel21Series: ChartSeries[] = [
    { key: "growth", label: "Croissance PIB réel (%)", color: CHART.green, type: "line" },
    { key: "infl", label: "Inflation moyenne (%)", color: CHART.red, type: "line" },
  ];

  // 2.2 Structure sectorielle (stacked area, % PIB)
  const secPrim = getSeries(cc, "Global", "Poids (%) : Secteur primaire");
  const secSec = getSeries(cc, "Global", "Secteur secondaire");
  const secTer = getSeries(cc, "Global", "Secteur tertiaire");
  const reel22Data = rowsToChartData({
    primaire: lastN(secPrim, winY),
    secondaire: lastN(secSec, winY),
    tertiaire: lastN(secTer, winY),
  });
  const reel22Series: ChartSeries[] = [
    { key: "primaire", label: "Primaire", color: CHART.green, type: "area" },
    { key: "secondaire", label: "Secondaire", color: CHART.amber, type: "area" },
    { key: "tertiaire", label: "Tertiaire", color: CHART.blue, type: "area" },
  ];

  // ============================================================================
  // BLOC 3 — FINANCES PUBLIQUES (2 charts)
  // ============================================================================

  // 3.1 Recettes/Depenses/Solde (composed bars + line)
  const recettesFiscales = getSeries(cc, "TOFE", ". Recettes fiscales");
  const recettesNonFisc = getSeries(cc, "TOFE", "Recettes non fiscales");
  const dons = getSeries(cc, "TOFE", "DONS");
  const depCourantes = getSeries(cc, "TOFE", ".Depenses courantes (D3)");
  const depCapital = getSeries(cc, "TOFE", "DEPENSES EN CAPITAL (D5)");
  const solde = getSeries(
    cc,
    "TOFE",
    "Solde budgetaire global, avec dons (base engagement) (R1 - D1)",
  );
  const soldeGdpRatio = derivedRatio(solde, pibNominal, 100);

  const fiscal31Data = rowsToChartData({
    recFisc: lastN(recettesFiscales, winY),
    recNonFisc: lastN(recettesNonFisc, winY),
    dons: lastN(dons, winY),
    depCourantesNeg: negate(lastN(depCourantes, winY)),
    depCapitalNeg: negate(lastN(depCapital, winY)),
    soldePct: lastN(soldeGdpRatio, winY),
  });
  // Recettes : verts distincts ; depenses : magenta + violet pour eviter
  // confusion avec les verts ; solde : navy line.
  const fiscal31Series: ChartSeries[] = [
    { key: "recFisc", label: "Recettes fiscales", color: "#047857", type: "bar", yAxis: "left" },
    { key: "recNonFisc", label: "Recettes non fiscales", color: "#10b981", type: "bar", yAxis: "left" },
    { key: "dons", label: "Dons", color: "#a3e635", type: "bar", yAxis: "left" },
    { key: "depCourantesNeg", label: "Dépenses courantes", color: "#9d174d", type: "bar", yAxis: "left" },
    { key: "depCapitalNeg", label: "Dépenses capital", color: "#f97316", type: "bar", yAxis: "left" },
    { key: "soldePct", label: "Solde / PIB (%)", color: "#0f172a", type: "line", yAxis: "right" },
  ];

  // 3.2 Trajectoire dette (composed area + line)
  const debtBilat = getSeries(cc, "Dettes extérieures", "Dette publique bilaterale");
  const debtMulti = getSeries(cc, "Dettes extérieures", "Dette publique multilaterale");
  const debtFmi = getSeries(cc, "Dettes extérieures", "Utilisation des credits du FMI");
  const debtTotal = getSeries(cc, "Global", "Encours de la dette");
  const debtGdpRatio = derivedRatio(debtTotal, pibNominal, 100);
  const fiscal32Data = rowsToChartData({
    bilat: lastN(debtBilat, winY),
    multi: lastN(debtMulti, winY),
    fmi: lastN(debtFmi, winY),
    ratio: lastN(debtGdpRatio, winY),
  });
  // Bleu/vert pour les aires empilees ; FMI = rose vif (line, axe gauche) pour
  // ressortir distinctement des aires ; ratio = navy (line, axe droit).
  const fiscal32Series: ChartSeries[] = [
    { key: "bilat", label: "Bilatérale", color: "#1d4ed8", type: "area", yAxis: "left" },
    { key: "multi", label: "Multilatérale", color: "#0d9488", type: "area", yAxis: "left" },
    { key: "fmi", label: "FMI (sous-ensemble)", color: "#db2777", type: "line", yAxis: "left" },
    { key: "ratio", label: "Dette / PIB (%)", color: "#0f172a", type: "line", yAxis: "right" },
  ];

  // ============================================================================
  // BLOC 4 — SECTEUR EXTERIEUR (2 charts)
  // ============================================================================

  // 4.1 Balance commerciale & compte courant (composed bars + line)
  const expFob = getSeries(cc, "Global", "Exportations de biens FOB :");
  const impFob = getSeries(cc, "Global", "Importations de biens FOB");
  const cabPct = getSeries(cc, "Global", "Balance courante sur PIB (en %)");
  const ext41Data = rowsToChartData({
    exp: lastN(expFob, winY),
    impNeg: negate(lastN(impFob, winY)),
    cab: lastN(cabPct, winY),
  });
  const ext41Series: ChartSeries[] = [
    { key: "exp", label: "Exports biens FOB", color: CHART.green, type: "bar", yAxis: "left" },
    { key: "impNeg", label: "Imports biens FOB", color: CHART.amber, type: "bar", yAxis: "left" },
    { key: "cab", label: "Compte courant / PIB (%)", color: CHART.navy, type: "line", yAxis: "right" },
  ];

  // 4.2 Top 5 produits d'exportation
  const exportsTop = getTopExportProducts(cc, 5);

  // ============================================================================
  // BLOC 5 — MONNAIE & FINANCE (1 chart + 1 mini-tableau)
  // ============================================================================

  // 5.1 Credit & masse monetaire YoY (lines, mensuel)
  const m2 = getSeries(cc, "Masse monétaire", "Agregats de Monnaie - Masse monetaire (M2)");
  const credEcon = getSeries(
    cc,
    "Masse monétaire",
    "Agregats de Monnaie - Creances interieures - Creances sur les autres secteurs",
  );
  const m2Yoy = computeYoY(m2);
  const credYoy = computeYoY(credEcon);
  const monet51Data = rowsToChartData({
    m2: lastN(m2Yoy, winM),
    cred: lastN(credYoy, winM),
  });
  const monet51Series: ChartSeries[] = [
    { key: "m2", label: "M2 — masse monétaire (% YoY)", color: CHART.blue, type: "line" },
    { key: "cred", label: "Crédit aux autres secteurs (% YoY)", color: CHART.red, type: "line" },
  ];

  // 5.2 Conditions de financement (mini-tableau, agregat UMOA)
  const tauxCreditPrives = getSeries(
    "UMOA",
    "Taux d'intérêt banques",
    "Taux d interet moyen des credits aux autres societes non financieres (privees)",
  );
  const tauxDepots = getSeries(
    "UMOA",
    "Taux d'intérêt banques",
    "Taux moyen de remuneration des depots aupres des banques",
  );
  const tauxInterbancaire = getSeries(
    "UMOA",
    "Marché Mon. & Int.",
    "Taux moyen pondere des operations interbancaires toutes maturites confondues",
  );
  const lastTauxCredit = tauxCreditPrives[tauxCreditPrives.length - 1];
  const lastTauxDepot = tauxDepots[tauxDepots.length - 1];
  const lastInterbank = tauxInterbancaire[tauxInterbancaire.length - 1];
  const spread =
    lastTauxCredit && lastTauxDepot ? lastTauxCredit.value - lastTauxDepot.value : null;

  // ============================================================================
  // COMPARATEUR UEMOA
  // ============================================================================
  const cmpKey = get("cmp") ?? DEFAULT_COMPARATOR_KEY;
  const cmpOption =
    COMPARATOR_OPTIONS.find((o) => o.key === cmpKey) ?? COMPARATOR_OPTIONS[0];
  const cmpAllCountries = MACRO_COUNTRIES.map((c) => c.code);
  const cmpSeriesByCountry = getMultiCountrySeries(
    cmpOption.feuille,
    cmpOption.indicator,
    cmpAllCountries,
  );
  const cmpSnapshots: ComparatorSnapshot[] = cmpAllCountries.map((c) => {
    const series = cmpSeriesByCountry.get(c) ?? [];
    const last = series[series.length - 1];
    return {
      countryCode: c,
      countryName: COUNTRY_BY_CODE[c]?.shortName ?? c,
      value: last?.value ?? null,
      periodLabel: last?.label ?? null,
      history: series.map((r) => ({
        label: r.label,
        value: r.value,
        iso: r.iso,
        sortKey: r.sortKey,
      })),
    };
  });
  const cmpPeriodicity = cmpSnapshots.find((s) => s.history.length > 0)?.history[0];
  const cmpHistoryWindow = (() => {
    const map = new Map<string, ChartPoint>();
    const hasMonthly = cmpPeriodicity && /\d{4}-\d{2}/.test(String(cmpPeriodicity.iso));
    const window = hasMonthly ? 60 : 20;
    for (const c of cmpAllCountries) {
      const series = cmpSeriesByCountry.get(c) ?? [];
      const slice = lastN(series, window);
      for (const r of slice) {
        const row = map.get(r.iso) ?? { iso: r.iso, label: r.label, sortKey: r.sortKey };
        row[c] = r.value;
        map.set(r.iso, row);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.sortKey as number) - (b.sortKey as number),
    );
  })();
  const comparatorPayload: ComparatorPayload = {
    selected: cmpOption,
    snapshots: cmpSnapshots,
    history: cmpHistoryWindow as ComparatorPayload["history"],
    countriesInChart: cmpAllCountries,
  };

  // ============================================================================
  // EXPLORER (studio)
  // ============================================================================
  const xFeuille = get("xfeuille") ?? DEFAULT_EXPLORER.feuille;
  const xInd = get("xind") ?? DEFAULT_EXPLORER.indicator;
  const xCompare = get("xcompare") === "1";

  const explorerCatalog = getExplorerCatalog(cc);
  const validFeuille =
    explorerCatalog.find((f) => f.feuille === xFeuille) ?? explorerCatalog[0];
  const validIndicator =
    validFeuille?.indicators.find((i) => i.indicator === xInd) ??
    validFeuille?.indicators[0];

  const explorerCountries = xCompare ? cmpAllCountries : [cc];
  const explorerByCountry: Record<MacroCountryCode, ExplorerSeriesPoint[]> = {} as Record<
    MacroCountryCode,
    ExplorerSeriesPoint[]
  >;
  if (validFeuille && validIndicator) {
    const series = getMultiCountrySeries(
      validFeuille.feuille,
      validIndicator.indicator,
      explorerCountries,
    );
    for (const c of explorerCountries) {
      explorerByCountry[c] = (series.get(c) ?? []).map((r) => ({
        iso: r.iso,
        label: r.label,
        sortKey: r.sortKey,
        value: r.value,
      }));
    }
  }
  const explorerPeriodicity: Periodicity = validFeuille?.periodicity ?? "yearly";
  const explorerData: ExplorerData = {
    feuille: validFeuille?.feuille ?? DEFAULT_EXPLORER.feuille,
    indicator: validIndicator?.indicator ?? DEFAULT_EXPLORER.indicator,
    periodicity: explorerPeriodicity,
    byCountry: explorerByCountry,
    primary: cc,
    primaryUnit: inferIndicatorUnit(
      validIndicator?.indicator ?? "",
      validFeuille?.feuille ?? "",
    ),
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  const baseParams: Record<string, string> = {
    pays: country.code,
    cmp: cmpKey,
    xfeuille: explorerData.feuille,
    xind: explorerData.indicator,
    ...(xCompare ? { xcompare: "1" } : {}),
    ...(period !== DEFAULT_PERIOD ? { period } : {}),
  };
  const explorerPreserve: Record<string, string> = {
    cmp: cmpKey,
    xfeuille: explorerData.feuille,
    xind: explorerData.indicator,
    ...(xCompare ? { xcompare: "1" } : {}),
    ...(period !== DEFAULT_PERIOD ? { period } : {}),
  };
  // Pour le sélecteur de période : on conserve le pays (et tout le reste).
  const periodPreserve: Record<string, string> = {
    pays: country.code,
    cmp: cmpKey,
    xfeuille: explorerData.feuille,
    xind: explorerData.indicator,
    ...(xCompare ? { xcompare: "1" } : {}),
  };

  // Hero stats
  const heroPibKpi = kpis.find((k) => k.key === "pib_nominal");
  const heroGrowth = kpis.find((k) => k.key === "pib_growth");
  const heroInflation = kpis.find((k) => k.key === "inflation_avg");
  const heroDebtGdp = kpis.find((k) => k.key === "debt_gdp");

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="text-xs md:text-sm text-slate-500 mb-2">
            Accueil &rsaquo; Macro &rsaquo; Indicateurs pays UEMOA
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <CountryFlag
                country={country.code === "UMOA" ? "UEMOA" : country.code}
                size={36}
              />
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold leading-tight">
                  {country.shortName}
                </h1>
                <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                  {country.longName}
                  {country.capital ? ` · capitale ${country.capital}` : ""}
                </p>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              Source : <span className="font-medium text-slate-700">BCEAO</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <MacroCountrySelector
              selected={cc}
              preserveParams={explorerPreserve}
            />
            <MacroPeriodSelector
              selected={period}
              basePath="/macro/pays"
              preserveParams={periodPreserve}
            />
          </div>

          {/* Hero stats : 4 grands chiffres */}
          <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <HeroStat
              label="PIB nominal"
              value={heroPibKpi?.value !== null ? fmtMdsFCFA(heroPibKpi?.value ?? NaN) : "—"}
              period={heroPibKpi?.periodLabel}
              accent="text-blue-700"
            />
            <HeroStat
              label="Croissance réelle"
              value={heroGrowth?.value !== null ? fmtPctRaw(heroGrowth?.value ?? NaN, 1) : "—"}
              period={heroGrowth?.periodLabel}
              accent="text-emerald-700"
            />
            <HeroStat
              label="Inflation moyenne"
              value={heroInflation?.value !== null ? fmtPctRaw(heroInflation?.value ?? NaN, 1) : "—"}
              period={heroInflation?.periodLabel}
              accent="text-amber-700"
            />
            <HeroStat
              label="Dette / PIB"
              value={heroDebtGdp?.value !== null ? fmtPctRaw(heroDebtGdp?.value ?? NaN, 1) : "—"}
              period={heroDebtGdp?.periodLabel}
              accent="text-rose-700"
            />
          </div>
        </div>
      </div>

      <MacroTabNav />

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-8">
        {/* =========================================================
            BLOC 1 — INDICATEURS CLES (carte d'identite macro)
        =========================================================== */}
        <section id="overview" className="scroll-mt-24">
          <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-base md:text-lg font-semibold">Indicateurs clés</h2>
              <p className="text-[11px] md:text-xs text-slate-500 mt-0.5">
                7 métriques canoniques d&apos;une page pays Article IV. Rang du pays sur les 8
                États UEMOA et badge de respect des critères de convergence (inflation ≤ 3 %,
                solde budgétaire ≥ −3 %, dette ≤ 70 %).
              </p>
            </div>
            <span className="text-[11px] text-slate-400">Annuel · BCEAO</span>
          </div>
          <MacroKPIGrid kpis={kpis} />
        </section>

        {/* =========================================================
            DEDUCTEUR DE CYCLE ECONOMIQUE
        =========================================================== */}
        <MacroCyclePanel
          snapshot={cycleSnapshot}
          peers={cyclePeers}
          selected={cc}
        />

        {/* =========================================================
            BLOC 2 — ECONOMIE REELLE
        =========================================================== */}
        <section id="reel" className="scroll-mt-24">
          <h2 className="text-base md:text-lg font-semibold mb-3">Économie réelle</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="Croissance & inflation"
              subtitle="Variations annuelles, 16 dernières années."
            >
              <MacroChart
                data={reel21Data}
                series={reel21Series}
                yLeftUnit="raw_pct"
                zeroReference
                height={300}
              />
            </ChartCard>
            <ChartCard
              title="Structure sectorielle du PIB"
              subtitle="Poids des secteurs primaire, secondaire, tertiaire (% PIB)."
            >
              <MacroChart
                data={reel22Data}
                series={reel22Series}
                yLeftUnit="raw_pct"
                stacked
                height={300}
                smallLabels
              />
            </ChartCard>
          </div>
        </section>

        {/* =========================================================
            BLOC 3 — FINANCES PUBLIQUES
        =========================================================== */}
        <section id="fiscal" className="scroll-mt-24">
          <h2 className="text-base md:text-lg font-semibold mb-3">Finances publiques</h2>
          <div className="space-y-4">
            <ChartCard
              title="Recettes, dépenses et solde budgétaire"
              subtitle="Recettes empilées en positif (fiscales + non fiscales + dons), dépenses empilées en négatif (courantes + capital). Solde global avec dons en % du PIB sur l'axe droit."
            >
              <MacroChart
                data={fiscal31Data}
                series={fiscal31Series}
                yLeftUnit="MdsFCFA"
                yRightUnit="raw_pct"
                stacked
                zeroReference
                height={340}
              />
            </ChartCard>
            <ChartCard
              title="Trajectoire de la dette publique"
              subtitle="Composition (bilatérale + multilatérale, FMI en sous-ensemble overlay) et ratio dette/PIB (axe droit). Seuil de convergence UEMOA : 70 %."
            >
              <MacroChart
                data={fiscal32Data}
                series={fiscal32Series}
                yLeftUnit="MdsFCFA"
                yRightUnit="raw_pct"
                stacked
                height={320}
              />
            </ChartCard>
          </div>
        </section>

        {/* =========================================================
            BLOC 4 — SECTEUR EXTERIEUR
        =========================================================== */}
        <section id="externe" className="scroll-mt-24">
          <h2 className="text-base md:text-lg font-semibold mb-3">Secteur extérieur</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="Balance commerciale & compte courant"
              subtitle="Exports (positifs) et imports (négatifs) en milliards de FCFA, compte courant en % du PIB sur l'axe droit."
            >
              <MacroChart
                data={ext41Data}
                series={ext41Series}
                yLeftUnit="MdsFCFA"
                yRightUnit="raw_pct"
                zeroReference
                height={320}
              />
            </ChartCard>
            <ChartCard
              title="Top 5 produits d'exportation"
              subtitle={`Concentration des exportations${
                exportsTop.period ? ` à fin ${exportsTop.period}` : ""
              }. Source : Balance des paiements (BP VI).`}
            >
              <MacroTopExports
                top={exportsTop.top}
                others={exportsTop.others}
                period={exportsTop.period}
              />
            </ChartCard>
          </div>
        </section>

        {/* =========================================================
            BLOC 5 — MONNAIE & FINANCE
        =========================================================== */}
        <section id="monetaire" className="scroll-mt-24">
          <h2 className="text-base md:text-lg font-semibold mb-3">Monnaie & finance</h2>
          <div className="space-y-4">
            <ChartCard
              title="Crédit à l'économie & masse monétaire (glissement annuel)"
              subtitle="Taux de croissance YoY (%) de M2 et des créances sur les autres secteurs. Indicateur de transmission monétaire et de financement de l'économie."
            >
              <MacroChart
                data={monet51Data}
                series={monet51Series}
                yLeftUnit="raw_pct"
                zeroReference
                height={300}
                smallLabels
              />
            </ChartCard>

            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold">Conditions de financement</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Dernier mois disponible · agrégat UMOA. Le franc CFA est arrimé à l&apos;euro
                  (1 EUR = 655,957 FCFA), donc identique pour les 8 pays.
                </p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <FinancingCell
                  label="Taux moyen crédits aux entreprises privées"
                  value={lastTauxCredit ? fmtPctRaw(lastTauxCredit.value, 2) : "—"}
                  period={lastTauxCredit?.label}
                />
                <FinancingCell
                  label="Taux moyen rémunération des dépôts"
                  value={lastTauxDepot ? fmtPctRaw(lastTauxDepot.value, 2) : "—"}
                  period={lastTauxDepot?.label}
                />
                <FinancingCell
                  label="Spread crédits − dépôts"
                  value={
                    spread !== null
                      ? `${spread.toFixed(2).replace(".", ",")} pp`
                      : "—"
                  }
                  period={lastTauxCredit?.label}
                  highlight
                />
                <FinancingCell
                  label="Taux interbancaire (toutes maturités)"
                  value={lastInterbank ? fmtPctRaw(lastInterbank.value, 2) : "—"}
                  period={lastInterbank?.label}
                />
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            COMPARATEUR
        =========================================================== */}
        <MacroComparator
          data={comparatorPayload}
          options={COMPARATOR_OPTIONS}
          basePath="/macro/pays"
          baseParams={baseParams}
          highlight={cc}
        />

        {/* =========================================================
            STUDIO
        =========================================================== */}
        <MacroExplorer
          catalog={explorerCatalog}
          data={explorerData}
          basePath="/macro/pays"
          baseParams={baseParams}
          compare={xCompare}
        />

        {/* Méthodologie */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-sm font-semibold mb-2">Méthodologie & sources</h3>
          <div className="text-xs text-slate-600 space-y-1.5">
            <p>
              <strong>Source :</strong> Banque Centrale des États de l&apos;Afrique de l&apos;Ouest
              (BCEAO), agrégats statistiques pays + ensemble UMOA.
            </p>
            <p>
              <strong>Approche :</strong> page pays au format <em>Article IV</em> (FMI),
              structurée en 5 blocs — indicateurs clés, économie réelle, finances publiques,
              secteur extérieur, monnaie &amp; finance.
            </p>
            <p>
              <strong>Critères de convergence UEMOA</strong> retenus pour les badges :
              inflation ≤ 3 %, solde budgétaire global avec dons ≥ −3 % du PIB,
              encours de la dette publique ≤ 70 % du PIB.
            </p>
            <p>
              <strong>Écarté du dashboard, accessible via le studio :</strong> SAID
              (situation des autres institutions de dépôts), Situation BCEAO, PEG (position
              extérieure globale), BP V (balance des paiements ancien format), crédit sectoriel
              détaillé, taux de change FCFA hors euro, IPC par fonction, et toutes les séries
              annexes du fichier source.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 md:p-4">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function HeroStat({
  label,
  value,
  period,
  accent,
}: {
  label: string;
  value: string;
  period?: string | null;
  accent?: string;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-gradient-to-br from-white to-slate-50">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div
        className={`text-2xl md:text-3xl font-semibold tabular-nums ${
          accent ?? "text-slate-900"
        }`}
      >
        {value}
      </div>
      {period && <div className="text-[10px] text-slate-400 mt-0.5">{period}</div>}
    </div>
  );
}

function FinancingCell({
  label,
  value,
  period,
  highlight,
}: {
  label: string;
  value: string;
  period?: string | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={`border rounded-lg p-3 ${
        highlight
          ? "bg-blue-50 border-blue-200"
          : "bg-slate-50 border-slate-200"
      }`}
    >
      <div className="text-[11px] text-slate-600 leading-tight min-h-[28px]">{label}</div>
      <div
        className={`text-lg md:text-xl font-semibold tabular-nums mt-1 ${
          highlight ? "text-blue-800" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      {period && <div className="text-[10px] text-slate-400 mt-0.5">{period}</div>}
    </div>
  );
}

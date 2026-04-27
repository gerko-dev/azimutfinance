import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import TauxView from "@/components/taux/TauxView";
import {
  loadTauxRaw,
  getSeries,
  getLatest,
  getDelta,
  getSnapshot,
  listAllSeriesDescriptors,
  detectBceaoRateChanges,
  getSourceLabel,
} from "@/lib/tauxLoader";
import { fmtPct, fmtBp, fmtMdsFCFA, fmtRate } from "@/lib/tauxFormat";

export const dynamic = "force-static";

export const metadata = {
  title: "Taux BCEAO & UEMOA — AzimutFinance",
  description:
    "Tableau de bord des taux directeurs BCEAO, marché monétaire UEMOA, marché interbancaire UMOA, inflation, conditions de banque et change. Studio d'analyse interactif.",
};

const MATURITES_ORDER = ["1j", "1sem", "2sem", "1mois", "3mois"];
const MATURITES_VOL_ORDER = ["1j", "1sem", "2sem", "1mois", "3mois", "6mois"];

const COND_CAT_ORDER = [
  "Ensemble",
  "Societes non financieres",
  "Menages",
  "Societes financieres",
  "Autres institutions de depots",
  "Administrations Publiques",
];
const COND_OBJ_ORDER = [
  "Ensemble",
  "Tresorerie",
  "Equipement",
  "Immobilier",
  "Consommation",
  "Exportation",
  "Autres",
];
const COND_COUNTRIES = [
  "Benin",
  "Burkina Faso",
  "Cote d'Ivoire",
  "Guinee-Bissau",
  "Mali",
  "Niger",
  "Senegal",
  "Togo",
];

const RESERVES_COUNTRIES = [
  "Benin",
  "Burkina Faso",
  "Cote d'Ivoire",
  "Guinee-Bissau",
  "Mali",
  "Niger",
  "Senegal",
  "Togo",
  "UMOA",
];

const AGREGATS_COUNTRIES = [
  "Benin",
  "Burkina Faso",
  "Cote d'Ivoire",
  "Guinee-Bissau",
  "Mali",
  "Niger",
  "Senegal",
  "Togo",
  "Union",
];

const INFLATION_COUNTRIES = [
  "Benin",
  "Burkina Faso",
  "Cote d'Ivoire",
  "Guinee-Bissau",
  "Mali",
  "Niger",
  "Senegal",
  "Togo",
  "UEMOA",
  "Mediane UEMOA",
];

const PARTENAIRES = [
  "Zone euro (BCE)",
  "USA (Fed funds)",
  "Royaume-Uni (Bank Rate)",
  "Japon",
];

export default function MarcheMonetairePage() {
  // Charge tout
  loadTauxRaw();

  // ---- KPIs ----
  const pension = getSeries("1_Taux_directeurs_BCEAO", "Taux minimum appels offres", "UEMOA")!;
  const pretMarginal = getSeries("1_Taux_directeurs_BCEAO", "Taux pret marginal", "UEMOA")!;
  const tmpHebdo = getSeries("2_Marche_monetaire", "TMP adjudication hebdomadaire", "UEMOA")!;
  const tmpMensuel = getSeries("2_Marche_monetaire", "TMP adjudication mensuelle", "UEMOA")!;
  const encoursRefi = getSeries("2_Marche_monetaire", "Encours refinancement banques", "UEMOA")!;
  const inflationUemoa = getSeries("4_Inflation_pays_UEMOA", "IPC glissement annuel", "UEMOA")!;
  const eurFcfaSpot = getLatest("7_Change_EUR", "EUR/FCFA", "EUR/FCFA");
  const eurUsdSpot = getLatest("7_Change_EUR", "EUR/USD", "EUR/USD");

  const pensionDelta = getDelta("1_Taux_directeurs_BCEAO", "Taux minimum appels offres", "UEMOA");
  const tmpHebdoDelta = getDelta("2_Marche_monetaire", "TMP adjudication hebdomadaire", "UEMOA");
  const tmpMensuelDelta = getDelta("2_Marche_monetaire", "TMP adjudication mensuelle", "UEMOA");
  const inflDelta = getDelta("4_Inflation_pays_UEMOA", "IPC glissement annuel", "UEMOA");
  const refiDelta = getDelta("2_Marche_monetaire", "Encours refinancement banques", "UEMOA");

  const kpis = [
    {
      label: "Taux pension BCEAO",
      value: fmtPct(pension.points.at(-1)!.value),
      delta: pensionDelta
        ? {
            text: `${fmtBp(pensionDelta.delta)} vs préc. (${pension.points.at(-2)?.label})`,
            positive: pensionDelta.delta > 0 ? true : pensionDelta.delta < 0 ? false : null,
          }
        : undefined,
      hint: pension.points.at(-1)?.label,
    },
    {
      label: "TMP adjudication hebdo",
      value: fmtPct(tmpHebdo.points.at(-1)!.value),
      delta: tmpHebdoDelta
        ? {
            text: `${fmtBp(tmpHebdoDelta.delta)} vs ${tmpHebdo.points.at(-2)?.label}`,
            positive: tmpHebdoDelta.delta > 0 ? true : tmpHebdoDelta.delta < 0 ? false : null,
          }
        : undefined,
      hint: tmpHebdo.points.at(-1)?.label,
    },
    {
      label: "TMP adjudication mensuelle",
      value: fmtPct(tmpMensuel.points.at(-1)!.value),
      delta: tmpMensuelDelta
        ? {
            text: `${fmtBp(tmpMensuelDelta.delta)} vs ${tmpMensuel.points.at(-2)?.label}`,
            positive: tmpMensuelDelta.delta > 0 ? true : tmpMensuelDelta.delta < 0 ? false : null,
          }
        : undefined,
      hint: tmpMensuel.points.at(-1)?.label,
    },
    {
      label: "Inflation UEMOA (YoY)",
      value: fmtPct(inflationUemoa.points.at(-1)!.value),
      delta: inflDelta
        ? {
            text: `${fmtBp(inflDelta.delta)} vs ${inflationUemoa.points.at(-2)?.label}`,
            positive: inflDelta.delta > 0 ? true : inflDelta.delta < 0 ? false : null,
          }
        : undefined,
      hint: inflationUemoa.points.at(-1)?.label,
    },
    {
      label: "Encours refi banques",
      value: encoursRefi.points.at(-1) ? fmtMdsFCFA(encoursRefi.points.at(-1)!.value) : "—",
      delta: refiDelta
        ? {
            text: `${refiDelta.delta >= 0 ? "+" : ""}${fmtMdsFCFA(refiDelta.delta)}`,
            positive: refiDelta.delta > 0 ? true : refiDelta.delta < 0 ? false : null,
          }
        : undefined,
      hint: encoursRefi.points.at(-1)?.label,
    },
    {
      label: "EUR / FCFA",
      value: eurFcfaSpot ? fmtRate(eurFcfaSpot.value, 4) : "—",
      hint: "Parité fixe",
    },
    {
      label: "EUR / USD",
      value: eurUsdSpot ? fmtRate(eurUsdSpot.value, 4) : "—",
      hint: eurUsdSpot?.label,
    },
    {
      label: "Source",
      value: "BCEAO",
      hint: "Bulletin mensuel · fév. 2026",
    },
  ];

  // ---- Politique BCEAO : changements de taux ----
  const bceaoChanges = detectBceaoRateChanges();

  // ---- Interbancaire : taux & volumes par maturité ----
  const interbancaireTaux = MATURITES_ORDER.map((m) => ({
    maturity: m,
    series: getSeries("8_Interbancaire_UMOA", `Taux ${m}`, "UMOA")!,
  })).filter((x) => x.series);
  const interbancaireVolumes = MATURITES_VOL_ORDER.map((m) => ({
    maturity: m,
    series: getSeries("8_Interbancaire_UMOA", `Volume ${m}`, "UMOA")!,
  })).filter((x) => x.series);

  // ---- Inflation : 8 pays + UEMOA + Mediane ----
  const inflationSeries = INFLATION_COUNTRIES.map((c) =>
    getSeries("4_Inflation_pays_UEMOA", "IPC glissement annuel", c)
  ).filter((s): s is NonNullable<typeof s> => s !== null);

  // ---- Conditions de banque : heatmaps ----
  function buildConditionsHeatmap(
    section: "10a_Conditions_banque_categorie" | "10b_Conditions_banque_objet",
    rows: string[]
  ) {
    const values: [string, number][] = [];
    for (const r of rows) {
      for (const c of COND_COUNTRIES) {
        const snap = getSnapshot(section, r);
        const v = snap.find((s) => s.country === c)?.value;
        if (v !== undefined) values.push([`${r}|${c}`, v]);
      }
    }
    return { rows, cols: COND_COUNTRIES, values };
  }
  const conditionsCat = buildConditionsHeatmap("10a_Conditions_banque_categorie", COND_CAT_ORDER);
  const conditionsObj = buildConditionsHeatmap("10b_Conditions_banque_objet", COND_OBJ_ORDER);
  const conditionsPeriod = "Février 2026";

  // ---- Crédits & dépôts ----
  const credits = getSeries("3_Credits_Depots_UEMOA", "Taux moyen credits", "UEMOA")!;
  const depots = getSeries("3_Credits_Depots_UEMOA", "Taux moyen depots", "UEMOA")!;
  const marge = getSeries("3_Credits_Depots_UEMOA", "Marge interet", "UEMOA")!;
  const volumes = getSeries("3_Credits_Depots_UEMOA", "Volume nouveaux credits", "UEMOA")!;

  // ---- Réserves obligatoires ----
  const reserves = RESERVES_COUNTRIES.map((c) => {
    const req = getSnapshot("9_Reserves_const_vs_req", "Reserves requises").find((x) => x.country === c)?.value ?? 0;
    const cons = getSnapshot("9_Reserves_const_vs_req", "Reserves constituees").find((x) => x.country === c)?.value ?? 0;
    const net = getSnapshot("9_Reserves_const_vs_req", "Solde net").find((x) => x.country === c)?.value ?? 0;
    const ratio = getSnapshot("9_Reserves_const_vs_req", "Ratio constituees sur requises").find((x) => x.country === c)?.value ?? 0;
    return { country: c, req, cons, net, ratio };
  });
  const reservesPeriod = "16 janv → 15 fév 2026";

  // ---- Agrégats monétaires ----
  const agregats = AGREGATS_COUNTRIES.map((c) => ({
    country: c,
    m2: getSnapshot("5_Reserves_Agregats", "Masse monetaire M2").find((x) => x.country === c)?.value ?? 0,
    fid: getSnapshot("5_Reserves_Agregats", "Circulation fiduciaire").find((x) => x.country === c)?.value ?? 0,
    aen: getSnapshot("5_Reserves_Agregats", "Actifs exterieurs nets").find((x) => x.country === c)?.value ?? 0,
    cri: getSnapshot("5_Reserves_Agregats", "Creances interieures").find((x) => x.country === c)?.value ?? 0,
  }));

  // ---- Partenaires ----
  const partenaires = PARTENAIRES.map((p) =>
    getSeries("6_Taux_directeurs_partenaires", p, p)
  ).filter((s): s is NonNullable<typeof s> => s !== null);

  // ---- Change ----
  const PAIRS = ["EUR/USD", "EUR/GBP", "EUR/JPY", "EUR/CNY", "EUR/FCFA"];
  const changeSpots = PAIRS.map((p) => {
    const series = getSeries("7_Change_EUR", p, p)!;
    const latest = series.points.at(-1)!;
    const moy2025 = series.points.find((pt) => pt.iso === "2025")?.value ?? NaN;
    const fev2025 = series.points.find((pt) => pt.iso === "2025-02")?.value ?? NaN;
    return {
      pair: p,
      latest: latest.value,
      latestLabel: latest.label,
      moy2025,
      fev2025,
    };
  });
  const changeYoy = PAIRS.map((p) => {
    const v = getLatest("7_Change_EUR", `Variation annuelle ${p}`, p);
    return { pair: p, value: v?.value ?? NaN };
  });

  // ---- Studio : passe l'intégralité du dataset au client ----
  const studioDescriptors = listAllSeriesDescriptors();
  const studioRows = loadTauxRaw();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />

      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="text-xs md:text-sm text-slate-500 mb-2">Accueil › Taux BCEAO &amp; UEMOA</div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2">Taux BCEAO &amp; UEMOA</h1>
          <p className="text-sm md:text-base text-slate-600">
            Suivi exhaustif des taux directeurs, marché monétaire et interbancaire, inflation, conditions de banque et change.
            Studio d&apos;analyse interactif pour explorer toutes les séries.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {[
              ["#politique", "Politique BCEAO"],
              ["#marche-monetaire", "Marché monétaire"],
              ["#interbancaire", "Interbancaire"],
              ["#inflation", "Inflation"],
              ["#conditions", "Conditions banque"],
              ["#credits-depots", "Crédits / dépôts"],
              ["#reserves", "Réserves"],
              ["#agregats", "Agrégats"],
              ["#partenaires", "Partenaires"],
              ["#change", "Change"],
              ["#comparateur", "Comparateur pays"],
              ["#studio", "Studio d'analyse"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
        <TauxView
          kpis={kpis}
          pretMarginal={pretMarginal}
          pension={pension}
          bceaoChanges={bceaoChanges}
          tmpHebdo={tmpHebdo}
          tmpMensuel={tmpMensuel}
          encoursRefi={encoursRefi}
          interbancaireTaux={interbancaireTaux}
          interbancaireVolumes={interbancaireVolumes}
          inflationSeries={inflationSeries}
          conditionsCat={conditionsCat}
          conditionsObj={conditionsObj}
          conditionsPeriod={conditionsPeriod}
          credits={credits}
          depots={depots}
          marge={marge}
          volumes={volumes}
          reserves={reserves}
          reservesPeriod={reservesPeriod}
          agregats={agregats}
          partenaires={partenaires}
          changeSpots={changeSpots}
          changeYoy={changeYoy}
          studioDescriptors={studioDescriptors}
          studioRows={studioRows}
          source={getSourceLabel()}
        />
      </main>
    </div>
  );
}

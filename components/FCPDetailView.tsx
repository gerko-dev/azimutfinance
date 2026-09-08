"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Line,
  BarChart,
  Bar,
  ComposedChart,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";

// ==========================================
// TYPES PROPS (alignés sur app/fcp/[slug]/page.tsx)
// ==========================================
/** Origine du point : trimestre publié, VL relevée dans un BOC archivé, ou
 *  VL du dernier bulletin scrapé. */
type ObsKind = "quarter" | "boc" | "latest";
type LatestVL = { date: string; vl: number; kind: ObsKind } | null;

type PerfRow = {
  label: string;
  fromDate: string;
  toDate: string;
  fundValue: number | null;
  cohortValue: number | null;
  excess: number | null;
};

/** VL telle que publiee, en FCFA. Le graphe rebase de l'onglet Performance
 *  repond a « ce fonds fait-il mieux que sa categorie » ; celui-ci repond a
 *  « combien vaut une part, et depuis quand » — une base 100 efface
 *  justement le niveau de la VL. */
type VLPoint = { date: string; vl: number; kind: ObsKind };
type CohortRebasedPoint = { date: string; value: number | null };

/** Reference de marche de la categorie, base 100 a la premiere date de la
 *  serie du fonds. `null` sur un point signale un trou, pas une performance
 *  nulle : la ligne s'interrompt. */
type Benchmark = {
  cle: string;
  label: string;
  note: string;
  serie: Array<{ date: string; value: number | null }>;
};

type QuartileFrame = { date: string; quartile: 1 | 2 | 3 | 4 | null; perf: number | null };

type AumPoint = {
  date: string;
  aum: number;
  vl: number;
  perfQuarter: number | null;
  perfEffectAmount: number | null;
  netFlowAmount: number | null;
};

type ExcessFrame = {
  date: string;
  fundPerf: number | null;
  cohortMedianPerf: number | null;
  excess: number | null;
  cumulativeExcess: number | null;
};

type PeerEntry = {
  id: string;
  nom: string;
  gestionnaire: string;
  aum: number | null;
  ytd: number | null;
  y1: number | null;
};

type ManagerEntry = {
  id: string;
  nom: string;
  categorie: string;
  aum: number | null;
  ytd: number | null;
  y1: number | null;
};

type MarketShareFrame = {
  date: string;
  share: number | null;
  rank: number | null;
  nbInCat: number;
  fundAUM: number | null;
  totalCatAUM: number;
};

type AumGrowth = {
  fromDate: string;
  toDate: string;
  startAUM: number | null;
  endAUM: number | null;
  totalGrowth: number | null;
  perfEffect: number | null;
  netFlow: number | null;
  perfPct: number | null;
  netFlowPct: number | null;
};

type Cadence = {
  kind: "quotidienne" | "hebdomadaire" | "trimestrielle" | "irrégulière";
  publishedQuarters: number;
  expectedQuarters: number;
  regularity: number;
  intraTrim365: number;
  avgGapDays: number | null;
  lastPublicationDate: string;
  daysSinceLast: number | null;
};

type PerteMax = {
  amplitude: number;
  pic: string;
  creux: string;
  recuperee: string | null;
  joursBaisse: number;
  joursRecuperation: number | null;
};

type StatsFenetre = {
  cle: string;
  label: string;
  fromDate: string;
  toDate: string;
  nbPoints: number;
  perfCumulee: number | null;
  perfAnnualisee: number | null;
  volatilite: number | null;
  rendementSurRisque: number | null;
  perteMax: number | null;
  moisPositifs: number | null;
  meilleurMois: number | null;
  pireMois: number | null;
};

type StatsCategorie = {
  nbMois: number;
  correlation: number | null;
  beta: number | null;
  trackingError: number | null;
  ratioInformation: number | null;
};

type StatsRisque = {
  fenetres: StatsFenetre[];
  perteMax: PerteMax | null;
  categorie: StatsCategorie | null;
  mensuels: Array<{ mois: string; perf: number }>;
  histogramme: Array<{ label: string; centre: number; n: number }>;
  pasMedianJours: number | null;
  nbPointsTotal: number;
};

type LigneComparatif = {
  cle: string;
  label: string;
  fromDate: string;
  toDate: string;
  fonds: number | null;
  mediane: number | null;
  reference: number | null;
};

type AnneeComparatif = {
  annee: number;
  fonds: number | null;
  mediane: number | null;
  reference: number | null;
  partielle: boolean;
};

type Comparatif = {
  fenetres: LigneComparatif[];
  annees: AnneeComparatif[];
  mois: Array<{ annee: number; mois: number; perf: number | null }>;
  totauxAnnuels: Array<{ annee: number; perf: number | null }>;
  aReference: boolean;
};

type Rolling = {
  points: Array<{ asOf: string; perf1Y: number | null }>;
  min: number | null;
  median: number | null;
  max: number | null;
};

type Props = {
  fund: {
    id: string;
    nom: string;
    gestionnaire: string;
    type: string;
    categorie: string;
    categorieAtRef: string;
    firstObsDate: string | null;
    /** Snapshot BOC (vides si le fonds n'a pas été matché côté scraper). */
    depositaire: string;
    frequenceCalcul: string;
    bocDate: string;
    bocVL: number | null;
    bocDayChange: number | null;
  };
  refQuarter: string;
  latestVLGlobal: string;
  stalenessCutoff: string;
  aumRef: number | null;
  aumDelta1Y: number | null;
  latestVL: LatestVL;
  ytdQuartile: 1 | 2 | 3 | 4 | null;
  /** Rang du fonds par performance YTD dans sa categorie, et nombre de
   *  fonds classes. Le quartile dit « dans le premier quart », le rang dit
   *  « 12e sur 66 » — pas la meme chose en bord de quartile. */
  ytdRank: number | null;
  ytdRankBase: number;
  cohortSize: number;
  perfTable: PerfRow[];
  cohortRebased: CohortRebasedPoint[];
  /** Historique de VL brut, du premier releve au dernier bulletin. */
  vlSeries: VLPoint[];
  /** null pour les categories sans reference defendable. */
  benchmark: Benchmark | null;
  quartileFrame: QuartileFrame[];
  top2Pct: number | null;
  aumDecomp: AumPoint[];
  excess: ExcessFrame[];
  peerEntries: PeerEntry[];
  managerEntries: ManagerEntry[];
  marketShare: MarketShareFrame[];
  growth1Y: AumGrowth | null;
  growth3Y: AumGrowth | null;
  cadence: Cadence;
  rolling: Rolling;
  stats: StatsRisque;
  comparatif: Comparatif;
};

// ==========================================
// HELPERS DE FORMATAGE
// ==========================================
function fmtBigFCFA(v: number | null): string {
  if (v === null || !Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e12) return (v / 1e12).toFixed(2).replace(".", ",") + " T";
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (v >= 1e6) return (v / 1e6).toFixed(0) + " M";
  return Math.round(v).toLocaleString("fr-FR").replace(/,/g, " ");
}
function fmtSignedFCFA(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const sign = v >= 0 ? "+" : "−";
  const abs = Math.abs(v);
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2).replace(".", ",") + " T";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(0) + " M";
  return sign + Math.round(abs).toLocaleString("fr-FR").replace(/,/g, " ");
}
function fmtPct(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return (sign + (v * 100).toFixed(digits)).replace(".", ",") + "%";
}
function fmtPctRaw(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return (v * 100).toFixed(digits).replace(".", ",") + "%";
}
/** VL a deux decimales, separateur francais. */
function fmtVL(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v
    .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\u202f|\u00a0/g, " ");
}
/** « 03/26 » — assez court pour un axe de graphe. */
function fmtDateShort(iso: string): string {
  if (!iso || iso.length < 7) return iso;
  return `${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}
function fmtDateFR(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
/** Cellule chiffree du comparatif.
 *
 *  `null` s'affiche « — » et non « 0,00 % » : sur un ecart de performance, un
 *  zero se lit « a egalite » alors qu'il veut dire « pas de donnee ». Les
 *  colonnes de reference sont en gris : ce sont des reperes, pas le sujet. */
function Cellule({
  v,
  gras = false,
  neutre = false,
  dernier = false,
}: {
  v: number | null;
  gras?: boolean;
  neutre?: boolean;
  dernier?: boolean;
}) {
  const couleur =
    v === null
      ? "text-slate-300"
      : neutre
        ? "text-slate-600"
        : v >= 0
          ? "text-green-700"
          : "text-red-700";
  return (
    <td
      className={`${dernier ? "px-4" : "px-3"} py-2.5 text-right tabular-nums ${
        gras ? "font-semibold" : "font-medium"
      } ${couleur}`}
    >
      {v === null ? "—" : fmtPct(v, 2)}
    </td>
  );
}

/** Ordinal francais : 1er, puis 2e, 3e... */
function rangFR(n: number): string {
  return `${n}${n === 1 ? "er" : "e"}`;
}
function managerSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** D'ou vient la VL affichee. Les trois origines n'ont pas la meme fraicheur :
 *  un trimestre publie peut dater de plusieurs mois quand le dernier bulletin
 *  date du jour, et le lecteur doit pouvoir faire la difference. */
const ORIGINE: Record<ObsKind, string> = {
  quarter: "trimestre publié",
  boc: "BOC",
  latest: "dernier bulletin",
};

const MOIS_COURTS = [
  "J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D",
];

const QUARTILE_COLORS: Record<number, string> = {
  1: "#15803d",
  2: "#86efac",
  3: "#fbbf24",
  4: "#dc2626",
};
const QUARTILE_LABELS: Record<number, string> = {
  1: "Q1 (top)",
  2: "Q2",
  3: "Q3",
  4: "Q4 (bas)",
};

/** Couleurs des comparateurs du graphe de VL. Distinctes du vert/rouge de la
 *  VL elle-meme, qui code deja la hausse et la baisse. */
const BENCH_COLOR = "#2563eb";
const MEDIANE_COLOR = "#7c3aed";

const CATEGORY_COLORS: Record<string, string> = {
  Obligataire: "#185FA5",
  Monétaire: "#0891b2",
  Diversifié: "#7F77DD",
  Actions: "#0F6E56",
  "Actifs non cotés": "#854F0B",
};

function perfHeatColor(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "#f1f5f9";
  const clamped = Math.max(-0.1, Math.min(0.1, p));
  const t = (clamped + 0.1) / 0.2;
  if (t < 0.5) return interpolate("#dc2626", "#fbbf24", t * 2);
  return interpolate("#fbbf24", "#16a34a", (t - 0.5) * 2);
}
function hexToRgb(h: string) {
  const x = h.replace("#", "");
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
}
function interpolate(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  const m = ra.map((c, i) => Math.round(c + (rb[i] - c) * t));
  return `#${m.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// ==========================================
// COMPONENT
// ==========================================
/** Fenetres du graphe de VL. Sept crans comme sur la fiche action : sous un an
 *  les mouvements d'un fonds obligataire sont si petits qu'une echelle 3A les
 *  aplatit completement. */
type VLPeriod = "1M" | "3M" | "6M" | "1A" | "3A" | "5A" | "Max";
const VL_PERIODS: VLPeriod[] = ["1M", "3M", "6M", "1A", "3A", "5A", "Max"];
const VL_MOIS: Record<VLPeriod, number | null> = {
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1A": 12,
  "3A": 36,
  "5A": 60,
  Max: null,
};

/** Borne inferieure d'une fenetre exprimee en mois ; "" si elle est ouverte. */
function cutoffMois(lastDate: string, mois: number | null): string {
  if (mois === null) return "";
  const ms = new Date(lastDate + "T00:00:00Z").getTime() - mois * 30.4375 * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Onglets de la fiche.
 *
 *  Meme decoupage que les fiches action et obligation : une vue d'ensemble qui
 *  repond aux questions courantes, puis un onglet par angle d'analyse. La fiche
 *  faisait auparavant treize blocs d'affilee dans un seul defilement, ou la
 *  cadence de publication se retrouvait aussi loin du titre que la performance.
 */
type Tab =
  | "overview"
  | "performance"
  | "statistiques"
  | "regularite"
  | "encours"
  | "comparatif"
  | "publication";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "performance", label: "Performance" },
  { id: "statistiques", label: "Statistiques" },
  { id: "regularite", label: "Régularité" },
  { id: "encours", label: "Encours" },
  { id: "comparatif", label: "Comparatif" },
  { id: "publication", label: "Publication" },
];

export default function FCPDetailView(props: Props) {
  const {
    fund,
    refQuarter,
    latestVLGlobal,
    aumRef,
    aumDelta1Y,
    latestVL,
    ytdQuartile,
    ytdRank,
    ytdRankBase,
    cohortSize,
    perfTable,
    cohortRebased,
    vlSeries,
    benchmark,
    quartileFrame,
    top2Pct,
    aumDecomp,
    excess,
    peerEntries,
    managerEntries,
    marketShare,
    growth1Y,
    growth3Y,
    cadence,
    rolling,
    stats,
    comparatif,
  } = props;

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [vlPeriod, setVlPeriod] = useState<VLPeriod>("1A");
  // Comparateurs du graphe de VL. Les activer bascule l'echelle en base 100 :
  // un indice boursier et une VL en FCFA n'ont pas d'axe commun.
  const [showBench, setShowBench] = useState(false);
  const [showMediane, setShowMediane] = useState(false);

  // === Chiffre de tete : VL du dernier bulletin, sinon dernier point connu ===
  const headVL = useMemo(() => {
    if (fund.bocVL !== null && fund.bocDate) {
      return { vl: fund.bocVL, date: fund.bocDate, source: "BOC" };
    }
    if (latestVL) {
      return { vl: latestVL.vl, date: latestVL.date, source: ORIGINE[latestVL.kind] };
    }
    return null;
  }, [fund.bocVL, fund.bocDate, latestVL]);

  const ytdRow = useMemo(() => perfTable.find((r) => r.label === "YTD"), [perfTable]);
  const lastShare = useMemo(
    () => [...marketShare].reverse().find((m) => m.share !== null) ?? null,
    [marketShare]
  );

  // === Evolution de la VL, en FCFA ===
  const vlChartRaw = useMemo(() => {
    if (vlSeries.length === 0) return [];
    const cutoff = cutoffMois(vlSeries[vlSeries.length - 1].date, VL_MOIS[vlPeriod]);
    return vlSeries.filter((p) => !cutoff || p.date >= cutoff);
  }, [vlSeries, vlPeriod]);

  const compare = (showBench && benchmark !== null) || showMediane;

  /** Serie tracee. Sans comparateur, la VL en FCFA. Avec, tout est rebase a 100
   *  au premier point AFFICHE — et non a l'origine du fonds : c'est la fenetre
   *  choisie que le lecteur regarde, la comparaison doit y commencer a egalite. */
  const vlTrace = useMemo(() => {
    if (vlChartRaw.length === 0) return [];
    if (!compare) return vlChartRaw.map((p) => ({ ...p, trace: p.vl }));

    const parDateBench = new Map(benchmark?.serie.map((b) => [b.date, b.value]));
    const parDateMed = new Map(cohortRebased.map((c) => [c.date, c.value]));
    const debut = vlChartRaw[0];
    // Base de chaque serie : sa valeur au premier point affiche. Une serie qui
    // n'y a pas de valeur ne peut pas etre rebasee, donc n'est pas tracee.
    const baseBench = parDateBench.get(debut.date) ?? null;
    const baseMed = parDateMed.get(debut.date) ?? null;
    return vlChartRaw.map((p) => {
      const b = parDateBench.get(p.date) ?? null;
      const m = parDateMed.get(p.date) ?? null;
      return {
        ...p,
        trace: (p.vl / debut.vl) * 100,
        bench: b !== null && baseBench ? (b / baseBench) * 100 : null,
        mediane: m !== null && baseMed ? (m / baseMed) * 100 : null,
      };
    });
  }, [vlChartRaw, compare, benchmark, cohortRebased]);

  /** Variation sur la fenetre affichee : elle donne sa couleur au trace. */
  const vlWindowChange = useMemo(() => {
    if (vlChartRaw.length < 2) return null;
    const a = vlChartRaw[0].vl;
    return a > 0 ? vlChartRaw[vlChartRaw.length - 1].vl / a - 1 : null;
  }, [vlChartRaw]);

  const vlBounds = useMemo(() => {
    if (vlChartRaw.length === 0) return { min: null as number | null, max: null as number | null };
    const vals = vlChartRaw.map((p) => p.vl);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [vlChartRaw]);

  const vlColor = (vlWindowChange ?? 0) >= 0 ? "#16a34a" : "#dc2626";
  /** Reference stable pour « Donnees cles » : celle du graphe suit la fenetre
   *  choisie et changerait sous le curseur. */
  const volatilite1An =
    stats.fenetres.find((f) => f.cle === "y1")?.volatilite ?? null;
  /** Volatilite annualisee sur la fenetre affichee.
   *
   *  Les VL ne tombent pas a pas regulier : un fonds passe de quotidien a
   *  hebdomadaire, un autre ne publie qu'au trimestre. Annualiser par √252
   *  comme pour une action donnerait donc n'importe quoi. On annualise par
   *  l'ecart MEDIAN entre deux relevés, qui resiste aux trous de publication
   *  la ou une moyenne se ferait emporter par un seul intervalle de six mois.
   *  En dessous de vingt points l'estimateur ne veut plus rien dire : on
   *  prefere « NC » a un chiffre que personne ne pourrait interpreter. */
  const vlVolatilite = useMemo(() => {
    if (vlChartRaw.length < 21) return null;
    const rends: number[] = [];
    const ecarts: number[] = [];
    for (let i = 1; i < vlChartRaw.length; i++) {
      const a = vlChartRaw[i - 1];
      const b = vlChartRaw[i];
      if (a.vl <= 0 || b.vl <= 0) continue;
      const jours =
        (new Date(b.date + "T00:00:00Z").getTime() -
          new Date(a.date + "T00:00:00Z").getTime()) /
        86400000;
      if (jours <= 0) continue;
      rends.push(Math.log(b.vl / a.vl));
      ecarts.push(jours);
    }
    if (rends.length < 20) return null;
    const moy = rends.reduce((s, r) => s + r, 0) / rends.length;
    const variance =
      rends.reduce((s, r) => s + (r - moy) ** 2, 0) / (rends.length - 1);
    const tries = [...ecarts].sort((a, b) => a - b);
    const pas = tries[Math.floor(tries.length / 2)];
    if (!(pas > 0)) return null;
    return Math.sqrt(variance) * Math.sqrt(365.25 / pas);
  }, [vlChartRaw]);

  // === AUM decomp : visible quarters & data ===
  const aumDecompData = useMemo(
    () =>
      aumDecomp.slice(-12).map((p) => ({
        date: p.date.slice(0, 7),
        aum: p.aum / 1e9,
        perfEffect: p.perfEffectAmount !== null ? p.perfEffectAmount / 1e9 : null,
        netFlow: p.netFlowAmount !== null ? p.netFlowAmount / 1e9 : null,
      })),
    [aumDecomp]
  );

  // === Excess data : 12 derniers trimestres ===
  const excessData = useMemo(
    () =>
      excess.slice(-12).map((e) => ({
        date: e.date.slice(0, 7),
        excess: e.excess !== null ? e.excess * 100 : null,
        cumulative: e.cumulativeExcess !== null ? e.cumulativeExcess * 100 : null,
      })),
    [excess]
  );

  // === Market share data ===
  const marketShareData = useMemo(
    () =>
      marketShare.filter((m) => m.share !== null).map((m) => ({
        date: m.date.slice(0, 7),
        share: m.share !== null ? m.share * 100 : null,
        rank: m.rank,
      })),
    [marketShare]
  );

  // === Calendrier mensuel : une ligne par annee, douze mois + le total ===
  const calendrierMensuel = useMemo(() => {
    const parAnnee = new Map<number, Array<number | null>>();
    for (const c of comparatif.mois) {
      if (!parAnnee.has(c.annee)) parAnnee.set(c.annee, Array(12).fill(null));
      parAnnee.get(c.annee)![c.mois - 1] = c.perf;
    }
    const totaux = new Map(comparatif.totauxAnnuels.map((t) => [t.annee, t.perf]));
    return [...parAnnee.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([annee, cellules]) => ({
        annee,
        cellules,
        total: totaux.get(annee) ?? null,
      }));
  }, [comparatif]);

  // === Performances calendaires, pour le graphe en barres ===
  const barresAnnuelles = useMemo(
    () =>
      comparatif.annees.map((a) => ({
        annee: a.partielle ? `${a.annee} *` : String(a.annee),
        fonds: a.fonds !== null ? a.fonds * 100 : null,
        mediane: a.mediane !== null ? a.mediane * 100 : null,
        reference: a.reference !== null ? a.reference * 100 : null,
      })),
    [comparatif]
  );

  return (
    <>
      {/* En-tete fiche — meme charpente que les fiches action et obligation :
          identite, chiffre de tete, puis la barre d'onglets. */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-5">
          <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5 flex-wrap">
            <Link href="/" className="hover:text-slate-900">Accueil</Link>
            <span>›</span>
            <Link href="/marches/fcp" className="hover:text-slate-900">FCP / OPCVM</Link>
            <span>›</span>
            <Link
              href={`/sgo/${managerSlug(fund.gestionnaire)}`}
              className="hover:text-slate-900"
            >
              {fund.gestionnaire}
            </Link>
            <span>›</span>
            <span className="text-slate-700 truncate">{fund.nom}</span>
          </div>

          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
            <div className="flex gap-4 items-center">
              <div
                className="w-12 h-12 md:w-14 md:h-14 rounded-lg flex items-center justify-center font-semibold text-sm md:text-base shrink-0"
                style={{
                  background: (CATEGORY_COLORS[fund.categorie] || "#94a3b8") + "1f",
                  color: CATEGORY_COLORS[fund.categorie] || "#475569",
                }}
              >
                {fund.nom.slice(0, 3).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-xl md:text-2xl font-semibold">{fund.nom}</h1>
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded"
                    style={{
                      background: (CATEGORY_COLORS[fund.categorie] || "#94a3b8") + "1f",
                      color: CATEGORY_COLORS[fund.categorie] || "#475569",
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: CATEGORY_COLORS[fund.categorie] || "#94a3b8" }}
                    />
                    {fund.categorie}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                    {fund.type}
                  </span>
                  {ytdQuartile !== null && (
                    <span
                      className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{
                        background: QUARTILE_COLORS[ytdQuartile] + "22",
                        color: QUARTILE_COLORS[ytdQuartile],
                      }}
                    >
                      {QUARTILE_LABELS[ytdQuartile]} YTD
                    </span>
                  )}
                </div>
                <div className="text-xs md:text-sm text-slate-500">
                  <Link
                    href={`/sgo/${managerSlug(fund.gestionnaire)}`}
                    className="hover:underline"
                  >
                    {fund.gestionnaire}
                  </Link>
                  {fund.depositaire && ` · Dépositaire ${fund.depositaire}`}
                </div>
              </div>
            </div>
          </div>

          {/* VL de tete */}
          <div className="flex flex-wrap items-baseline gap-4 md:gap-7 mb-4">
            <div>
              <span className="text-3xl md:text-4xl font-semibold">
                {headVL ? fmtVL(headVL.vl) : "—"}
              </span>
              <span className="text-sm text-slate-500 ml-2">FCFA</span>
            </div>
            {fund.bocDayChange !== null && (
              <div
                className={`font-medium ${
                  fund.bocDayChange >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                <span className="text-base md:text-lg">
                  {fmtPct(fund.bocDayChange, 2)}
                </span>
                <span className="text-sm ml-1 text-slate-500">vs VL précédente</span>
              </div>
            )}
            <div className="text-xs text-slate-400">
              {headVL
                ? `VL du ${fmtDateFR(headVL.date)} · ${headVL.source}`
                : "VL non publiée"}
            </div>
          </div>

          {/* Onglets */}
          <div className="flex gap-0 text-sm overflow-x-auto border-b border-slate-200 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 md:px-4 py-3 whitespace-nowrap border-b-2 transition ${
                  activeTab === tab.id
                    ? "border-blue-700 text-blue-700 font-medium"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>


      <main className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        {activeTab === "overview" && (
          <>
            {/* ============================================ */}
            {/* BLOCK 1 bis : EVOLUTION DE LA VL + DONNEES CLES */}
            {/* ============================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
              <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-medium">Évolution de la VL</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {vlChartRaw.length} points · en FCFA · source BOC / SGO
                    </p>
                  </div>
                  <div className="flex gap-1.5 text-xs flex-wrap">
                    {VL_PERIODS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setVlPeriod(p)}
                        className={`px-2.5 py-1 rounded border ${
                          vlPeriod === p
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Comparateurs */}
                {vlChartRaw.length >= 2 && (benchmark !== null || cohortRebased.length > 0) && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {benchmark !== null && (
                      <button
                        type="button"
                        onClick={() => setShowBench(!showBench)}
                        aria-pressed={showBench}
                        title={benchmark.note}
                        className={`text-xs px-2.5 py-1 rounded-md border transition ${
                          showBench
                            ? "border-blue-300 bg-blue-50 text-blue-800"
                            : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-white"
                        }`}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                          style={{ backgroundColor: showBench ? BENCH_COLOR : "#cbd5e1" }}
                        />
                        {benchmark.label}
                      </button>
                    )}
                    {cohortRebased.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowMediane(!showMediane)}
                        aria-pressed={showMediane}
                        title={`Mediane des ${cohortSize} fonds ${fund.categorie.toLowerCase()}`}
                        className={`text-xs px-2.5 py-1 rounded-md border transition ${
                          showMediane
                            ? "border-violet-300 bg-violet-50 text-violet-800"
                            : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-white"
                        }`}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                          style={{ backgroundColor: showMediane ? MEDIANE_COLOR : "#cbd5e1" }}
                        />
                        Médiane catégorie
                      </button>
                    )}
                    {compare && (
                      <span className="text-[11px] text-slate-400 self-center ml-1">
                        Base 100 au début de la période
                      </span>
                    )}
                  </div>
                )}

                {vlSeries.length === 0 ? (
                  <div className="h-64 md:h-72 flex flex-col items-center justify-center text-center text-slate-500">
                    <div className="text-4xl mb-2">📊</div>
                    <p className="text-sm">Aucune VL relevée pour ce fonds</p>
                  </div>
                ) : vlChartRaw.length < 2 ? (
                  <div className="h-64 md:h-72 flex flex-col items-center justify-center text-center text-slate-500">
                    <p className="text-sm">Pas de données sur la période {vlPeriod}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Historique disponible depuis le {fmtDateFR(vlSeries[0].date)}
                    </p>
                  </div>
                ) : (
                  <div className="h-64 md:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={vlTrace}>
                        <defs>
                          <linearGradient id="vlGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={vlColor} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={vlColor} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          fontSize={11}
                          tickFormatter={(d) => fmtDateShort(String(d))}
                          minTickGap={30}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          fontSize={11}
                          domain={["auto", "auto"]}
                          tickFormatter={(v) =>
                            compare
                              ? Number(v).toFixed(0)
                              : Math.round(Number(v)).toLocaleString("fr-FR").replace(/,/g, " ")
                          }
                          width={compare ? 44 : 62}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "white",
                            border: "1px solid #e2e8f0",
                            borderRadius: "6px",
                            fontSize: "12px",
                          }}
                          formatter={(v, name) => {
                            const x = Number(v);
                            const libelle =
                              name === "bench"
                                ? benchmark?.label ?? "Référence"
                                : name === "mediane"
                                  ? "Médiane catégorie"
                                  : fund.nom;
                            return [
                              compare
                                ? x.toFixed(2).replace(".", ",")
                                : fmtVL(x) + " FCFA",
                              libelle,
                            ];
                          }}
                          labelFormatter={(d) => fmtDateFR(String(d))}
                        />
                        <Area
                          type="monotone"
                          dataKey="trace"
                          stroke={vlColor}
                          strokeWidth={2}
                          fill="url(#vlGradient)"
                        />
                        {showBench && benchmark !== null && (
                          <Line
                            type="monotone"
                            dataKey="bench"
                            stroke={BENCH_COLOR}
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls={false}
                          />
                        )}
                        {showMediane && (
                          <Line
                            type="monotone"
                            dataKey="mediane"
                            stroke={MEDIANE_COLOR}
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                            dot={false}
                            connectNulls={false}
                          />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {showBench && benchmark !== null && (
                  <p className="text-[11px] text-slate-400 mt-1.5">{benchmark.note}</p>
                )}

                {/* Reperes de la fenetre affichee */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-3 pt-3 border-t border-slate-100">
                  <div>
                    <div className="text-xs text-slate-500">Plus haut</div>
                    <div className="text-sm font-medium">{fmtVL(vlBounds.max)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Plus bas</div>
                    <div className="text-sm font-medium">{fmtVL(vlBounds.min)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Var. {vlPeriod}</div>
                    <div
                      className={`text-sm font-medium ${
                        vlWindowChange === null
                          ? "text-slate-400"
                          : vlWindowChange >= 0
                            ? "text-green-600"
                            : "text-red-600"
                      }`}
                    >
                      {fmtPct(vlWindowChange, 2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Volatilité annualisée</div>
                    <div
                      className={`text-sm font-medium ${
                        vlVolatilite === null ? "text-slate-400" : ""
                      }`}
                    >
                      {vlVolatilite === null ? "NC" : fmtPctRaw(vlVolatilite, 2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Carte donnees cles */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-sm font-medium mb-3">Données clés</h3>
                <dl className="space-y-2 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Encours</dt>
                    <dd className="font-medium text-right tabular-nums">
                      {fmtBigFCFA(aumRef)}
                      <span className="block text-[10px] font-normal text-slate-400">
                        {aumDelta1Y !== null
                          ? `${fmtPct(aumDelta1Y)} sur 1 an`
                          : `au ${fmtDateFR(refQuarter)}`}
                      </span>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Performance YTD</dt>
                    <dd
                      className={`font-medium text-right tabular-nums ${
                        ytdRow?.fundValue == null
                          ? "text-slate-400"
                          : ytdRow.fundValue >= 0
                            ? "text-green-700"
                            : "text-red-700"
                      }`}
                    >
                      {fmtPct(ytdRow?.fundValue ?? null, 2)}
                      {ytdQuartile !== null && (
                        <span className="block text-[10px] font-normal text-slate-400">
                          {QUARTILE_LABELS[ytdQuartile]}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Rang par performance</dt>
                    <dd className="font-medium text-right tabular-nums">
                      {ytdRank === null ? (
                        "NC"
                      ) : (
                        <>
                          {rangFR(ytdRank)}
                          <span className="block text-[10px] font-normal text-slate-400">
                            sur {ytdRankBase} {fund.categorie.toLowerCase()} · YTD
                          </span>
                        </>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Rang par encours</dt>
                    <dd className="font-medium text-right tabular-nums">
                      {lastShare?.rank ? (
                        <>
                          {rangFR(lastShare.rank)}
                          <span className="block text-[10px] font-normal text-slate-400">
                            sur {lastShare.nbInCat} · {fmtPctRaw(lastShare.share)} de la
                            catégorie
                          </span>
                        </>
                      ) : (
                        "NC"
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 pt-2 border-t border-slate-100">
                    <dt className="text-slate-500">Société de gestion</dt>
                    <dd className="font-medium text-right">
                      <Link
                        href={`/sgo/${managerSlug(fund.gestionnaire)}`}
                        className="hover:underline text-blue-700"
                      >
                        {fund.gestionnaire}
                      </Link>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Catégorie</dt>
                    <dd className="font-medium text-right">{fund.categorie}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Forme</dt>
                    <dd className="font-medium text-right">{fund.type}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Dépositaire</dt>
                    <dd className="font-medium text-right">{fund.depositaire || "NC"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Fréquence de VL</dt>
                    <dd className="font-medium text-right">
                      {fund.frequenceCalcul || "NC"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 pt-2 border-t border-slate-100">
                    <dt className="text-slate-500">Volatilité 1 an</dt>
                    <dd className="font-medium text-right tabular-nums">
                      {volatilite1An === null ? "NC" : fmtPctRaw(volatilite1An, 2)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Perte maximale</dt>
                    <dd
                      className={`font-medium text-right tabular-nums ${
                        stats.perteMax === null ? "" : "text-red-700"
                      }`}
                      title={
                        stats.perteMax
                          ? `Du ${fmtDateFR(stats.perteMax.pic)} au ${fmtDateFR(stats.perteMax.creux)}`
                          : undefined
                      }
                    >
                      {stats.perteMax === null
                        ? "NC"
                        : fmtPct(stats.perteMax.amplitude, 2)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 pt-2 border-t border-slate-100">
                    <dt className="text-slate-500">VL d&apos;origine</dt>
                    <dd className="font-medium text-right tabular-nums">
                      {vlSeries.length > 0 ? fmtVL(vlSeries[0].vl) : "NC"}
                    </dd>
                  </div>
                  <div
                    className="flex justify-between gap-3"
                    title="Premier relevé connu de nos sources, pas nécessairement la création du fonds"
                  >
                    <dt className="text-slate-500">Première VL</dt>
                    <dd className="font-medium text-right">
                      {vlSeries.length > 0 ? fmtDateFR(vlSeries[0].date) : "NC"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* ============================================ */}
            {/* BLOCK 2 : TABLEAU DE PERFORMANCE */}
            {/* ============================================ */}
            <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-6 pt-5 pb-3">
                <h2 className="text-lg font-semibold text-slate-900">Performance vs catégorie</h2>
                <p className="text-xs text-slate-500">
                  Comparaison à la médiane des {cohortSize} fonds {fund.categorie.toLowerCase()}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-y border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-2 text-xs font-semibold text-slate-600">Fenêtre</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Fonds</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                      Médiane catégorie
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Écart</th>
                    <th className="text-right px-6 py-2 text-xs font-semibold text-slate-600 hidden md:table-cell">
                      Période
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {perfTable.map((r) => (
                    <tr key={r.label} className="border-b border-slate-100 last:border-0">
                      <td className="px-6 py-2.5 font-medium text-slate-700">{r.label}</td>
                      <td
                        className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                          r.fundValue !== null && r.fundValue >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {fmtPct(r.fundValue, 2)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                        {fmtPct(r.cohortValue, 2)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                          r.excess !== null && r.excess >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {fmtPct(r.excess, 2)}
                      </td>
                      <td className="px-6 py-2.5 text-right text-xs text-slate-400 hidden md:table-cell">
                        {r.fromDate ? `${fmtDateFR(r.fromDate)} → ${fmtDateFR(r.toDate)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

          </>
        )}

        {activeTab === "performance" && (
          <>
            {/* ============================================ */}
            {/* COMPARATIF PAR FENETRE */}
            {/* ============================================ */}
            <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-6 pt-5 pb-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Le fonds, sa catégorie, son marché
                </h2>
                <p className="text-xs text-slate-500">
                  Trois réponses par fenêtre : ce que le fonds a fait, ce qu&apos;ont
                  fait ses concurrents, et ce qu&apos;aurait rapporté le marché
                  {comparatif.aReference && benchmark ? ` (${benchmark.label})` : ""}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-y border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-2 text-xs font-semibold text-slate-600">
                        Fenêtre
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                        Fonds
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                        Médiane catégorie
                      </th>
                      {comparatif.aReference && (
                        <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                          Marché
                        </th>
                      )}
                      <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                        vs catégorie
                      </th>
                      {comparatif.aReference && (
                        <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600">
                          vs marché
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {comparatif.fenetres.map((f) => (
                      <tr key={f.cle} className="hover:bg-slate-50">
                        <td className="px-6 py-2.5">
                          <span className="text-slate-800">{f.label}</span>
                          <span className="block text-[11px] text-slate-400">
                            {fmtDateFR(f.fromDate)} → {fmtDateFR(f.toDate)}
                          </span>
                        </td>
                        <Cellule v={f.fonds} gras />
                        <Cellule v={f.mediane} neutre />
                        {comparatif.aReference && <Cellule v={f.reference} neutre />}
                        <Cellule
                          v={f.fonds !== null && f.mediane !== null ? f.fonds - f.mediane : null}
                        />
                        {comparatif.aReference && (
                          <Cellule
                            v={
                              f.fonds !== null && f.reference !== null
                                ? f.fonds - f.reference
                                : null
                            }
                            dernier
                          />
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ============================================ */}
            {/* PERFORMANCES CALENDAIRES */}
            {/* ============================================ */}
            {barresAnnuelles.length > 0 && (
              <section className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="mb-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Performances année par année
                  </h2>
                  <p className="text-xs text-slate-500">
                    Une bonne année ne fait pas un bon fonds — c&apos;est la
                    répétition qui compte. Un astérisque marque un exercice
                    incomplet.
                  </p>
                </div>
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barresAnnuelles}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="annee" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        tickFormatter={(v) => `${v}%`}
                        width={44}
                      />
                      <Tooltip
                        formatter={(v, n) => [
                          Number(v).toFixed(2).replace(".", ",") + " %",
                          n === "fonds"
                            ? fund.nom
                            : n === "mediane"
                              ? "Médiane catégorie"
                              : benchmark?.label ?? "Marché",
                        ]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(v) =>
                          v === "fonds"
                            ? fund.nom
                            : v === "mediane"
                              ? "Médiane catégorie"
                              : benchmark?.label ?? "Marché"
                        }
                      />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Bar dataKey="fonds" fill="#185FA5" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="mediane" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                      {comparatif.aReference && (
                        <Bar dataKey="reference" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* ============================================ */}
            {/* CALENDRIER MENSUEL */}
            {/* ============================================ */}
            {calendrierMensuel.length > 0 && (
              <section className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="mb-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Calendrier mensuel
                  </h2>
                  <p className="text-xs text-slate-500">
                    Performance de chaque mois. Une case grise signale un mois sans
                    relevé exploitable, pas un mois à zéro.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left font-semibold text-slate-600 px-2 py-1.5"></th>
                        {MOIS_COURTS.map((m, i) => (
                          <th
                            key={i}
                            className="text-center font-semibold text-slate-500 px-1 py-1.5 w-[7%]"
                          >
                            {m}
                          </th>
                        ))}
                        <th className="text-right font-semibold text-slate-600 px-2 py-1.5">
                          Année
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {calendrierMensuel.map((ligne) => (
                        <tr key={ligne.annee}>
                          <td className="font-bold text-slate-700 px-2 py-1.5">
                            {ligne.annee}
                          </td>
                          {ligne.cellules.map((c, i) => (
                            <td
                              key={i}
                              className="px-0.5 py-1.5 text-center tabular-nums"
                              style={{
                                background: c === null ? "#f8fafc" : perfHeatColor(c),
                                color: c === null ? "#cbd5e1" : "#0f172a",
                              }}
                              title={c === null ? "Pas de relevé exploitable" : undefined}
                            >
                              {c === null ? "·" : (c * 100).toFixed(1).replace(".", ",")}
                            </td>
                          ))}
                          <td
                            className={`px-2 py-1.5 text-right font-semibold tabular-nums ${
                              ligne.total === null
                                ? "text-slate-300"
                                : ligne.total >= 0
                                  ? "text-green-700"
                                  : "text-red-700"
                            }`}
                          >
                            {ligne.total === null ? "—" : fmtPct(ligne.total, 1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ============================================ */}
            {/* EXCES TRIMESTRIEL VS MEDIANE */}
            {/* ============================================ */}
            <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-900">
                Excès trimestriel vs médiane catégorie
              </h2>
              <p className="text-xs text-slate-500">
                Barre = perf trim − perf médiane cat · ligne = excès cumulé composé
              </p>
            </div>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <ComposedChart data={excessData}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="bar"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v + "%"}
                    width={50}
                  />
                  <YAxis
                    yAxisId="line"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v + "%"}
                    width={50}
                  />
                  <Tooltip formatter={(v) => Number(v).toFixed(2) + "%"} />
                  <ReferenceLine y={0} yAxisId="bar" stroke="#94a3b8" />
                  <Bar
                    yAxisId="bar"
                    dataKey="excess"
                    name="Excès trimestriel"
                    fill="#185FA5"
                  />
                  <Line
                    yAxisId="line"
                    type="monotone"
                    dataKey="cumulative"
                    name="Excès cumulé"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            </section>

          </>
        )}
        {activeTab === "statistiques" && (
          <>
            {stats.fenetres.length === 0 ? (
              <section className="bg-white border border-slate-200 rounded-lg p-8 text-center">
                <p className="text-sm text-slate-600">
                  Statistiques indisponibles pour ce fonds.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {stats.nbPointsTotal} VL relevées — il en faut une vingtaine sur
                  la fenêtre pour qu&apos;un écart-type veuille dire quelque chose.
                </p>
              </section>
            ) : (
              <>
                {/* Tableau risque / rendement */}
                <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-6 pt-5 pb-3">
                    <h2 className="text-lg font-semibold text-slate-900">
                      Risque et rendement
                    </h2>
                    <p className="text-xs text-slate-500">
                      Calculé sur les VL publiées
                      {stats.pasMedianJours !== null && (
                        <>
                          {" "}
                          · un relevé tous les{" "}
                          {stats.pasMedianJours < 1.5
                            ? "jours"
                            : `${Math.round(stats.pasMedianJours)} jours`}{" "}
                          en médiane
                        </>
                      )}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-y border-slate-200">
                        <tr>
                          <th className="text-left px-6 py-2 text-xs font-semibold text-slate-600">
                            Mesure
                          </th>
                          {stats.fenetres.map((f) => (
                            <th
                              key={f.cle}
                              className="text-right px-4 py-2 text-xs font-semibold text-slate-600 whitespace-nowrap"
                            >
                              {f.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <StatRow
                          label="Performance cumulée"
                          cells={stats.fenetres.map((f) => f.perfCumulee)}
                          render={(v) => fmtPct(v, 2)}
                          colore
                        />
                        <StatRow
                          label="Performance annualisée"
                          cells={stats.fenetres.map((f) => f.perfAnnualisee)}
                          render={(v) => fmtPct(v, 2)}
                          colore
                        />
                        <StatRow
                          label="Volatilité annualisée"
                          cells={stats.fenetres.map((f) => f.volatilite)}
                          render={(v) => fmtPctRaw(v, 2)}
                        />
                        <StatRow
                          label="Rendement / volatilité"
                          cells={stats.fenetres.map((f) => f.rendementSurRisque)}
                          render={(v) => v.toFixed(2).replace(".", ",")}
                        />
                        <StatRow
                          label="Perte maximale"
                          cells={stats.fenetres.map((f) => f.perteMax)}
                          render={(v) => fmtPct(v, 2)}
                          colore
                        />
                        <StatRow
                          label="Mois positifs"
                          cells={stats.fenetres.map((f) => f.moisPositifs)}
                          render={(v) => fmtPctRaw(v, 0)}
                        />
                        <StatRow
                          label="Meilleur mois"
                          cells={stats.fenetres.map((f) => f.meilleurMois)}
                          render={(v) => fmtPct(v, 2)}
                          colore
                        />
                        <StatRow
                          label="Pire mois"
                          cells={stats.fenetres.map((f) => f.pireMois)}
                          render={(v) => fmtPct(v, 2)}
                          colore
                        />
                        <tr>
                          <td className="px-6 py-2.5 text-slate-500 text-xs">
                            Relevés dans la fenêtre
                          </td>
                          {stats.fenetres.map((f) => (
                            <td
                              key={f.cle}
                              className="px-4 py-2.5 text-right text-xs text-slate-400 tabular-nums"
                            >
                              {f.nbPoints}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="px-6 py-3 text-[11px] text-slate-400 border-t border-slate-100">
                    « Rendement / volatilité » n&apos;est pas un ratio de Sharpe : il
                    ne retranche aucun taux sans risque, faute d&apos;une référence
                    UEMOA publiée à la fréquence qu&apos;il faudrait. Une case vide
                    signifie que la fenêtre ne porte pas assez de relevés — jamais
                    que le risque est nul.
                  </p>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  {/* Perte maximale */}
                  <section className="bg-white border border-slate-200 rounded-lg p-5">
                    <div className="mb-3">
                      <h2 className="text-lg font-semibold text-slate-900">
                        Plus forte baisse
                      </h2>
                      <p className="text-xs text-slate-500">
                        De sommet à creux, sur tout l&apos;historique
                      </p>
                    </div>
                    {stats.perteMax === null ? (
                      <p className="text-sm text-slate-400 py-6 text-center">
                        Historique trop court pour la mesurer.
                      </p>
                    ) : (
                      <dl className="space-y-3 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-500">Amplitude</dt>
                          <dd className="font-semibold text-red-700 tabular-nums">
                            {fmtPct(stats.perteMax.amplitude, 2)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-500">Sommet</dt>
                          <dd className="font-medium">{fmtDateFR(stats.perteMax.pic)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-500">Creux</dt>
                          <dd className="font-medium">
                            {fmtDateFR(stats.perteMax.creux)} · {stats.perteMax.joursBaisse} j
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3 pt-3 border-t border-slate-100">
                          <dt className="text-slate-500">Retour au sommet</dt>
                          <dd className="font-medium text-right">
                            {stats.perteMax.recuperee ? (
                              <>
                                {fmtDateFR(stats.perteMax.recuperee)}
                                <span className="text-slate-400">
                                  {" "}
                                  · {stats.perteMax.joursRecuperation} j
                                </span>
                              </>
                            ) : (
                              <span className="text-amber-700">Pas encore</span>
                            )}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </section>

                  {/* Face a la categorie */}
                  <section className="bg-white border border-slate-200 rounded-lg p-5">
                    <div className="mb-3">
                      <h2 className="text-lg font-semibold text-slate-900">
                        Face à la catégorie
                      </h2>
                      <p className="text-xs text-slate-500">
                        Contre la médiane {fund.categorie.toLowerCase()}, en mensuel
                        {stats.categorie && <> · {stats.categorie.nbMois} mois</>}
                      </p>
                    </div>
                    {stats.categorie === null ? (
                      <p className="text-sm text-slate-400 py-6 text-center">
                        Moins de douze mois communs avec la catégorie.
                      </p>
                    ) : (
                      <dl className="space-y-3 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-500">Corrélation</dt>
                          <dd className="font-medium tabular-nums">
                            {stats.categorie.correlation === null
                              ? "NC"
                              : stats.categorie.correlation.toFixed(2).replace(".", ",")}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-500">Bêta</dt>
                          <dd className="font-medium tabular-nums">
                            {stats.categorie.beta === null
                              ? "NC"
                              : stats.categorie.beta.toFixed(2).replace(".", ",")}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-500">Tracking error</dt>
                          <dd className="font-medium tabular-nums">
                            {fmtPctRaw(stats.categorie.trackingError, 2)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3 pt-3 border-t border-slate-100">
                          <dt className="text-slate-500">Ratio d&apos;information</dt>
                          <dd
                            className={`font-semibold tabular-nums ${
                              stats.categorie.ratioInformation === null
                                ? "text-slate-400"
                                : stats.categorie.ratioInformation >= 0
                                  ? "text-green-700"
                                  : "text-red-700"
                            }`}
                          >
                            {stats.categorie.ratioInformation === null
                              ? "NC"
                              : stats.categorie.ratioInformation
                                  .toFixed(2)
                                  .replace(".", ",")}
                          </dd>
                        </div>
                      </dl>
                    )}
                    <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100">
                      Le bêta se lit contre la médiane de la catégorie, pas contre un
                      indice de marché : un bêta de 1 dit que le fonds bouge comme ses
                      concurrents, pas comme la BRVM.
                    </p>
                  </section>
                </div>

                {/* Distribution des rendements mensuels */}
                {stats.histogramme.length > 0 && (
                  <section className="bg-white border border-slate-200 rounded-lg p-5">
                    <div className="mb-3">
                      <h2 className="text-lg font-semibold text-slate-900">
                        Distribution des rendements mensuels
                      </h2>
                      <p className="text-xs text-slate-500">
                        {stats.mensuels.length} mois observés, de{" "}
                        {stats.mensuels[0]?.mois} à{" "}
                        {stats.mensuels[stats.mensuels.length - 1]?.mois}
                      </p>
                    </div>
                    <div style={{ width: "100%", height: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.histogramme}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: "#94a3b8" }}
                            interval={0}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: "#94a3b8" }}
                            allowDecimals={false}
                            width={30}
                          />
                          <Tooltip
                            formatter={(v) => [`${v} mois`, "Effectif"]}
                            labelFormatter={(l) => `À partir de ${l}`}
                            contentStyle={{ fontSize: 12 }}
                          />
                          <Bar dataKey="n" radius={[3, 3, 0, 0]}>
                            {stats.histogramme.map((h, i) => (
                              <Cell key={i} fill={h.centre >= 0 ? "#16a34a" : "#dc2626"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}

        {activeTab === "regularite" && (
          <>
            {/* ============================================ */}
            {/* BLOCK 4 + 13 : QUARTILES + ROLLING 1Y */}
            {/* ============================================ */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Frise quartiles */}
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="mb-3">
                  <h2 className="text-lg font-semibold text-slate-900">Régularité — quartiles</h2>
                  <p className="text-xs text-slate-500">
                    Quartile dans la catégorie sur chaque trimestre (Q1 = top, Q4 = bas)
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {quartileFrame.map((q) => (
                    <div
                      key={q.date}
                      title={`${q.date} · ${q.quartile ? `Q${q.quartile}` : "—"} · perf ${fmtPct(
                        q.perf
                      )}`}
                      className="w-7 h-10 rounded flex flex-col items-center justify-center text-[9px] font-bold text-white"
                      style={{
                        background: q.quartile ? QUARTILE_COLORS[q.quartile] : "#e2e8f0",
                        color: q.quartile ? "#fff" : "#94a3b8",
                      }}
                    >
                      <span>{q.quartile ? `Q${q.quartile}` : "—"}</span>
                      <span className="text-[8px] opacity-80">{q.date.slice(2, 7)}</span>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-slate-600">
                  <strong>{fmtPct(top2Pct, 0)}</strong> des trimestres en Q1+Q2 · {quartileFrame.filter((q) => q.quartile !== null).length} trimestres évalués
                </div>
              </div>

              {/* Rolling 1Y */}
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="mb-3">
                  <h2 className="text-lg font-semibold text-slate-900">Performances 1 an glissantes</h2>
                  <p className="text-xs text-slate-500">
                    Évite l&apos;effet « année calendaire » — fenêtre 1A à chaque fin de trimestre
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <Stat label="Min" value={fmtPct(rolling.min, 1)} tone={rolling.min !== null && rolling.min < 0 ? "rose" : "neutral"} />
                  <Stat label="Médiane" value={fmtPct(rolling.median, 1)} tone="neutral" />
                  <Stat label="Max" value={fmtPct(rolling.max, 1)} tone={rolling.max !== null && rolling.max >= 0 ? "emerald" : "neutral"} />
                </div>
                <div style={{ width: "100%", height: 140 }}>
                  <ResponsiveContainer>
                    <BarChart data={rolling.points.map((p) => ({ date: p.asOf.slice(0, 7), perf: p.perf1Y !== null ? p.perf1Y * 100 : null }))}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v + "%"} width={40} />
                      <Tooltip formatter={(v) => Number(v).toFixed(2) + "%"} />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Bar dataKey="perf" fill="#185FA5" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

          </>
        )}

        {activeTab === "encours" && (
          <>
            {/* ============================================ */}
            {/* BLOCK 5 + 11 : DECOMPOSITION AUM + CROISSANCE */}
            {/* ============================================ */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
                <div className="mb-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Dynamique d&apos;encours — perf vs collecte
                  </h2>
                  <p className="text-xs text-slate-500">
                    Décomposition trimestrielle ΔAUM = effet performance + collecte nette implicite
                  </p>
                </div>
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={aumDecompData}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis
                        yAxisId="aum"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => v.toFixed(0) + " Mds"}
                        width={70}
                      />
                      <YAxis
                        yAxisId="flow"
                        orientation="right"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => v.toFixed(1) + " Mds"}
                        width={60}
                      />
                      <Tooltip
                        formatter={(v, name) => {
                          const num = Number(v);
                          if (name === "aum") return [num.toFixed(2) + " Mds", "AUM"];
                          if (name === "perfEffect") return [num.toFixed(2) + " Mds", "Effet perf"];
                          if (name === "netFlow") return [num.toFixed(2) + " Mds", "Collecte nette"];
                          return [num.toFixed(2), String(name)];
                        }}
                      />
                      <ReferenceLine yAxisId="flow" y={0} stroke="#94a3b8" />
                      <Bar yAxisId="flow" dataKey="netFlow" fill="#0F6E56" name="Collecte nette" />
                      <Bar yAxisId="flow" dataKey="perfEffect" fill="#94a3b8" name="Effet perf" />
                      <Line
                        yAxisId="aum"
                        type="monotone"
                        dataKey="aum"
                        stroke="#185FA5"
                        strokeWidth={2}
                        name="AUM"
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Croissance décomposée</h3>
                  <p className="text-xs text-slate-500">
                    D&apos;où vient la variation d&apos;encours ?
                  </p>
                </div>
                <GrowthBlock title="Sur 1 an" g={growth1Y} />
                <GrowthBlock title="Sur 3 ans" g={growth3Y} />
              </div>
            </section>

            {/* Market share */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="mb-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Part de marché dans la catégorie
                </h2>
                <p className="text-xs text-slate-500">
                  {marketShareData.length > 0 && marketShareData[marketShareData.length - 1].rank !== null
                    ? `Rang ${marketShareData[marketShareData.length - 1].rank} sur ${
                        marketShare[marketShare.length - 1]?.nbInCat ?? "—"
                      } fonds dans la catégorie`
                    : "Évolution de la part de marché"}
                </p>
              </div>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <ComposedChart data={marketShareData}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => v.toFixed(1) + "%"}
                      width={50}
                    />
                    <Tooltip formatter={(v) => Number(v).toFixed(2) + "%"} />
                    <Area
                      type="monotone"
                      dataKey="share"
                      stroke="#185FA5"
                      fill="#185FA5"
                      fillOpacity={0.25}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

          </>
        )}

        {activeTab === "comparatif" && (
          <>
            {/* ============================================ */}
            {/* BLOCK 7 + 8 : PEER GROUP + AUTRES FONDS GESTIONNAIRE */}
            {/* ============================================ */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <PeerTable
                title="Concurrents directs (catégorie)"
                subtitle={`Top 10 ${fund.categorie.toLowerCase()} par AUM`}
                rows={peerEntries.map((e) => ({
                  id: e.id,
                  nom: e.nom,
                  sub: e.gestionnaire,
                  aum: e.aum,
                  ytd: e.ytd,
                  y1: e.y1,
                }))}
              />
              <PeerTable
                title={
                  <>
                    Autres fonds{" "}
                    <Link
                      href={`/sgo/${managerSlug(fund.gestionnaire)}`}
                      className="hover:underline text-blue-700"
                    >
                      {fund.gestionnaire}
                    </Link>
                  </>
                }
                subtitle={`${managerEntries.length} fonds gérés par la même SGO`}
                rows={managerEntries.map((e) => ({
                  id: e.id,
                  nom: e.nom,
                  sub: e.categorie,
                  aum: e.aum,
                  ytd: e.ytd,
                  y1: e.y1,
                }))}
              />
            </section>

          </>
        )}

        {activeTab === "publication" && (
          <>
            {/* ============================================ */}
            {/* BLOCK 12 : CADENCE DE PUBLICATION */}
            {/* ============================================ */}
            <section className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-baseline justify-between flex-wrap gap-3 mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Qualité de publication</h2>
                  <p className="text-xs text-slate-500">
                    Cadence et régularité de publication des VL par la SGO
                  </p>
                </div>
                <span
                  className="px-3 py-1.5 text-xs font-bold rounded-md uppercase tracking-wider"
                  style={{
                    background:
                      cadence.kind === "quotidienne"
                        ? "#15803d22"
                        : cadence.kind === "hebdomadaire"
                        ? "#0F6E5622"
                        : cadence.kind === "trimestrielle"
                        ? "#185FA522"
                        : "#dc262622",
                    color:
                      cadence.kind === "quotidienne"
                        ? "#15803d"
                        : cadence.kind === "hebdomadaire"
                        ? "#0F6E56"
                        : cadence.kind === "trimestrielle"
                        ? "#185FA5"
                        : "#dc2626",
                  }}
                >
                  Cadence {cadence.kind}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat
                  label="Trimestres publiés"
                  value={`${cadence.publishedQuarters} / ${cadence.expectedQuarters}`}
                  sub={`régularité ${fmtPctRaw(cadence.regularity, 0)}`}
                  tone="neutral"
                />
                <Stat
                  label="Points 365 j"
                  value={String(cadence.intraTrim365)}
                  sub="VL intra-trimestre"
                  tone="neutral"
                />
                <Stat
                  label="Gap moyen"
                  value={cadence.avgGapDays !== null ? Math.round(cadence.avgGapDays) + " j" : "—"}
                  sub="entre publications"
                  tone="neutral"
                />
                <Stat
                  label="Délai depuis dernière VL"
                  value={cadence.daysSinceLast !== null ? Math.round(cadence.daysSinceLast) + " j" : "—"}
                  sub={`au ${fmtDateFR(latestVLGlobal)}`}
                  tone={
                    cadence.daysSinceLast !== null && cadence.daysSinceLast > 15 ? "rose" : "emerald"
                  }
                />
              </div>
            </section>

          </>
        )}

        <p className="text-xs text-slate-400">
          Source : <span className="font-medium text-slate-600">BRVM</span>.
        </p>
      </main>
    </>
  );
}

// ==========================================
// SOUS-COMPOSANTS
// ==========================================
/** Une ligne du tableau de statistiques.
 *
 *  `null` s'affiche « NC » et non « 0 % » : sur une mesure de risque, un zero
 *  se lit comme « aucun risque » alors qu'il veut dire « pas assez de
 *  releves ». */
function StatRow({
  label,
  cells,
  render,
  colore = false,
}: {
  label: string;
  cells: Array<number | null>;
  render: (v: number) => string;
  colore?: boolean;
}) {
  return (
    <tr>
      <td className="px-6 py-2.5 text-slate-700">{label}</td>
      {cells.map((v, i) => (
        <td
          key={i}
          className={`px-4 py-2.5 text-right tabular-nums font-medium ${
            v === null
              ? "text-slate-300"
              : colore
                ? v >= 0
                  ? "text-green-700"
                  : "text-red-700"
                : "text-slate-900"
          }`}
        >
          {v === null ? "NC" : render(v)}
        </td>
      ))}
    </tr>
  );
}


function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "emerald" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "rose"
      ? "text-rose-700"
      : "text-slate-900";
  return (
    <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${toneClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function GrowthBlock({ title, g }: { title: string; g: AumGrowth | null }) {
  if (!g || g.startAUM === null || g.endAUM === null) {
    return (
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-1">{title}</div>
        <p className="text-xs text-slate-400">Historique insuffisant.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs font-semibold text-slate-600 mb-1">{title}</div>
      <div className="text-sm text-slate-700">
        AUM <strong>{fmtBigFCFA(g.startAUM)}</strong> → <strong>{fmtBigFCFA(g.endAUM)}</strong>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Variation totale</span>
          <span className="font-semibold text-slate-900">{fmtSignedFCFA(g.totalGrowth)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">dont effet performance</span>
          <span className="font-medium text-slate-700">
            {fmtSignedFCFA(g.perfEffect)} ({fmtPct(g.perfPct)})
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">dont collecte nette</span>
          <span
            className={`font-medium ${
              g.netFlow !== null && g.netFlow >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {fmtSignedFCFA(g.netFlow)} ({fmtPct(g.netFlowPct)})
          </span>
        </div>
      </div>
    </div>
  );
}

type PeerRow = {
  id: string;
  nom: string;
  sub: string;
  aum: number | null;
  ytd: number | null;
  y1: number | null;
};

function PeerTable({
  title,
  subtitle,
  rows,
}: {
  title: React.ReactNode;
  subtitle: string;
  rows: PeerRow[];
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-xs text-slate-400">Aucun fonds.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-200">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Fonds</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">AUM</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">YTD</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600">1 an</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2 min-w-0">
                  <Link href={`/fcp/${r.id}`} className="text-sm font-medium text-slate-900 hover:underline truncate block">
                    {r.nom}
                  </Link>
                  <div className="text-[11px] text-slate-500 truncate">{r.sub}</div>
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                  {fmtBigFCFA(r.aum)}
                </td>
                <td
                  className={`px-3 py-2 text-right text-xs tabular-nums font-medium ${
                    r.ytd !== null && r.ytd >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {fmtPct(r.ytd, 1)}
                </td>
                <td
                  className={`px-4 py-2 text-right text-xs tabular-nums font-medium ${
                    r.y1 !== null && r.y1 >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {fmtPct(r.y1, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

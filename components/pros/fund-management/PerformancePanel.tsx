"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NavPoint } from "@/app/pros/fund-management/nav-types";
import {
  computeBenchmarkAction,
  type BenchmarkResult,
} from "@/app/pros/fund-management/benchmark-actions";
import {
  computeAnalysisBundleAction,
  type AttributionRow,
  type AllocationRow,
  type OpcvmHoldingRow,
  type DatHoldingRow,
  type RebalanceRow,
} from "@/app/pros/fund-management/attribution-actions";
import { importBalanceAction } from "@/app/pros/fund-management/balance-actions";
import {
  loadAnalysisSettings,
  saveAnalysisSettings,
  type AnalysisSettings,
} from "@/app/pros/fund-management/analysis-settings";
import {
  computeSectorAllocationAction,
  computeTopFlopStocksAction,
  computeTopFlopBondsAction,
  computeSectorRebalancingAction,
  type SectorRow,
  type TopStockRow,
  type BondRow,
  type SectorRebalanceRow,
} from "@/app/pros/fund-management/sector-actions";

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function pct(n: number | null | undefined, d = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${fmt(n, d)} %`;
}
function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

type VLPoint = NavPoint & { vl: number };

const inputCls =
  "px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500";

// Tableau de rééquilibrage : allocation validée saisie → valeur cible + TRO.
function RebalancingTable({
  rows,
  totalPrecedente,
  totalActuelle,
  datePrecedente,
  dateActuelle,
  valide,
  onChangeValide,
  title = "Rééquilibrage — allocation cible & TRO",
}: {
  rows: RebalanceRow[];
  totalPrecedente: number;
  totalActuelle: number;
  datePrecedente: string | null;
  dateActuelle: string;
  valide: Record<string, string>; // allocation validée saisie, par ligne (%)
  onChangeValide: (classe: string, value: string) => void;
  title?: string;
}) {
  const num = (s: string) => parseFloat((s ?? "").replace(",", ".")) || 0;
  // Valeur affichée : saisie persistée, à défaut l'allocation actuelle.
  const valOf = (i: number) =>
    valide[rows[i].classe] ??
    (totalActuelle > 0 ? ((rows[i].valeurActuelle / totalActuelle) * 100).toFixed(2) : "0");
  const cible = (i: number) => (num(valOf(i)) / 100) * totalActuelle;
  const tro = (i: number): number | null => {
    const prec = rows[i].valeurPrecedente;
    const denom = cible(i) - prec;
    if (denom === 0) return null;
    return ((rows[i].valeurActuelle - prec) / denom) * 100;
  };
  const troList = rows.map((_, i) => tro(i)).filter((x): x is number => x != null);
  const troTotal = troList.length ? troList.reduce((s, x) => s + x, 0) / troList.length : null;
  const totalValide = rows.reduce((s, _, i) => s + num(valOf(i)), 0);
  const totalCible = rows.reduce((s, _, i) => s + cible(i), 0);
  const alloc = (v: number, t: number) => (t > 0 ? (v / t) * 100 : 0);

  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
      <div className="px-3 py-2 border-b border-slate-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-slate-500 border-b border-slate-700 bg-slate-900/60">
            <th className="px-2 py-2 text-left font-medium">Actifs</th>
            <th className="px-2 py-2 text-right font-medium">Valeur précédente</th>
            <th className="px-2 py-2 text-right font-medium">Alloc. précédente</th>
            <th className="px-2 py-2 text-right font-medium">Valeur actuelle</th>
            <th className="px-2 py-2 text-right font-medium">Alloc. actuelle</th>
            <th className="px-2 py-2 text-right font-medium">Alloc. validée</th>
            <th className="px-2 py-2 text-right font-medium">Valeur cible</th>
            <th className="px-2 py-2 text-right font-medium">TRO</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const t = tro(i);
            return (
              <tr key={r.classe} className="border-b border-slate-800/60">
                <td className="px-2 py-2 text-left text-slate-300">{r.classe}</td>
                <td className="px-2 py-2 text-right font-mono text-slate-300">
                  {fmt(r.valeurPrecedente, 0)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-slate-400">
                  {fmt(alloc(r.valeurPrecedente, totalPrecedente))} %
                </td>
                <td className="px-2 py-2 text-right font-mono text-slate-200">
                  {fmt(r.valeurActuelle, 0)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-slate-400">
                  {fmt(alloc(r.valeurActuelle, totalActuelle))} %
                </td>
                <td className="px-2 py-2 text-right">
                  <span className="inline-flex items-center gap-1">
                    <input
                      className={`${inputCls} w-16 text-right`}
                      value={valOf(i)}
                      onChange={(e) => onChangeValide(r.classe, e.target.value)}
                    />
                    <span className="text-slate-500">%</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(cible(i), 0)}</td>
                <td
                  className={`px-2 py-2 text-right font-mono ${
                    t == null ? "text-slate-500" : t >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {t == null ? "—" : `${fmt(t)} %`}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-slate-700 bg-slate-900/40 font-semibold">
            <td className="px-2 py-2 text-left text-slate-200">TOTAL</td>
            <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(totalPrecedente, 0)}</td>
            <td className="px-2 py-2 text-right font-mono text-slate-400">100,00 %</td>
            <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(totalActuelle, 0)}</td>
            <td className="px-2 py-2 text-right font-mono text-slate-400">100,00 %</td>
            <td className="px-2 py-2 text-right font-mono text-slate-300">{fmt(totalValide)} %</td>
            <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(totalCible, 0)}</td>
            <td
              className={`px-2 py-2 text-right font-mono ${
                troTotal == null ? "text-slate-500" : troTotal >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {troTotal == null ? "—" : `${fmt(troTotal)} %`}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-slate-600">
        Valeur précédente = inventaire {datePrecedente ?? "précédent"} ; valeur actuelle = inventaire{" "}
        {dateActuelle}. Allocation validée (à saisir) : cible stratégique par classe. Valeur cible =
        allocation validée × total actuel. TRO = (valeur actuelle − valeur précédente) / (valeur
        cible − valeur précédente) ; TOTAL = moyenne des TRO.
      </p>
    </section>
  );
}

// Proposition d'allocation d'actif : allocation proposée (partagée avec le
// rééquilibrage) → valeur cible + montant à réaliser (+Achat / −Vente).
function AllocationProposalTable({
  rows,
  totalActuelle,
  valide,
  onChangeValide,
  title = "Proposition d'allocation d'actif",
  firstCol = "Classes d'actifs",
}: {
  rows: RebalanceRow[];
  totalActuelle: number;
  valide: Record<string, string>;
  onChangeValide: (classe: string, value: string) => void;
  title?: string;
  firstCol?: string;
}) {
  if (rows.length === 0) return null;
  // Libellés réglementaires propres à ce tableau (clés internes inchangées).
  const PROPOSAL_LABELS: Record<string, string> = {
    DAT: "DAT et Investissements Cash",
    Liquidité: "Liquidités",
  };
  const num = (s: string) => parseFloat((s ?? "").replace(",", ".")) || 0;
  const valOf = (r: RebalanceRow) =>
    valide[r.classe] ??
    (totalActuelle > 0 ? ((r.valeurActuelle / totalActuelle) * 100).toFixed(2) : "0");
  const cible = (r: RebalanceRow) => (num(valOf(r)) / 100) * totalActuelle;
  const totalValide = rows.reduce((s, r) => s + num(valOf(r)), 0);
  const totalCible = rows.reduce((s, r) => s + cible(r), 0);
  const totalMontant = rows.reduce((s, r) => s + (cible(r) - r.valeurActuelle), 0);

  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
      <div className="px-3 py-2 border-b border-slate-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-slate-500 border-b border-slate-700 bg-slate-900/60">
            <th className="px-2 py-2 text-left font-medium">{firstCol}</th>
            <th className="px-2 py-2 text-right font-medium">Valeur actuelle</th>
            <th className="px-2 py-2 text-right font-medium">Alloc. actuelle</th>
            <th className="px-2 py-2 text-right font-medium">Alloc. proposée</th>
            <th className="px-2 py-2 text-right font-medium">Valeur cible</th>
            <th className="px-2 py-2 text-right font-medium">Montant à réaliser (+A / −V)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const montant = cible(r) - r.valeurActuelle;
            return (
              <tr key={r.classe} className="border-b border-slate-800/60">
                <td className="px-2 py-2 text-left text-slate-300">
                  {PROPOSAL_LABELS[r.classe] ?? r.classe}
                </td>
                <td className="px-2 py-2 text-right font-mono text-slate-200">
                  {fmt(r.valeurActuelle, 0)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-slate-400">
                  {fmt(totalActuelle > 0 ? (r.valeurActuelle / totalActuelle) * 100 : 0)} %
                </td>
                <td className="px-2 py-2 text-right">
                  <span className="inline-flex items-center gap-1">
                    <input
                      className={`${inputCls} w-16 text-right`}
                      value={valOf(r)}
                      onChange={(e) => onChangeValide(r.classe, e.target.value)}
                    />
                    <span className="text-slate-500">%</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(cible(r), 0)}</td>
                <td
                  className={`px-2 py-2 text-right font-mono ${
                    montant >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {fmt(montant, 0)}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-slate-700 bg-slate-900/40 font-semibold">
            <td className="px-2 py-2 text-left text-slate-200">TOTAL</td>
            <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(totalActuelle, 0)}</td>
            <td className="px-2 py-2 text-right font-mono text-slate-400">100,00 %</td>
            <td className="px-2 py-2 text-right font-mono text-slate-300">{fmt(totalValide)} %</td>
            <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(totalCible, 0)}</td>
            <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(totalMontant, 0)}</td>
          </tr>
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-slate-600">
        Valeur cible = allocation proposée × total actuel. Montant à réaliser = valeur cible −
        valeur actuelle (+ = achat ; − = vente).
      </p>
    </section>
  );
}

// Tableau Top/Flop des obligations (variation de valeur, décote / PMV).
function BondTopFlopTable({
  title,
  rows,
  totals,
  base,
}: {
  title: string;
  rows: BondRow[];
  totals: { varMontant: number; decote: number; pmv: number };
  base: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
      <div className="px-3 py-2 border-b border-slate-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-slate-500 border-b border-slate-700 bg-slate-900/60">
            <th className="px-2 py-2 text-left font-medium">Titres</th>
            <th className="px-2 py-2 text-right font-medium">Poids</th>
            <th className="px-2 py-2 text-right font-medium">% Var. cours</th>
            <th className="px-2 py-2 text-right font-medium">Var. montant</th>
            <th className="px-2 py-2 text-right font-medium">Décote</th>
            <th className="px-2 py-2 text-right font-medium">PMV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.nom} className="border-b border-slate-800/60">
              <td className="px-2 py-2 text-left text-slate-300">{r.nom}</td>
              <td className="px-2 py-2 text-right font-mono text-slate-300">{fmt(r.poids)} %</td>
              <td
                className={`px-2 py-2 text-right font-mono ${
                  r.varPct == null ? "text-slate-300" : r.varPct >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {pct(r.varPct)}
              </td>
              <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(r.varMontant, 0)}</td>
              <td className="px-2 py-2 text-right font-mono text-slate-400">{fmt(r.decote, 0)}</td>
              <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(r.pmv, 0)}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-700 bg-slate-900/40 font-semibold">
            <td className="px-2 py-2 text-left text-slate-200">TOTAL</td>
            <td className="px-2 py-2"></td>
            <td className="px-2 py-2"></td>
            <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(totals.varMontant, 0)}</td>
            <td className="px-2 py-2 text-right font-mono text-slate-300">{fmt(totals.decote, 0)}</td>
            <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(totals.pmv, 0)}</td>
          </tr>
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-slate-600">
        {base} Cotés : Var. montant = quantité (fin) × (cours fin − cours début) → PMV (marché) ;
        cours début = inventaire début ou PRU si non détenu, amortissement sur nominal neutralisé.
        Non cotés (souverains) : cours au pair, gain = accrétion du coût amorti (PRU → pair) au
        prorata temporel jusqu&apos;à l&apos;échéance → Décote. PMV = Var. montant − Décote.
      </p>
    </section>
  );
}

// Tableau Top/Flop des contributions actions (période ou YTD).
function TopFlopTable({
  title,
  rows,
  total,
  base,
}: {
  title: string;
  rows: TopStockRow[];
  total: number;
  base: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
      <div className="px-3 py-2 border-b border-slate-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-slate-500 border-b border-slate-700 bg-slate-900/60">
            <th className="px-2 py-2 text-left font-medium">Sociétés</th>
            <th className="px-2 py-2 text-right font-medium">Poids</th>
            <th className="px-2 py-2 text-right font-medium">% Var. cours</th>
            <th className="px-2 py-2 text-right font-medium">Var. montant (FCFA)</th>
            <th className="px-2 py-2 text-right font-medium">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.nom} className="border-b border-slate-800/60">
              <td className="px-2 py-2 text-left text-slate-300">{r.nom}</td>
              <td className="px-2 py-2 text-right font-mono text-slate-300">{fmt(r.poids)} %</td>
              <td
                className={`px-2 py-2 text-right font-mono ${
                  r.varPct == null ? "text-slate-300" : r.varPct >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {pct(r.varPct)}
              </td>
              <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(r.varMontant, 0)}</td>
              <td className="px-2 py-2 text-right font-mono text-slate-400">{pct(r.contribution)}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-700 bg-slate-900/40 font-semibold">
            <td className="px-2 py-2 text-left text-slate-200">TOTAL</td>
            <td className="px-2 py-2"></td>
            <td className="px-2 py-2"></td>
            <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(total, 0)}</td>
            <td className="px-2 py-2"></td>
          </tr>
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-slate-600">
        {base} Var. montant = valorisation × var. cours / (1 + var. cours). Contribution = var.
        montant / total.
      </p>
    </section>
  );
}

export default function PerformancePanel({
  fundId,
  history = [],
  periodStart = null,
  periodEnd = null,
}: {
  fundId: string;
  history?: NavPoint[];
  periodStart?: string | null; // date de l'inventaire intermédiaire
  periodEnd?: string | null; // date de l'inventaire de fin
}) {
  const series = useMemo(
    () => history.filter((p) => p.vl != null && p.vl > 0) as VLPoint[],
    [history],
  );

  const bounds = useMemo(() => {
    if (series.length === 0) return null;
    return { first: series[0].date, last: series[series.length - 1].date };
  }, [series]);

  // Période = inventaire intermédiaire → inventaire fin (défauts basés sur ces
  // dates ; ajustables). Le YTD part du 31/12 de l'année précédente.
  const [dateDebut, setDateDebut] = useState<string>(periodStart ?? bounds?.first ?? "");
  const [dateFin, setDateFin] = useState<string>(periodEnd ?? bounds?.last ?? "");
  // Taux sans risque annualisé (%). Par défaut = taux directeur BCEAO (rempli
  // dès que le benchmark est calculé), tant que l'utilisateur ne l'a pas modifié.
  const [rf, setRf] = useState<string>("");
  const rfTouched = useRef(false);

  // Persistance des réglages (par fonds) : hydratation au chargement + sauvegarde
  // automatique de tous les champs saisis sur la page.
  const hydratedRef = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [allocValidee, setAllocValidee] = useState<Record<string, string>>({});
  const [secAllocValidee, setSecAllocValidee] = useState<Record<string, string>>({});
  const [allocProposee, setAllocProposee] = useState<Record<string, string>>({});
  const [secAllocProposee, setSecAllocProposee] = useState<Record<string, string>>({});

  // Benchmark calculé automatiquement depuis la définition du fonds (Paramètres).
  const [bench, setBench] = useState<BenchmarkResult | null>(null);
  const [benchLoading, setBenchLoading] = useState(false);
  const ytdRef = useMemo(
    () => (dateFin ? `${Number(dateFin.slice(0, 4)) - 1}-12-31` : ""),
    [dateFin],
  );
  useEffect(() => {
    if (!dateDebut || !dateFin) return;
    let alive = true;
    void (async () => {
      setBenchLoading(true);
      const res = await computeBenchmarkAction(fundId, dateDebut, dateFin, ytdRef);
      if (!alive) return;
      const data = res.ok ? res.data : null;
      setBench(data);
      // Taux sans risque par défaut = taux BCEAO (si non modifié par l'utilisateur).
      if (!rfTouched.current && data?.bceaoRate != null) {
        setRf(String(Math.round(data.bceaoRate * 100) / 100));
      }
      setBenchLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [fundId, dateDebut, dateFin, ytdRef]);

  // Attribution par classe d'actif (perf depuis la balance si dispo, sinon
  // variation inventaire début → fin).
  const [attr, setAttr] = useState<AttributionRow[] | null>(null);
  const [attrMeta, setAttrMeta] = useState<{
    debut: string | null;
    fin: string;
    source: "balance" | "inventaire";
  } | null>(null);
  const [attrTick, setAttrTick] = useState(0);
  // Effet d'allocation (Brinson).
  const [alloc, setAlloc] = useState<AllocationRow[] | null>(null);
  const [rbTotal, setRbTotal] = useState<number | null>(null);
  const [objW, setObjW] = useState<Record<string, string>>({}); // pondérations objectives (%)
  const [beDiff, setBeDiff] = useState<Record<string, string>>({}); // diff. perf. breakeven (%)

  // Allocation sectorielle des actions.
  const [sectorRows, setSectorRows] = useState<SectorRow[] | null>(null);
  const [rbActions, setRbActions] = useState<number | null>(null);
  const [secW, setSecW] = useState<Record<string, string>>({}); // pondération nécessaire (%)
  const [secBe, setSecBe] = useState<Record<string, string>>({}); // diff. perf. breakeven secteur (%)
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await computeSectorAllocationAction(fundId);
      if (!alive) return;
      setSectorRows(res.ok ? res.data.rows : null);
      setRbActions(res.ok ? res.data.rbActions : null);
    })();
    return () => {
      alive = false;
    };
  }, [fundId]);

  // Top/Flop 10 actions par contribution (variation de cours) — période et YTD.
  const [topStocks, setTopStocks] = useState<TopStockRow[] | null>(null);
  const [topTotal, setTopTotal] = useState<number>(0);
  const [flopStocks, setFlopStocks] = useState<TopStockRow[] | null>(null);
  const [flopTotal, setFlopTotal] = useState<number>(0);
  const [topYtd, setTopYtd] = useState<TopStockRow[] | null>(null);
  const [topYtdTotal, setTopYtdTotal] = useState<number>(0);
  const [flopYtd, setFlopYtd] = useState<TopStockRow[] | null>(null);
  const [flopYtdTotal, setFlopYtdTotal] = useState<number>(0);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await computeTopFlopStocksAction(fundId, 10);
      if (!alive) return;
      if (res.ok) {
        setTopStocks(res.data.periode.top);
        setTopTotal(res.data.periode.totalTop);
        setFlopStocks(res.data.periode.flop);
        setFlopTotal(res.data.periode.totalFlop);
        setTopYtd(res.data.ytd.top);
        setTopYtdTotal(res.data.ytd.totalTop);
        setFlopYtd(res.data.ytd.flop);
        setFlopYtdTotal(res.data.ytd.totalFlop);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fundId]);

  // Top/Flop obligations (décote / PMV) sur la période.
  const zeroTotals = { varMontant: 0, decote: 0, pmv: 0 };
  const [topBonds, setTopBonds] = useState<BondRow[] | null>(null);
  const [topBondsTot, setTopBondsTot] = useState(zeroTotals);
  const [flopBonds, setFlopBonds] = useState<BondRow[] | null>(null);
  const [flopBondsTot, setFlopBondsTot] = useState(zeroTotals);
  const [topBondsYtd, setTopBondsYtd] = useState<BondRow[] | null>(null);
  const [topBondsYtdTot, setTopBondsYtdTot] = useState(zeroTotals);
  const [flopBondsYtd, setFlopBondsYtd] = useState<BondRow[] | null>(null);
  const [flopBondsYtdTot, setFlopBondsYtdTot] = useState(zeroTotals);
  const [opcvmRows, setOpcvmRows] = useState<OpcvmHoldingRow[] | null>(null);
  const [reb, setReb] = useState<{
    rows: RebalanceRow[];
    totalPrecedente: number;
    totalActuelle: number;
    datePrecedente: string | null;
    dateActuelle: string;
    datNames: string[];
  } | null>(null);
  const [secReb, setSecReb] = useState<{
    rows: SectorRebalanceRow[];
    totalPrecedente: number;
    totalActuelle: number;
    datePrecedente: string | null;
    dateActuelle: string;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await computeTopFlopBondsAction(fundId, 10);
      if (!alive) return;
      if (res.ok) {
        setTopBonds(res.data.periode.top);
        setTopBondsTot(res.data.periode.totalsTop);
        setFlopBonds(res.data.periode.flop);
        setFlopBondsTot(res.data.periode.totalsFlop);
        setTopBondsYtd(res.data.ytd.top);
        setTopBondsYtdTot(res.data.ytd.totalsTop);
        setFlopBondsYtd(res.data.ytd.flop);
        setFlopBondsYtdTot(res.data.ytd.totalsFlop);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fundId]);

  // Détail des DAT : dérivé de l'attribution (ligne « DAT ») + libellés DAT du
  // rééquilibrage — pas d'appel serveur dédié (évite un 2e calcul d'attribution).
  const datRows = useMemo<DatHoldingRow[] | null>(() => {
    if (!reb) return null;
    const datRow = attr?.find((r) => r.classe === "DAT");
    if (!datRow || reb.datNames.length === 0) return [];
    return reb.datNames.map((nom) => ({
      nom,
      performance: datRow.performance,
      benchmark: datRow.benchmark,
      alpha: datRow.alpha,
    }));
  }, [reb, attr]);

  // Rééquilibrage sectoriel Actions (le rééquilibrage par classe vient du bundle).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const sc = await computeSectorRebalancingAction(fundId);
      if (!alive) return;
      setSecReb(sc.ok ? sc.data : null);
    })();
    return () => {
      alive = false;
    };
  }, [fundId]);

  // Hydratation : réapplique les réglages sauvegardés (les valeurs saisies
  // priment sur les défauts calculés). N'écrase pas un champ absent en base.
  useEffect(() => {
    hydratedRef.current = false;
    let alive = true;
    void (async () => {
      const res = await loadAnalysisSettings(fundId);
      if (!alive) return;
      const s: AnalysisSettings = res.ok ? res.data.settings : {};
      if (s.dateDebut) setDateDebut(s.dateDebut);
      if (s.dateFin) setDateFin(s.dateFin);
      if (s.rf != null && s.rf !== "") {
        rfTouched.current = true;
        setRf(s.rf);
      }
      if (s.objW) setObjW(s.objW);
      if (s.beDiff) setBeDiff(s.beDiff);
      if (s.secW) setSecW(s.secW);
      if (s.secBe) setSecBe(s.secBe);
      if (s.allocValidee) setAllocValidee(s.allocValidee);
      if (s.secAllocValidee) setSecAllocValidee(s.secAllocValidee);
      if (s.allocProposee) setAllocProposee(s.allocProposee);
      if (s.secAllocProposee) setSecAllocProposee(s.secAllocProposee);
      hydratedRef.current = true;
    })();
    return () => {
      alive = false;
    };
  }, [fundId]);

  // Sauvegarde automatique (debounce) de tous les champs saisis, après hydratation.
  const settingsPayload = useMemo<AnalysisSettings>(
    () => ({
      dateDebut,
      dateFin,
      rf,
      objW,
      beDiff,
      secW,
      secBe,
      allocValidee,
      secAllocValidee,
      allocProposee,
      secAllocProposee,
    }),
    [
      dateDebut,
      dateFin,
      rf,
      objW,
      beDiff,
      secW,
      secBe,
      allocValidee,
      secAllocValidee,
      allocProposee,
      secAllocProposee,
    ],
  );
  useEffect(() => {
    if (!hydratedRef.current) return;
    setSaveState("saving");
    const t = setTimeout(() => {
      void (async () => {
        const res = await saveAnalysisSettings(fundId, settingsPayload);
        setSaveState(res.ok ? "saved" : "idle");
      })();
    }, 700);
    return () => clearTimeout(t);
  }, [fundId, settingsPayload]);
  // Bundle : attribution + rééquilibrage + OPCVM en un seul appel serveur.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { attr: aRes, reb: rRes, opcvm: oRes } = await computeAnalysisBundleAction(fundId);
      if (!alive) return;
      // Attribution.
      setAttr(aRes.ok ? aRes.data.rows : null);
      setAttrMeta(
        aRes.ok ? { debut: aRes.data.dateDebut, fin: aRes.data.dateFin, source: aRes.data.source } : null,
      );
      if (aRes.ok) {
        setAlloc(aRes.data.alloc);
        setRbTotal(aRes.data.rbTotal);
        // Pondérations objectives par défaut = poids benchmark (wb).
        setObjW((prev) =>
          Object.keys(prev).length
            ? prev
            : Object.fromEntries(aRes.data.alloc.map((a) => [a.classe, String(a.wb)])),
        );
      } else {
        setAlloc(null);
      }
      // Rééquilibrage par classe + OPCVM détenus.
      setReb(rRes.ok ? rRes.data : null);
      setOpcvmRows(oRes.ok ? oRes.data.rows : null);
    })();
    return () => {
      alive = false;
    };
  }, [fundId, attrTick]);

  // Import de la balance générale (comptes de résultat → performance par classe).
  const balFileRef = useRef<HTMLInputElement>(null);
  const [balDate, setBalDate] = useState<string>(periodEnd ?? "");
  const [balMsg, setBalMsg] = useState<string | null>(null);
  const [balErr, setBalErr] = useState<string | null>(null);
  const [balImporting, setBalImporting] = useState(false);
  const importBalance = () => {
    const file = balFileRef.current?.files?.[0];
    if (!file) return setBalErr("Sélectionne le fichier de balance (.xlsx).");
    if (!balDate) return setBalErr("Renseigne la date d'arrêté.");
    setBalErr(null);
    setBalMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("asOfDate", balDate);
    void (async () => {
      setBalImporting(true);
      const res = await importBalanceAction(fundId, fd);
      setBalImporting(false);
      if (!res.ok) return setBalErr(res.error);
      setBalMsg(`Balance importée au ${res.data.asOfDate}.`);
      if (balFileRef.current) balFileRef.current.value = "";
      setAttrTick((t) => t + 1);
    })();
  };

  const metrics = useMemo(() => {
    if (series.length < 2 || !bounds) return null;
    const dFin = dateFin || bounds.last;
    const dDebut = dateDebut || bounds.first;
    // Base YTD : 31/12 de l'année précédant la date de fin.
    const ytdRef = `${Number(dFin.slice(0, 4)) - 1}-12-31`;

    // VL au plus proche <= date (sinon 1er point).
    const vlOnOrBefore = (d: string): VLPoint => {
      let chosen = series[0];
      for (const p of series) {
        if (p.date <= d) chosen = p;
        else break;
      }
      return chosen;
    };
    // Rendements journaliers entre deux bornes de dates (incluses).
    const returnsIn = (d1: string, d2: string): number[] => {
      const pts = series.filter((p) => p.date >= d1 && p.date <= d2);
      const r: number[] = [];
      for (let i = 1; i < pts.length; i++) r.push(pts[i].vl / pts[i - 1].vl - 1);
      return r;
    };
    const annVol = (rets: number[]): number | null => {
      if (rets.length < 2) return null;
      const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
      const varr = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / rets.length;
      return Math.sqrt(varr) * Math.sqrt(252) * 100;
    };
    const rfNum = Number((rf || "0").replace(",", ".")) || 0;
    const sharpe = (totalRetPct: number, days: number, volPct: number | null): number | null => {
      if (!volPct || volPct === 0 || days <= 0) return null;
      const ann = (Math.pow(1 + totalRetPct / 100, 365.25 / days) - 1) * 100;
      return (ann - rfNum) / volPct;
    };

    const vlD = vlOnOrBefore(dDebut);
    const vlF = vlOnOrBefore(dFin);
    const vlY = vlOnOrBefore(ytdRef); // VL au 31/12/N-1 (ou plus proche avant)

    const perfPeriode = (vlF.vl / vlD.vl - 1) * 100;
    const perfYtd = (vlF.vl / vlY.vl - 1) * 100;

    const volPeriode = annVol(returnsIn(dDebut, dFin));
    const volYtd = annVol(returnsIn(vlY.date, dFin));

    const bP = bench?.periode ?? null;
    const bY = bench?.ytd ?? null;
    const alphaPeriode = bP == null ? null : perfPeriode - bP;
    const alphaYtd = bY == null ? null : perfYtd - bY;

    return {
      dDebut,
      dFin,
      vlDebut: vlD.vl,
      vlFin: vlF.vl,
      dateVlDebut: vlD.date,
      dateVlFin: vlF.date,
      perfPeriode,
      perfYtd,
      benchPeriode: bP,
      benchYtd: bY,
      alphaPeriode,
      alphaYtd,
      volPeriode,
      volYtd,
      sharpePeriode: sharpe(perfPeriode, daysBetween(dDebut, dFin), volPeriode),
      sharpeYtd: sharpe(perfYtd, daysBetween(vlY.date, dFin), volYtd),
      ytdStart: vlY.date,
    };
  }, [series, bounds, dateDebut, dateFin, rf, bench]);

  if (!bounds || !metrics) {
    return (
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-8 text-center text-sm text-slate-500">
        Analyse indisponible : importe l&apos;historique de valeur liquidative (onglet « Valeur
        liquidative ») pour calculer la performance.
      </section>
    );
  }

  const m = metrics;
  const tone = (n: number | null | undefined) =>
    n == null ? "text-slate-300" : n >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="space-y-5">
      {/* Paramètres */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-end mb-2 h-4">
          <span
            className={`text-[10px] ${
              saveState === "saved"
                ? "text-emerald-400"
                : saveState === "saving"
                  ? "text-slate-500"
                  : "text-transparent"
            }`}
          >
            {saveState === "saving" ? "Enregistrement…" : saveState === "saved" ? "✓ Réglages enregistrés" : ""}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Date début (inv. intermédiaire)
            </span>
            <input type="date" min={bounds.first} max={bounds.last} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Date fin (inv. fin)
            </span>
            <input type="date" min={bounds.first} max={bounds.last} value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Taux sans risque (BCEAO)
            </span>
            <div className="relative">
              <input
                inputMode="decimal"
                value={rf}
                onChange={(e) => {
                  setRf(e.target.value);
                  rfTouched.current = true;
                }}
                className={`${inputCls} w-full pr-6`}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
            </div>
          </label>
        </div>
        <p className="text-[10px] text-slate-600 mt-2">
          YTD depuis le {m.ytdStart}. Benchmark calculé automatiquement depuis sa définition
          (Paramètres du fonds){benchLoading ? " — calcul en cours…" : ""}. Volatilité annualisée
          (base 252). Sharpe = (rendement annualisé − taux sans risque) / volatilité. Alpha =
          performance − benchmark.
        </p>
        {bench && bench.unresolved.length > 0 && (
          <p className="text-[10px] text-amber-400/90 mt-1">
            Composantes sans série historique (exclues, poids renormalisés) :{" "}
            {bench.unresolved.join(", ")}
            {bench.coverageYtd < 1 ? ` — couverture ${Math.round(bench.coverageYtd * 100)} %` : ""}
          </p>
        )}
      </section>

      {/* Tableau de performance */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-700 bg-slate-900/60">
              <th className="px-3 py-2 text-left font-medium"></th>
              <th className="px-3 py-2 text-right font-medium">{m.dateVlDebut}</th>
              <th className="px-3 py-2 text-right font-medium">{m.dateVlFin}</th>
              <th className="px-3 py-2 text-right font-medium">Performance période</th>
              <th className="px-3 py-2 text-right font-medium">Performance YTD</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-800">
              <td className="px-3 py-2 text-slate-300 font-medium">Valeur liquidative</td>
              <td className="px-3 py-2 text-right font-mono text-slate-200">{fmt(m.vlDebut)}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-200">{fmt(m.vlFin)}</td>
              <td className={`px-3 py-2 text-right font-mono ${tone(m.perfPeriode)}`}>{pct(m.perfPeriode)}</td>
              <td className={`px-3 py-2 text-right font-mono ${tone(m.perfYtd)}`}>{pct(m.perfYtd)}</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="px-3 py-2 text-slate-300 font-medium">Benchmark</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2"></td>
              <td className={`px-3 py-2 text-right font-mono ${tone(m.benchPeriode)}`}>{pct(m.benchPeriode)}</td>
              <td className={`px-3 py-2 text-right font-mono ${tone(m.benchYtd)}`}>{pct(m.benchYtd)}</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="px-3 py-2 text-slate-300 font-medium">Alpha</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2"></td>
              <td className={`px-3 py-2 text-right font-mono ${tone(m.alphaPeriode)}`}>{pct(m.alphaPeriode)}</td>
              <td className={`px-3 py-2 text-right font-mono ${tone(m.alphaYtd)}`}>{pct(m.alphaYtd)}</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="px-3 py-2 text-slate-300 font-medium">Volatilité</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right font-mono text-slate-300">{pct(m.volPeriode)}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-300">{pct(m.volYtd)}</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-slate-300 font-medium">Ratio de Sharpe</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right font-mono text-slate-300">{fmt(m.sharpePeriode)}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-300">{fmt(m.sharpeYtd)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Import de la balance générale (performance comptable par classe) */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
          Balance générale (attribution comptable)
        </h3>
        <p className="text-[11px] text-slate-500 mb-3">
          Importe la balance des comptes : poids et performance par classe sont alors calculés
          depuis la comptabilité (écarts d&apos;estimation, +/- values, produits). À défaut,
          l&apos;attribution se base sur les inventaires début → fin.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Date d&apos;arrêté</span>
            <input type="date" value={balDate} onChange={(e) => setBalDate(e.target.value)} className={inputCls} />
          </label>
          <input
            ref={balFileRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="text-[12px] text-slate-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-slate-700 file:text-slate-200 file:text-sm hover:file:bg-slate-600"
          />
          <button
            type="button"
            onClick={importBalance}
            disabled={balImporting}
            className="px-4 py-2 text-sm font-medium rounded-md border border-blue-500/50 bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 transition disabled:opacity-50"
          >
            {balImporting ? "Import…" : "Importer la balance"}
          </button>
          {balErr && <span className="text-[12px] text-red-400 self-center">{balErr}</span>}
          {balMsg && <span className="text-[12px] text-emerald-400 self-center">✓ {balMsg}</span>}
        </div>
      </section>

      {/* Attribution par classe d'actif */}
      {attr && attr.length > 0 && (
        <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
          <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Attribution par classe d&apos;actif
            </h3>
            {attrMeta && (
              <span className="text-[10px] text-slate-500">
                {attrMeta.source === "balance" ? "balance" : "inventaires"} ·{" "}
                {attrMeta.debut ? `${attrMeta.debut} → ${attrMeta.fin}` : `au ${attrMeta.fin}`}
              </span>
            )}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-700 bg-slate-900/60">
                <th className="px-3 py-2 text-left font-medium">Actifs</th>
                <th className="px-3 py-2 text-right font-medium">Poids</th>
                <th className="px-3 py-2 text-right font-medium">Performance</th>
                <th className="px-3 py-2 text-right font-medium">Benchmark</th>
                <th className="px-3 py-2 text-right font-medium">Alpha</th>
              </tr>
            </thead>
            <tbody>
              {attr.map((r) => (
                <tr key={r.classe} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-3 py-2 text-slate-300 font-medium">{r.classe}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">{fmt(r.poids)} %</td>
                  <td className={`px-3 py-2 text-right font-mono ${tone(r.performance)}`}>{pct(r.performance)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${tone(r.benchmark)}`}>{pct(r.benchmark)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${tone(r.alpha)}`}>{pct(r.alpha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[10px] text-slate-600">
            {attrMeta?.source === "balance"
              ? "Performance = résultat de période de la classe (mouvements : écarts d'estimation + /- values + produits) / valorisation de la classe à l'inventaire de début ; poids = inventaire de fin."
              : "Performance = variation de valorisation de la classe entre inventaires début → fin ; poids = inventaire de fin."}{" "}
            Benchmark : Actions/OPCVM → BRVM Composite ; Obligations → souverain UMOA ; DAT → taux
            BCEAO ; Liquidité → 0.
          </p>
        </section>
      )}

      {/* Effet d'allocation d'actif (Brinson) */}
      {alloc && alloc.length > 0 && (
        <AllocationEffectTable
          alloc={alloc}
          rbTotal={rbTotal}
          objW={objW}
          setObjW={setObjW}
        />
      )}

      {/* Effet de sélection d'actif (Brinson) */}
      {attr && attr.length > 0 && alloc && alloc.length > 0 && (
        <SelectionEffectTable attr={attr} alloc={alloc} beDiff={beDiff} setBeDiff={setBeDiff} />
      )}

      {/* Récapitulatif de l'attribution (Brinson) */}
      {attr && attr.length > 0 && alloc && alloc.length > 0 && rbTotal != null && (
        <RecapTable attr={attr} alloc={alloc} rbTotal={rbTotal} fundPerf={m.perfYtd} />
      )}

      {/* Effet d'allocation sectorielle (classe Actions) */}
      {sectorRows && sectorRows.length > 0 && (
        <SectorAllocationTable
          rows={sectorRows}
          rbActions={rbActions}
          secW={secW}
          setSecW={setSecW}
        />
      )}

      {/* Effet de sélection sectorielle (classe Actions) */}
      {sectorRows && sectorRows.length > 0 && (
        <SectorSelectionTable rows={sectorRows} secBe={secBe} setSecBe={setSecBe} />
      )}

      {/* Top / Flop contributions actions — période */}
      {topStocks && (
        <TopFlopTable
          title="Top 10 contributions — Actions (période)"
          rows={topStocks}
          total={topTotal}
          base="Sur la période (inventaire intermédiaire → fin)."
        />
      )}
      {flopStocks && (
        <TopFlopTable
          title="Flop 10 contributions — Actions (période)"
          rows={flopStocks}
          total={flopTotal}
          base="Sur la période (inventaire intermédiaire → fin)."
        />
      )}

      {/* Top / Flop contributions actions — YTD */}
      {topYtd && (
        <TopFlopTable
          title="Top 10 contributions — Actions (YTD)"
          rows={topYtd}
          total={topYtdTotal}
          base="Sur l'année (31/12/N-1 → fin)."
        />
      )}
      {flopYtd && (
        <TopFlopTable
          title="Flop 10 contributions — Actions (YTD)"
          rows={flopYtd}
          total={flopYtdTotal}
          base="Sur l'année (31/12/N-1 → fin)."
        />
      )}

      {/* Top / Flop obligations (décote / PMV) — période */}
      {topBonds && (
        <BondTopFlopTable
          title="Top 10 — Classe obligataire (période)"
          rows={topBonds}
          totals={topBondsTot}
          base="Sur la période (inventaire intermédiaire → fin)."
        />
      )}
      {flopBonds && (
        <BondTopFlopTable
          title="Flop 10 — Classe obligataire (période)"
          rows={flopBonds}
          totals={flopBondsTot}
          base="Sur la période (inventaire intermédiaire → fin)."
        />
      )}

      {/* Top / Flop obligations (décote / PMV) — YTD */}
      {topBondsYtd && (
        <BondTopFlopTable
          title="Top 10 — Classe obligataire (YTD)"
          rows={topBondsYtd}
          totals={topBondsYtdTot}
          base="Sur l'année (inventaire début 31/12/N-1 → fin)."
        />
      )}
      {flopBondsYtd && (
        <BondTopFlopTable
          title="Flop 10 — Classe obligataire (YTD)"
          rows={flopBondsYtd}
          totals={flopBondsYtdTot}
          base="Sur l'année (inventaire début 31/12/N-1 → fin)."
        />
      )}

      {/* OPCVM détenus : perf du FCP vs moyenne de sa catégorie */}
      {opcvmRows && opcvmRows.length > 0 && (
        <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
          <div className="px-3 py-2 border-b border-slate-700">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              OPCVM détenus — performance vs catégorie
            </h3>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wide text-slate-500 border-b border-slate-700 bg-slate-900/60">
                <th className="px-2 py-2 text-left font-medium">FCP</th>
                <th className="px-2 py-2 text-right font-medium">Performance fonds</th>
                <th className="px-2 py-2 text-right font-medium">Performance benchmark</th>
                <th className="px-2 py-2 text-right font-medium">Alpha</th>
              </tr>
            </thead>
            <tbody>
              {opcvmRows.map((r) => (
                <tr key={`${r.nom}|${r.categorie}`} className="border-b border-slate-800/60">
                  <td className="px-2 py-2 text-left text-slate-300">
                    {r.nom}
                    {r.categorie ? <span className="text-slate-500"> ({r.categorie})</span> : null}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-200">{pct(r.perfFonds)}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-300">{pct(r.perfBenchmark)}</td>
                  <td
                    className={`px-2 py-2 text-right font-mono ${
                      r.alpha == null ? "text-slate-300" : r.alpha >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {pct(r.alpha)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[10px] text-slate-600">
            Performance fonds = perfYTD du FCP (VL 31/12/N-1 → dernière VL, méthode /marches/fcp).
            Benchmark = moyenne des FCP de la même catégorie. Alpha = performance fonds − benchmark.
          </p>
        </section>
      )}

      {/* DAT détenus : performance vs benchmark (repris de l'attribution DAT) */}
      {datRows && datRows.length > 0 && (
        <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
          <div className="px-3 py-2 border-b border-slate-700">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Dépôts à terme — performance vs benchmark
            </h3>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wide text-slate-500 border-b border-slate-700 bg-slate-900/60">
                <th className="px-2 py-2 text-left font-medium">DAT</th>
                <th className="px-2 py-2 text-right font-medium">Performance</th>
                <th className="px-2 py-2 text-right font-medium">Performance benchmark</th>
                <th className="px-2 py-2 text-right font-medium">Alpha</th>
              </tr>
            </thead>
            <tbody>
              {datRows.map((r) => (
                <tr key={r.nom} className="border-b border-slate-800/60">
                  <td className="px-2 py-2 text-left text-slate-300">{r.nom}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-200">{pct(r.performance)}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-300">{pct(r.benchmark)}</td>
                  <td
                    className={`px-2 py-2 text-right font-mono ${
                      r.alpha == null ? "text-slate-300" : r.alpha >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {pct(r.alpha)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[10px] text-slate-600">
            Performance et benchmark repris de la ligne « DAT » de l&apos;attribution par classe.
            Alpha = performance − benchmark.
          </p>
        </section>
      )}

      {/* Rééquilibrage : allocation cible & TRO */}
      {reb && reb.rows.length > 0 && (
        <RebalancingTable
          rows={reb.rows}
          totalPrecedente={reb.totalPrecedente}
          totalActuelle={reb.totalActuelle}
          datePrecedente={reb.datePrecedente}
          dateActuelle={reb.dateActuelle}
          valide={allocValidee}
          onChangeValide={(classe, value) =>
            setAllocValidee((prev) => ({ ...prev, [classe]: value }))
          }
        />
      )}

      {/* Proposition d'allocation d'actif (allocation proposée indépendante) */}
      {reb && reb.rows.length > 0 && (
        <AllocationProposalTable
          rows={reb.rows}
          totalActuelle={reb.totalActuelle}
          valide={allocProposee}
          onChangeValide={(classe, value) =>
            setAllocProposee((prev) => ({ ...prev, [classe]: value }))
          }
        />
      )}

      {/* Rééquilibrage sectoriel de la classe Actions */}
      {secReb && secReb.rows.length > 0 && (
        <RebalancingTable
          title="Rééquilibrage Actions — allocation cible & TRO (par secteur)"
          rows={secReb.rows}
          totalPrecedente={secReb.totalPrecedente}
          totalActuelle={secReb.totalActuelle}
          datePrecedente={secReb.datePrecedente}
          dateActuelle={secReb.dateActuelle}
          valide={secAllocValidee}
          onChangeValide={(classe, value) =>
            setSecAllocValidee((prev) => ({ ...prev, [classe]: value }))
          }
        />
      )}

      {/* Proposition d'allocation sectorielle (par secteur Actions) */}
      {secReb && secReb.rows.length > 0 && (
        <AllocationProposalTable
          title="Proposition d'allocation sectorielle"
          firstCol="Secteurs"
          rows={secReb.rows}
          totalActuelle={secReb.totalActuelle}
          valide={secAllocProposee}
          onChangeValide={(classe, value) =>
            setSecAllocProposee((prev) => ({ ...prev, [classe]: value }))
          }
        />
      )}
    </div>
  );
}

// Effet de sélection intra-Actions par secteur : effet = poids BRVM × (perf
// fonds secteur − perf indice sectoriel). PMV = |diff − diff breakeven| × valo.
function SectorSelectionTable({
  rows,
  secBe,
  setSecBe,
}: {
  rows: SectorRow[];
  secBe: Record<string, string>;
  setSecBe: (f: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  const parse = (s: string) => {
    const v = Number((s ?? "").replace(",", "."));
    return Number.isFinite(v) ? v : 0;
  };
  const data = rows.map((r) => {
    const diff = r.rpSector != null && r.rbSector != null ? r.rpSector - r.rbSector : null;
    const effet = diff != null ? (r.wb * diff) / 100 : null;
    const be = parse(secBe[r.secteur] ?? "");
    const effetBe = (r.wb * be) / 100;
    const pmv = diff != null ? (Math.abs(diff - be) / 100) * r.valuation : null;
    return { r, diff, effet, effetBe, pmv };
  });
  const sum = (f: (x: (typeof data)[number]) => number | null) =>
    data.reduce((s, x) => s + (f(x) ?? 0), 0);
  const th = "px-2 py-2 text-right font-medium";
  const td = "px-2 py-2 text-right font-mono";
  const cTone = (n: number | null) =>
    n == null ? "text-slate-300" : n >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
      <div className="px-3 py-2 border-b border-slate-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Effet de sélection sectorielle — Actions
        </h3>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-slate-500 border-b border-slate-700 bg-slate-900/60">
            <th className="px-2 py-2 text-left font-medium">Secteurs</th>
            <th className={th}>Fonds</th>
            <th className={th}>BRVM</th>
            <th className={th}>Diff. de perf.</th>
            <th className={th}>Poids BRVM</th>
            <th className={th}>Effet sélection</th>
            <th className={th}>Diff. perf. breakeven</th>
            <th className={th}>Effet breakeven</th>
            <th className={th}>PMV pour breakeven (FCFA)</th>
          </tr>
        </thead>
        <tbody>
          {data.map(({ r, diff, effet, effetBe, pmv }) => (
            <tr key={r.secteur} className="border-b border-slate-800/60">
              <td className="px-2 py-2 text-left text-slate-300 font-medium">{r.secteur}</td>
              <td className={`${td} ${cTone(r.rpSector)}`}>{pct(r.rpSector)}</td>
              <td className={`${td} ${cTone(r.rbSector)}`}>{pct(r.rbSector)}</td>
              <td className={`${td} ${cTone(diff)}`}>{pct(diff)}</td>
              <td className={`${td} text-slate-400`}>{fmt(r.wb)} %</td>
              <td className={`${td} ${cTone(effet)}`}>{pct(effet)}</td>
              <td className="px-2 py-1.5 text-right">
                <div className="relative inline-block w-20">
                  <input
                    inputMode="decimal"
                    value={secBe[r.secteur] ?? ""}
                    onChange={(e) => setSecBe((prev) => ({ ...prev, [r.secteur]: e.target.value }))}
                    placeholder="0"
                    className="w-full px-2 py-1 text-[11px] text-right bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </td>
              <td className={`${td} ${cTone(effetBe)}`}>{pct(effetBe)}</td>
              <td className={`${td} text-slate-300`}>{fmt(pmv, 0)}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-700 bg-slate-900/40 font-semibold">
            <td className="px-2 py-2 text-left text-slate-200">TOTAL</td>
            <td className={td}></td>
            <td className={td}></td>
            <td className={td}></td>
            <td className={`${td} text-slate-300`}>{fmt(sum((x) => x.r.wb))} %</td>
            <td className={`${td} ${cTone(sum((x) => x.effet))}`}>{pct(sum((x) => x.effet))}</td>
            <td className={td}></td>
            <td className={`${td} ${cTone(sum((x) => x.effetBe))}`}>{pct(sum((x) => x.effetBe))}</td>
            <td className={`${td} text-slate-200`}>{fmt(sum((x) => x.pmv), 0)}</td>
          </tr>
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-slate-600">
        Perf. Fonds = rendement pondéré des actions détenues du secteur (cours du site). BRVM =
        indice sectoriel. Effet sélection = poids BRVM × (perf. fonds − indice). PMV = |diff. perf. −
        diff. breakeven| × valorisation du secteur.
      </p>
    </section>
  );
}

// Effet d'allocation intra-Actions par secteur BRVM (Brinson) :
// effet = (poids fonds − poids BRVM) × (perf secteur − perf BRVM Composite).
function SectorAllocationTable({
  rows,
  rbActions,
  secW,
  setSecW,
}: {
  rows: SectorRow[];
  rbActions: number | null;
  secW: Record<string, string>;
  setSecW: (f: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  const parse = (s: string) => {
    const v = Number((s ?? "").replace(",", "."));
    return Number.isFinite(v) ? v : 0;
  };
  const totVal = rows.reduce((s, r) => s + r.valuation, 0);
  const data = rows.map((r) => {
    const diffPerf = r.rbSector != null && rbActions != null ? r.rbSector - rbActions : null;
    const diffPoids = r.wp - r.wb;
    const effet = diffPerf != null ? ((r.wp - r.wb) * diffPerf) / 100 : null;
    const wNec = parse(secW[r.secteur] ?? String(r.wb));
    const effetSim = diffPerf != null ? ((wNec - r.wb) * diffPerf) / 100 : null;
    return { r, diffPerf, diffPoids, effet, effetSim };
  });
  const sum = (f: (x: (typeof data)[number]) => number | null) =>
    data.reduce((s, x) => s + (f(x) ?? 0), 0);
  const th = "px-2 py-2 text-right font-medium";
  const td = "px-2 py-2 text-right font-mono";
  const cTone = (n: number | null) =>
    n == null ? "text-slate-300" : n >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
      <div className="px-3 py-2 border-b border-slate-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Effet d&apos;allocation sectorielle — Actions
        </h3>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-slate-500 border-b border-slate-700 bg-slate-900/60">
            <th className="px-2 py-2 text-left font-medium">Secteurs</th>
            <th className={th}>Valo. (MFCFA)</th>
            <th className={th}>Fonds</th>
            <th className={th}>BRVM</th>
            <th className={th}>Diff. de poids</th>
            <th className={th}>Diff. de perf.</th>
            <th className={th}>Effet allocation</th>
            <th className={th}>Pond. nécessaire</th>
            <th className={th}>Effets simulés</th>
          </tr>
        </thead>
        <tbody>
          {data.map(({ r, diffPerf, diffPoids, effet, effetSim }) => (
            <tr key={r.secteur} className="border-b border-slate-800/60">
              <td className="px-2 py-2 text-left text-slate-300 font-medium">{r.secteur}</td>
              <td className={`${td} text-slate-300`}>{fmt(r.valuation / 1_000_000, 0)}</td>
              <td className={`${td} text-slate-300`}>{fmt(r.wp)} %</td>
              <td className={`${td} text-slate-400`}>{fmt(r.wb)} %</td>
              <td className={`${td} ${cTone(diffPoids)}`}>{fmt(diffPoids)} %</td>
              <td className={`${td} ${cTone(diffPerf)}`}>{pct(diffPerf)}</td>
              <td className={`${td} ${cTone(effet)}`}>{pct(effet)}</td>
              <td className="px-2 py-1.5 text-right">
                <div className="relative inline-block w-20">
                  <input
                    inputMode="decimal"
                    value={secW[r.secteur] ?? ""}
                    onChange={(e) => setSecW((prev) => ({ ...prev, [r.secteur]: e.target.value }))}
                    placeholder={fmt(r.wb)}
                    className="w-full px-2 py-1 text-[11px] text-right bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </td>
              <td className={`${td} ${cTone(effetSim)}`}>{pct(effetSim)}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-700 bg-slate-900/40 font-semibold">
            <td className="px-2 py-2 text-left text-slate-200">TOTAL</td>
            <td className={`${td} text-slate-200`}>{fmt(totVal / 1_000_000, 0)}</td>
            <td className={`${td} text-slate-200`}>{fmt(sum((x) => x.r.wp))} %</td>
            <td className={`${td} text-slate-300`}>{fmt(sum((x) => x.r.wb))} %</td>
            <td className={td}></td>
            <td className={td}></td>
            <td className={`${td} ${cTone(sum((x) => x.effet))}`}>{pct(sum((x) => x.effet))}</td>
            <td className={`${td} text-slate-200`}>
              {fmt(sum((x) => parse(secW[x.r.secteur] ?? String(x.r.wb))))} %
            </td>
            <td className={`${td} ${cTone(sum((x) => x.effetSim))}`}>{pct(sum((x) => x.effetSim))}</td>
          </tr>
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-slate-600">
        Poids Fonds = valorisation du secteur / total Actions. Poids BRVM = capitalisation du
        secteur / capitalisation BRVM. Diff. de perf. = perf. indice sectoriel − BRVM Composite.
        Effet allocation = diff. de poids × diff. de perf.
      </p>
    </section>
  );
}

// Récapitulatif de la décomposition de performance (Brinson) :
// Alpha = perf réelle du fonds (VL) − perf benchmark composite.
// Delta = Alpha − (Effet allocation + Effet sélection), résidu de réconciliation.
function RecapTable({
  attr,
  alloc,
  rbTotal,
  fundPerf,
}: {
  attr: AttributionRow[];
  alloc: AllocationRow[];
  rbTotal: number;
  fundPerf: number | null; // performance réelle du fonds (VL, YTD) en %
}) {
  const wbByClasse = new Map(alloc.map((a) => [a.classe, a.wb]));
  // Effets allocation / sélection (identiques aux tableaux ci-dessus).
  let allocEff = 0;
  let selEff = 0;
  for (const r of attr) {
    const wp = r.poids; // %
    const wb = wbByClasse.get(r.classe) ?? 0; // %
    const rp = r.performance;
    const rb = r.benchmark;
    if (rb != null) allocEff += ((wp - wb) / 100) * (rb - rbTotal);
    if (rp != null && rb != null) selEff += (wb / 100) * (rp - rb);
  }
  // Alpha = perf réelle du fonds (VL) − benchmark composite.
  const alpha = fundPerf != null ? fundPerf - rbTotal : null;
  const delta = alpha != null ? alpha - allocEff - selEff : null;
  const contrib = (x: number | null) =>
    alpha != null && alpha !== 0 && x != null ? (x / alpha) * 100 : null;

  const lignes: { label: string; valeur: number | null }[] = [
    { label: "Effet allocation", valeur: allocEff },
    { label: "Effet sélection", valeur: selEff },
    { label: "Delta (interaction)", valeur: delta },
    { label: "Alpha", valeur: alpha },
  ];
  const td = "px-3 py-2 text-right font-mono";
  const cTone = (n: number | null) =>
    n == null ? "text-slate-300" : n >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
      <div className="px-3 py-2 border-b border-slate-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Récapitulatif de l&apos;analyse de performance
        </h3>
      </div>
      <table className="w-full text-xs max-w-lg">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-slate-500 border-b border-slate-700 bg-slate-900/60">
            <th className="px-3 py-2 text-left font-medium"></th>
            <th className={td}>Valeur</th>
            <th className={td}>Contribution</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr
              key={l.label}
              className={`border-b border-slate-800/60 ${l.label === "Alpha" ? "bg-slate-900/40 font-semibold" : ""}`}
            >
              <td className="px-3 py-2 text-left text-slate-300 font-medium">{l.label}</td>
              <td className={`${td} ${cTone(l.valeur)}`}>{pct(l.valeur)}</td>
              <td className={`${td} text-slate-400`}>{i === 3 ? "100,00 %" : pct(contrib(l.valeur))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-slate-600">
        Alpha = perf. fonds − perf. benchmark = Effet allocation + Effet sélection + Delta
        (interaction). Contribution = effet / Alpha (la somme fait 100 %).
      </p>
    </section>
  );
}

// Tableau d'effet de sélection (Brinson) : effet = poids benchmark × (perf
// fonds − perf benchmark) par classe. Colonnes breakeven : cible de différence
// de performance (éditable) → effet breakeven = poids × cible.
function SelectionEffectTable({
  attr,
  alloc,
  beDiff,
  setBeDiff,
}: {
  attr: AttributionRow[];
  alloc: AllocationRow[];
  beDiff: Record<string, string>;
  setBeDiff: (f: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  const parse = (s: string) => {
    const v = Number((s ?? "").replace(",", "."));
    return Number.isFinite(v) ? v : 0;
  };
  const wbByClasse = new Map(alloc.map((a) => [a.classe, a.wb]));
  const valByClasse = new Map(alloc.map((a) => [a.classe, a.valuation]));
  const rows = attr.map((r) => {
    const wb = wbByClasse.get(r.classe) ?? 0;
    const val = valByClasse.get(r.classe) ?? 0;
    const diff = r.performance != null && r.benchmark != null ? r.performance - r.benchmark : null;
    const effet = diff != null ? (wb * diff) / 100 : null;
    const be = parse(beDiff[r.classe] ?? "");
    const effetBe = (wb * be) / 100;
    // PMV à réaliser = |diff perf − diff perf breakeven| × valorisation (fin).
    const pmv = diff != null ? (Math.abs(diff - be) / 100) * val : null;
    return { r, wb, diff, effet, be, effetBe, pmv };
  });
  const sum = (f: (x: (typeof rows)[number]) => number | null) =>
    rows.reduce((s, x) => s + (f(x) ?? 0), 0);

  const th = "px-2 py-2 text-right font-medium";
  const td = "px-2 py-2 text-right font-mono";
  const cTone = (n: number | null) =>
    n == null ? "text-slate-300" : n >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
      <div className="px-3 py-2 border-b border-slate-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Effet de sélection d&apos;actif
        </h3>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-slate-500 border-b border-slate-700 bg-slate-900/60">
            <th className="px-2 py-2 text-left font-medium">Secteurs</th>
            <th className={th}>Perf. fonds</th>
            <th className={th}>Benchmark</th>
            <th className={th}>Diff. de perf.</th>
            <th className={th}>Poids actif</th>
            <th className={th}>Effet sélection</th>
            <th className={th}>Diff. perf. breakeven</th>
            <th className={th}>Effet breakeven</th>
            <th className={th}>PMV pour breakeven (FCFA)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ r, wb, diff, effet, effetBe, pmv }) => (
            <tr key={r.classe} className="border-b border-slate-800/60">
              <td className="px-2 py-2 text-left text-slate-300 font-medium">{r.classe}</td>
              <td className={`${td} ${cTone(r.performance)}`}>{pct(r.performance)}</td>
              <td className={`${td} ${cTone(r.benchmark)}`}>{pct(r.benchmark)}</td>
              <td className={`${td} ${cTone(diff)}`}>{pct(diff)}</td>
              <td className={`${td} text-slate-400`}>{fmt(wb)} %</td>
              <td className={`${td} ${cTone(effet)}`}>{pct(effet)}</td>
              <td className="px-2 py-1.5 text-right">
                <div className="relative inline-block w-20">
                  <input
                    inputMode="decimal"
                    value={beDiff[r.classe] ?? ""}
                    onChange={(e) => setBeDiff((prev) => ({ ...prev, [r.classe]: e.target.value }))}
                    placeholder="0"
                    className="w-full px-2 py-1 text-[11px] text-right bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </td>
              <td className={`${td} ${cTone(effetBe)}`}>{pct(effetBe)}</td>
              <td className={`${td} text-slate-300`}>{fmt(pmv, 0)}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-700 bg-slate-900/40 font-semibold">
            <td className="px-2 py-2 text-left text-slate-200">TOTAL</td>
            <td className={td}></td>
            <td className={td}></td>
            <td className={td}></td>
            <td className={`${td} text-slate-300`}>{fmt(sum((x) => x.wb))} %</td>
            <td className={`${td} ${cTone(sum((x) => x.effet))}`}>{pct(sum((x) => x.effet))}</td>
            <td className={td}></td>
            <td className={`${td} ${cTone(sum((x) => x.effetBe))}`}>{pct(sum((x) => x.effetBe))}</td>
            <td className={`${td} text-slate-200`}>{fmt(sum((x) => x.pmv), 0)}</td>
          </tr>
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-slate-600">
        Effet sélection = poids benchmark × (perf. fonds − benchmark) par classe. Diff. perf.
        breakeven : cible de surperformance à saisir → effet breakeven = poids benchmark × cible.
        PMV pour breakeven = |diff. perf. − diff. perf. breakeven| × valorisation de la classe
        (inventaire de fin).
      </p>
    </section>
  );
}

// Tableau d'effet d'allocation (Brinson) : effet = (poids actuel − poids
// benchmark) × (perf classe − perf benchmark total). Effets simulés = idem avec
// la pondération objective (éditable) à la place du poids actuel.
function AllocationEffectTable({
  alloc,
  rbTotal,
  objW,
  setObjW,
}: {
  alloc: AllocationRow[];
  rbTotal: number | null;
  objW: Record<string, string>;
  setObjW: (f: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  const parse = (s: string) => {
    const v = Number((s ?? "").replace(",", "."));
    return Number.isFinite(v) ? v : 0;
  };
  const totVal = alloc.reduce((s, a) => s + a.valuation, 0);
  const rows = alloc.map((a) => {
    const diffPerf = a.rbClass != null && rbTotal != null ? a.rbClass - rbTotal : null;
    const diffPoids = a.poids - a.wb;
    const effet = diffPerf != null ? ((a.poids - a.wb) * diffPerf) / 100 : null;
    const wObj = parse(objW[a.classe] ?? String(a.wb));
    const effetSim = diffPerf != null ? ((wObj - a.wb) * diffPerf) / 100 : null;
    return { a, diffPerf, diffPoids, effet, wObj, effetSim };
  });
  const sum = (f: (r: (typeof rows)[number]) => number | null) =>
    rows.reduce((s, r) => s + (f(r) ?? 0), 0);

  const th = "px-2 py-2 text-right font-medium";
  const td = "px-2 py-2 text-right font-mono";
  const cTone = (n: number | null) =>
    n == null ? "text-slate-300" : n >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-x-auto">
      <div className="px-3 py-2 border-b border-slate-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Effet d&apos;allocation d&apos;actif
        </h3>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-slate-500 border-b border-slate-700 bg-slate-900/60">
            <th className="px-2 py-2 text-left font-medium">Actifs</th>
            <th className={th}>Valo. (MFCFA)</th>
            <th className={th}>Alloc. actuelle</th>
            <th className={th}>Perf. classe</th>
            <th className={th}>Diff. de perf.</th>
            <th className={th}>Alloc. benchmark</th>
            <th className={th}>Diff. de poids</th>
            <th className={th}>Effet allocation</th>
            <th className={th}>Pond. objective</th>
            <th className={th}>Effets simulés</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ a, diffPerf, diffPoids, effet, effetSim }) => (
            <tr key={a.classe} className="border-b border-slate-800/60">
              <td className="px-2 py-2 text-left text-slate-300 font-medium">{a.classe}</td>
              <td className={`${td} text-slate-300`}>{fmt(a.valuation / 1_000_000, 0)}</td>
              <td className={`${td} text-slate-300`}>{fmt(a.poids)} %</td>
              <td className={`${td} ${cTone(a.rbClass)}`}>{pct(a.rbClass)}</td>
              <td className={`${td} ${cTone(diffPerf)}`}>{pct(diffPerf)}</td>
              <td className={`${td} text-slate-400`}>{fmt(a.wb)} %</td>
              <td className={`${td} ${cTone(diffPoids)}`}>{fmt(diffPoids)} %</td>
              <td className={`${td} ${cTone(effet)}`}>{pct(effet)}</td>
              <td className="px-2 py-1.5 text-right">
                <div className="relative inline-block w-20">
                  <input
                    inputMode="decimal"
                    value={objW[a.classe] ?? String(a.wb)}
                    onChange={(e) => setObjW((prev) => ({ ...prev, [a.classe]: e.target.value }))}
                    className="w-full px-2 py-1 text-[11px] text-right bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </td>
              <td className={`${td} ${cTone(effetSim)}`}>{pct(effetSim)}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-700 bg-slate-900/40 font-semibold">
            <td className="px-2 py-2 text-left text-slate-200">TOTAL</td>
            <td className={`${td} text-slate-200`}>{fmt(totVal / 1_000_000, 0)}</td>
            <td className={`${td} text-slate-200`}>{fmt(sum((r) => r.a.poids))} %</td>
            <td className={td}></td>
            <td className={td}></td>
            <td className={`${td} text-slate-300`}>{fmt(sum((r) => r.a.wb))} %</td>
            <td className={`${td} ${cTone(sum((r) => r.diffPoids))}`}>{fmt(sum((r) => r.diffPoids))} %</td>
            <td className={`${td} ${cTone(sum((r) => r.effet))}`}>{pct(sum((r) => r.effet))}</td>
            <td className={`${td} text-slate-200`}>{fmt(sum((r) => r.wObj))} %</td>
            <td className={`${td} ${cTone(sum((r) => r.effetSim))}`}>{pct(sum((r) => r.effetSim))}</td>
          </tr>
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-slate-600">
        Effet allocation = (allocation actuelle − allocation benchmark) × (perf. classe − perf.
        benchmark global). Effets simulés = idem avec la pondération objective (éditable). Perf.
        benchmark global = {rbTotal != null ? pct(rbTotal) : "—"}.
      </p>
    </section>
  );
}

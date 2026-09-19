"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  Line,
  LineChart,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import type { SovereignBond } from "@/lib/listedBondsTypes";
import {
  getSovereignCashflows,
  calculateSovereignActuarialMetrics,
} from "@/lib/listedBondsTypes";
import type { UserRole } from "@/lib/auth/userRole";
import MemberGateDialog from "./MemberGateDialog";
import CountryFlag from "./CountryFlag";

// === HELPERS DE FORMATAGE ===
function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatBigFCFA(millions: number): string {
  // Les montants UMOA-Titres sont stockes en MILLIONS de FCFA
  const fcfa = millions * 1_000_000;
  if (fcfa >= 1e12) return (fcfa / 1e12).toFixed(2).replace(".", ",") + " T FCFA";
  if (fcfa >= 1e9) return (fcfa / 1e9).toFixed(1).replace(".", ",") + " Mds FCFA";
  if (fcfa >= 1e6) return (fcfa / 1e6).toFixed(0) + " M FCFA";
  return formatFCFA(fcfa) + " FCFA";
}

function formatDate(date: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateShort(date: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function formatPctSigned(v: number, decimals = 2): string {
  if (!isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(decimals).replace(".", ",")}%`;
}

function formatMaturity(years: number): string {
  if (years < 1) {
    const months = Math.round(years * 12);
    return `${months} mois`;
  }
  return `${years.toFixed(1).replace(".", ",")} ans`;
}

function residualMaturityYears(maturityDate: string): number {
  const mat = new Date(maturityDate).getTime();
  const now = Date.now();
  if (mat <= now) return 0;
  return (mat - now) / (365.25 * 24 * 60 * 60 * 1000);
}

type Props = {
  bond: SovereignBond;
  spread: number | null;
  related: SovereignBond[];
  theoreticalHistory: Array<{ date: string; theoreticalPrice: number; ytm: number }>;
  interCountrySpreads: Array<{
    country: string;
    ytm: number;
    spread: number;
    isTarget: boolean;
  }>;
  userRole: UserRole;
};

type Tab =
  | "overview"
  | "pricing"
  | "adjudications"
  | "cashflow"
  | "risk"
  | "characteristics";

export default function SovereignDetailView({
  bond,
  spread,
  related,
  theoreticalHistory,
  interCountrySpreads,
  userRole,
}: Props) {
  const isMember = userRole !== null;
  const isPremium = userRole === "premium" || userRole === "pro";
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  // Gate dialog : tier "member" (CTA inscription) ou "premium" (CTA upgrade)
  // selon l'onglet verrouille clique.
  const [gateOpen, setGateOpen] = useState(false);
  const [gateMsg, setGateMsg] = useState<string>("");
  const [gateTier, setGateTier] = useState<"member" | "premium">("premium");
  function openGate(msg: string, tier: "member" | "premium") {
    setGateMsg(msg);
    setGateTier(tier);
    setGateOpen(true);
  }

  const last = bond.adjudications[bond.adjudications.length - 1];
  const first = bond.adjudications[0];
  const residual = residualMaturityYears(bond.maturityDate);
  const isExpired = residual <= 0;

  // Date "aujourd'hui" stabilisee au montage du composant (eviter Date.now()
  // pendant le render — recommandation react-hooks/purity).
  const [now] = useState(() => new Date());
  const todayMs = now.getTime();

  // === ECHEANCIER & METRIQUES ACTUARIELLES ===
  const cashflows = useMemo(() => getSovereignCashflows(bond), [bond]);
  const futureCashflows = useMemo(
    () => cashflows.filter((cf) => new Date(cf.date).getTime() > todayMs),
    [cashflows, todayMs]
  );
  const pastCashflowsCount = cashflows.length - futureCashflows.length;
  const nextCashflow = futureCashflows[0];

  // Export Excel du tableau d'amortissement complet (souverain non cote).
  // Meme modele que BondDetailView : bandeau Azimut, metadonnees, lignes
  // de detail avec alternance de fond, ligne totaux, footer methodologie.
  // exceljs lazy-loade au clic pour ne pas alourdir le bundle initial.
  const exportCashflowsXLSX = async () => {
    type Row = {
      date: string;
      capitalDebut: number;
      coupon: number;
      amortissement: number;
      capitalFin: number;
    };
    const rowsByDate = new Map<string, Row>();
    // Reverse-trick : outstandingDebut du 1er flux = outstandingAfter + amort
    // (si non-coupon). Pour les coupons l'outstanding ne bouge pas, donc on
    // remonte directement au nominal du 1er coupon.
    let prevOutstanding =
      cashflows.length > 0
        ? cashflows[0].outstandingAfter +
          (cashflows[0].type !== "coupon" ? cashflows[0].amount : 0)
        : bond.nominalValue;
    for (const cf of cashflows) {
      let row = rowsByDate.get(cf.date);
      if (!row) {
        row = {
          date: cf.date,
          capitalDebut: prevOutstanding,
          coupon: 0,
          amortissement: 0,
          capitalFin: cf.outstandingAfter,
        };
        rowsByDate.set(cf.date, row);
      }
      if (cf.type === "coupon") row.coupon += cf.amount;
      else row.amortissement += cf.amount;
      row.capitalFin = cf.outstandingAfter;
      prevOutstanding = cf.outstandingAfter;
    }
    const rows = Array.from(rowsByDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const totalCoupon = rows.reduce((s, r) => s + r.coupon, 0);
    const totalAmort = rows.reduce((s, r) => s + r.amortissement, 0);

    const ExcelJSMod = await import("exceljs");
    const ExcelJS = ExcelJSMod.default ?? ExcelJSMod;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Azimut Finance";
    wb.created = new Date();
    const ws = wb.addWorksheet("Tableau d'amortissement", {
      views: [{ state: "frozen", ySplit: 9 }],
    });

    ws.columns = [
      { width: 8 },   // N°
      { width: 14 },  // Date
      { width: 12 },  // Statut
      { width: 22 },  // Capital début
      { width: 22 },  // Coupon
      { width: 24 },  // Amortissement
      { width: 22 },  // Annuité totale
      { width: 22 },  // Capital fin
    ];

    // === BANDEAU LOGO AZIMUT ===
    ws.mergeCells("A1:H2");
    const logoCell = ws.getCell("A1");
    logoCell.value = {
      richText: [
        { text: "Azimut", font: { name: "Calibri", size: 22, bold: true, color: { argb: "FF1D4ED8" } } },
        { text: "Finance", font: { name: "Calibri", size: 22, bold: true, color: { argb: "FF0F172A" } } },
      ],
    };
    logoCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    logoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    ws.getRow(1).height = 24;
    ws.getRow(2).height = 24;

    // === TITRE ===
    ws.mergeCells("A3:H3");
    const titleCell = ws.getCell("A3");
    titleCell.value = "Tableau d'amortissement";
    titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF0F172A" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(3).height = 22;

    // === METADONNEES SOUVERAIN ===
    // Pas de "name"/"code" cote SovereignBond : on construit un libelle depuis
    // le type + pays + dates. Couponrate null pour les BAT (zero-coupon).
    const couponPct =
      bond.couponRate != null && bond.couponRate > 0
        ? `${(bond.couponRate * 100).toFixed(2).replace(".", ",")} %`
        : "zéro-coupon";
    const yearStart = bond.firstIssueDate.slice(0, 4);
    const yearEnd = bond.maturityDate.slice(0, 4);
    const amortLabel =
      bond.amortizationType === "Linéaire"
        ? "linéaire"
        : bond.amortizationType === "In Fine"
          ? "in fine"
          : bond.type === "BAT"
            ? "zéro-coupon (bullet)"
            : "—";
    const meta: [string, string][] = [
      ["Titre", `${bond.type} ${bond.country} ${couponPct} ${yearStart}-${yearEnd}`],
      ["ISIN", bond.isin || "—"],
      ["Émetteur", `${bond.countryName} (${bond.country})`],
      [
        "Nominal / Coupon / Fréq.",
        `${bond.nominalValue.toLocaleString("fr-FR")} FCFA · ${couponPct} · annuel`,
      ],
      [
        "Émission → Maturité",
        `${bond.firstIssueDate} → ${bond.maturityDate} · Amort. ${amortLabel}${
          bond.graceYears > 0
            ? ` · différé ${bond.graceYears} an${bond.graceYears > 1 ? "s" : ""}`
            : ""
        }`,
      ],
    ];
    meta.forEach(([k, v], i) => {
      const r = 4 + i;
      ws.getCell(`A${r}`).value = k;
      ws.getCell(`A${r}`).font = { bold: true, color: { argb: "FF475569" }, size: 10 };
      ws.mergeCells(`B${r}:H${r}`);
      ws.getCell(`B${r}`).value = v;
      ws.getCell(`B${r}`).font = { color: { argb: "FF0F172A" }, size: 10 };
    });

    // === EN-TETES TABLEAU (ligne 9) ===
    const headerRow = ws.getRow(9);
    const headers = [
      "N°",
      "Date",
      "Statut",
      "Capital début",
      "Coupon — intérêts",
      "Amortissement — capital",
      "Annuité totale",
      "Capital fin",
    ];
    headers.forEach((h, i) => {
      const c = headerRow.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      c.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });
    headerRow.height = 28;

    // === LIGNES DE DONNEES ===
    const FCFA_FMT = "#,##0.00 \"FCFA\";[Red]-#,##0.00 \"FCFA\"";
    const startRow = 10;
    rows.forEach((r, i) => {
      const isPast = new Date(r.date).getTime() <= todayMs;
      const xlRow = ws.getRow(startRow + i);
      xlRow.getCell(1).value = i + 1;
      xlRow.getCell(2).value = r.date;
      xlRow.getCell(3).value = isPast ? "Versé" : "À venir";
      xlRow.getCell(4).value = r.capitalDebut;
      xlRow.getCell(5).value = r.coupon;
      xlRow.getCell(6).value = r.amortissement;
      xlRow.getCell(7).value = r.coupon + r.amortissement;
      xlRow.getCell(8).value = r.capitalFin;
      [4, 5, 6, 7, 8].forEach((col) => {
        xlRow.getCell(col).numFmt = FCFA_FMT;
      });
      xlRow.getCell(1).alignment = { horizontal: "center" };
      xlRow.getCell(2).alignment = { horizontal: "center" };
      xlRow.getCell(3).alignment = { horizontal: "center" };
      xlRow.getCell(3).font = isPast
        ? { color: { argb: "FF94A3B8" }, italic: true }
        : { color: { argb: "FF1D4ED8" }, bold: true };
      if (i % 2 === 1) {
        for (let col = 1; col <= 8; col++) {
          xlRow.getCell(col).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        }
      }
      for (let col = 1; col <= 8; col++) {
        xlRow.getCell(col).border = {
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      }
    });

    // === LIGNE TOTAUX ===
    const totalRow = ws.getRow(startRow + rows.length);
    totalRow.getCell(1).value = "TOTAL";
    totalRow.getCell(5).value = totalCoupon;
    totalRow.getCell(6).value = totalAmort;
    totalRow.getCell(7).value = totalCoupon + totalAmort;
    [5, 6, 7].forEach((col) => {
      totalRow.getCell(col).numFmt = FCFA_FMT;
    });
    for (let col = 1; col <= 8; col++) {
      totalRow.getCell(col).font = { bold: true, color: { argb: "FF0F172A" } };
      totalRow.getCell(col).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E7FF" },
      };
      totalRow.getCell(col).border = {
        top: { style: "medium", color: { argb: "FF1D4ED8" } },
        bottom: { style: "medium", color: { argb: "FF1D4ED8" } },
      };
    }
    totalRow.getCell(1).alignment = { horizontal: "center" };

    // === FOOTER METHODO ===
    const footerRow = startRow + rows.length + 2;
    ws.mergeCells(`A${footerRow}:H${footerRow}`);
    const footerCell = ws.getCell(`A${footerRow}`);
    footerCell.value = `Convention UMOA-Titres · coupon annuel sur capital restant dû · amortissement ${amortLabel}${
      bond.graceYears > 0 ? ` · différé ${bond.graceYears} an${bond.graceYears > 1 ? "s" : ""}` : ""
    } · valeurs par titre (nominal ${bond.nominalValue.toLocaleString("fr-FR")} FCFA).`;
    footerCell.font = { italic: true, color: { argb: "FF64748B" }, size: 9 };
    footerCell.alignment = { wrapText: true };

    // === DOWNLOAD ===
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // bond.id = ISIN pour OAT, cle composite pour BAT — on sanitize pour le filename.
    const safeId = (bond.isin || bond.id).replace(/[^A-Za-z0-9-]/g, "_");
    a.download = `tableau-amortissement-${safeId}-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Metriques pour le YTM "marche" = lastYield (rendement du dernier round cash)
  const marketMetrics = useMemo(() => {
    if (isExpired) return null;
    return calculateSovereignActuarialMetrics(bond, now, bond.lastYield);
  }, [bond, isExpired, now]);

  // Stress-test taux : impact ΔP ≈ −ModDur × Δy × P + ½ × Conv × Δy² × P
  const stressScenarios = useMemo(() => {
    if (!marketMetrics) return [];
    const shocks = [-200, -100, -50, -25, 0, 25, 50, 100, 200];
    const P = marketMetrics.cleanPrice;
    return shocks.map((bp) => {
      const dy = bp / 10000;
      const linear = -marketMetrics.modified * dy * P;
      const conv = 0.5 * marketMetrics.convexity * dy * dy * P;
      const deltaPrice = linear + conv;
      return {
        bp,
        deltaPrice,
        deltaPct: deltaPrice / P,
        newPrice: P + deltaPrice,
        newYtm: bond.lastYield + dy,
        linear,
        conv,
      };
    });
  }, [marketMetrics, bond.lastYield]);

  // === DONNEES POUR L'ONGLET PRICING ===
  // Série hebdomadaire de prix théorique pied de coupon (calibration UMOA-Titres).
  // Les points d'adjudication ne sont plus superposes — la courbe theorique
  // suffit a la lecture et les valeurs observees sont accessibles dans
  // l'onglet "Adjudications".
  const pricingSeries = useMemo(() => {
    return theoreticalHistory
      .map((t) => ({ date: t.date, theoretical: t.theoreticalPrice }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [theoreticalHistory]);

  // Adjudications triees chronologiquement, avec un index humain (Round 1, 2, ...)
  const orderedAdjudications = useMemo(() => {
    return bond.adjudications
      .slice()
      .sort((a, b) => a.valueDate.localeCompare(b.valueDate))
      .map((a, i) => ({ ...a, roundIndex: i + 1 }));
  }, [bond.adjudications]);

  // Donnees pour le mini-chart d'evolution du yield par round
  const roundsChartData = useMemo(() => {
    return orderedAdjudications.map((a) => ({
      round: `R${a.roundIndex}`,
      date: a.valueDate,
      yield: a.yield * 100,
      coupon: bond.couponRate ? bond.couponRate * 100 : null,
    }));
  }, [orderedAdjudications, bond.couponRate]);

  // Taux d'absorption = montant retenu / montant soumis (part de la demande servie).
  const cashAbsorption =
    bond.cashSubmitted > 0 ? bond.cashAmount / bond.cashSubmitted : 0;

  // Variation par rapport au premier round (si multi-rounds)
  const yieldEvolution = useMemo(() => {
    if (orderedAdjudications.length < 2) return null;
    const firstY = orderedAdjudications[0].yield;
    const lastY = orderedAdjudications[orderedAdjudications.length - 1].yield;
    return { delta: lastY - firstY, firstY, lastY };
  }, [orderedAdjudications]);

  return (
    <>
      {/* ====== HERO ====== */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-5">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
            <div className="flex gap-4 items-start">
              <div className="mt-1">
                <CountryFlag country={bond.country} size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <div className="text-xl md:text-2xl font-semibold">
                    {bond.type} {bond.countryName} · {formatMaturity(bond.maturity)}
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      bond.type === "OAT"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {bond.type}
                  </span>
                  {bond.nbRounds > 1 && (
                    <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-medium">
                      ×{bond.nbRounds} rounds
                    </span>
                  )}
                  {isExpired && (
                    <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded font-medium">
                      Échue
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-600">
                  Trésor de {bond.countryName} · UMOA-Titres
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  ISIN <span className="font-mono">{bond.isin || "—"}</span>
                  {bond.amortizationType && ` · ${bond.amortizationType}`}
                  {bond.graceYears > 0 && ` · différé ${bond.graceYears} an${bond.graceYears > 1 ? "s" : ""}`}
                </div>
              </div>
            </div>
          </div>

          {/* Yield + montant cumule */}
          <div className="flex flex-wrap items-baseline gap-4 md:gap-7 mb-4">
            <div>
              <span className="text-3xl md:text-4xl font-semibold">
                {(bond.lastYield * 100).toFixed(2).replace(".", ",")}%
              </span>
              <span className="text-sm text-slate-500 ml-2">
                rendement dernier round
              </span>
            </div>
            {bond.couponRate != null && (
              <div className="text-sm text-slate-600">
                Coupon nominal :{" "}
                <span className="font-medium text-slate-900">
                  {(bond.couponRate * 100).toFixed(2).replace(".", ",")}%
                </span>
              </div>
            )}
            <div className="text-xs text-slate-400">
              Dernière adjudication : {formatDateShort(bond.lastIssueDate)}
              {!isExpired && (
                <>
                  {" · "}échéance {formatDateShort(bond.maturityDate)}
                  {" · "}résiduelle {formatMaturity(residual)}
                </>
              )}
            </div>
          </div>

          {/* Onglets — gating 3 niveaux :
              · Vue d'ensemble              : guest (toujours ouvert)
              · Adjudications / Échéancier
                / Simulateur / Caracté.     : member (cadenas pour invité)
              · Pricing / Risque & analyt.  : premium (cadenas pour invité+membre) */}
          <div className="flex gap-0 text-sm overflow-x-auto border-b border-slate-200 -mb-px">
            {(
              [
                { id: "overview", label: "Vue d'ensemble", tier: "guest" },
                { id: "pricing", label: "Pricing", tier: "premium" },
                { id: "adjudications", label: `Adjudications (${bond.nbRounds})`, tier: "member" },
                { id: "cashflow", label: "Échéancier & flux", tier: "member" },
                { id: "risk", label: "Risque & analytics", tier: "premium" },
                { id: "characteristics", label: "Caractéristiques", tier: "member" },
              ] as Array<{
                id: Tab;
                label: string;
                tier: "guest" | "member" | "premium";
              }>
            ).map((tab) => {
              const locked =
                (tab.tier === "member" && !isMember) ||
                (tab.tier === "premium" && !isPremium);
              const gateTierForTab: "member" | "premium" =
                tab.tier === "premium" ? "premium" : "member";
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (locked) {
                      openGate(
                        gateTierForTab === "premium"
                          ? `L'onglet « ${tab.label} » est réservé à l'abonnement Premium.`
                          : `L'onglet « ${tab.label} » est réservé aux membres inscrits.`,
                        gateTierForTab,
                      );
                      return;
                    }
                    setActiveTab(tab.id);
                  }}
                  aria-haspopup={locked ? "dialog" : undefined}
                  title={
                    locked
                      ? `${tab.label} — réservé ${gateTierForTab === "premium" ? "Premium" : "aux membres"}`
                      : undefined
                  }
                  className={`px-3 md:px-4 py-3 whitespace-nowrap border-b-2 transition inline-flex items-center gap-1 ${
                    activeTab === tab.id
                      ? "border-blue-700 text-blue-700 font-medium"
                      : "border-transparent text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                  {locked && (
                    <span aria-hidden className="text-[10px]">🔒</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {/* ============================================================ */}
        {/* ONGLET VUE D'ENSEMBLE                                          */}
        {/* ============================================================ */}
        {activeTab === "overview" && (
          <>
            {/* Métriques clés */}
            <section>
              <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">
                Métriques clés
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
                  <div className="text-xs text-blue-700 font-medium mb-1">
                    Rendement dernier round
                  </div>
                  <div className="text-2xl md:text-3xl font-semibold text-blue-900">
                    {(bond.lastYield * 100).toFixed(2).replace(".", ",")}%
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Rendement moyen pondéré · {formatDateShort(bond.lastIssueDate)}
                  </div>
                </div>
                {bond.couponRate != null ? (
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <div className="text-xs text-slate-500 mb-1">Coupon nominal</div>
                    <div className="text-2xl md:text-3xl font-semibold">
                      {(bond.couponRate * 100).toFixed(2).replace(".", ",")}%
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Annuel · {bond.amortizationType || "—"}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <div className="text-xs text-slate-500 mb-1">Type</div>
                    <div className="text-2xl md:text-3xl font-semibold">Zéro-coupon</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Bon assimilable du Trésor (BAT)
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-500 mb-1">Cash levé cumulé</div>
                  <div className="text-2xl md:text-3xl font-semibold">
                    {formatBigFCFA(bond.cashAmount)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Encours estimé :{" "}
                    <span className="font-medium text-slate-700">
                      {formatBigFCFA(bond.outstandingEstimate)}
                    </span>
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-500 mb-1">Taux d&apos;absorption moyen</div>
                  <div className="text-2xl md:text-3xl font-semibold">
                    {cashAbsorption > 0 ? (cashAbsorption * 100).toFixed(2).replace(".", ",") + " %" : "—"}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Cash auctions uniquement
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
              {/* Dernière adjudication */}
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">🔔 Dernière adjudication</h3>
                {last ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Date opération</span>
                      <span className="font-medium">{formatDate(last.tradeDate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Date de valeur</span>
                      <span className="font-medium">{formatDate(last.valueDate)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="text-slate-500">Rendement moyen pondéré</span>
                      <span className="font-medium">
                        {(last.yield * 100).toFixed(2).replace(".", ",")}%
                      </span>
                    </div>
                    {last.marginalYield != null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Taux marginal</span>
                        <span className="font-medium">
                          {(last.marginalYield * 100).toFixed(2).replace(".", ",")}%
                        </span>
                      </div>
                    )}
                    {last.weightedAvgPrice != null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Prix moyen pondéré</span>
                        <span className="font-medium">
                          {formatFCFA(last.weightedAvgPrice)} FCFA
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="text-slate-500">Montant retenu</span>
                      <span className="font-medium">{formatBigFCFA(last.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Taux d&apos;absorption</span>
                      <span className="font-medium">
                        {(last.absorption * 100).toFixed(2).replace(".", ",")} %
                      </span>
                    </div>
                    {last.precisions && (
                      <div className="text-xs text-slate-400 pt-2 italic">
                        {last.precisions}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Aucune adjudication disponible.
                  </p>
                )}
              </section>

              {/* Spread vs courbe pays */}
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">📐 Prime de pricing du round</h3>
                {spread !== null ? (
                  <>
                    <div
                      className={`text-2xl md:text-3xl font-semibold ${
                        spread > 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {formatPctSigned(spread, 2)}
                    </div>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      Écart entre le rendement du dernier round et la courbe primaire
                      UMOA-Titres {bond.country} interpolée à la maturité résiduelle
                      ({formatMaturity(residual)}). Positif (vert) = ce round s&apos;est
                      négocié au-dessus de la courbe ; négatif (rouge) = sous la
                      courbe (signal de demande forte ou pricing serré).
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Spread non calculable (titre échu ou pas assez d&apos;adjudications
                    primaires comparables).
                  </p>
                )}
              </section>

              {/* Évolution des rounds */}
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">📊 Évolution sur les rounds</h3>
                {yieldEvolution ? (
                  <>
                    <div
                      className={`text-2xl md:text-3xl font-semibold ${
                        yieldEvolution.delta > 0
                          ? "text-amber-700"
                          : "text-green-700"
                      }`}
                    >
                      {formatPctSigned(yieldEvolution.delta, 2)}
                    </div>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      Variation du rendement entre le 1er round
                      ({(yieldEvolution.firstY * 100).toFixed(2).replace(".", ",")}%) et
                      le dernier
                      ({(yieldEvolution.lastY * 100).toFixed(2).replace(".", ",")}%).
                      Une dérive positive indique une signature qui s&apos;est tendue
                      au fil des ré-abondements.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Émission unique, pas de comparaison entre rounds.
                  </p>
                )}
              </section>
            </div>

            {/* Identification synthétique */}
            <section className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-lg border border-blue-100 p-4 md:p-6">
              <h3 className="text-base font-medium mb-2">ℹ️ À propos de ce titre</h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {bond.type === "OAT" ? (
                  <>
                    Obligation Assimilable du Trésor émise par l&apos;État de{" "}
                    {bond.countryName} via le marché primaire UMOA-Titres. Coupon{" "}
                    {bond.couponRate != null
                      ? (bond.couponRate * 100).toFixed(2).replace(".", ",") + "%"
                      : "—"}
                    , amortissement {bond.amortizationType || "—"}
                    {bond.graceYears > 0 ? `, différé ${bond.graceYears} ans` : ""}.
                    Émise le {formatDate(bond.firstIssueDate)}, échéance{" "}
                    {formatDate(bond.maturityDate)}.{" "}
                    {describeRoundActivity(bond)}
                  </>
                ) : (
                  <>
                    Bon Assimilable du Trésor (zéro-coupon) émis par l&apos;État
                    de {bond.countryName} via UMOA-Titres. Émission le{" "}
                    {formatDate(bond.firstIssueDate)}, remboursement à
                    l&apos;échéance le {formatDate(bond.maturityDate)}.{" "}
                    {describeRoundActivity(bond)}
                  </>
                )}
              </p>
            </section>
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET PRICING                                                 */}
        {/* ============================================================ */}
        {activeTab === "pricing" && (
          <>
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-medium">📈 Prix théorique</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {theoreticalHistory.length} points hebdomadaires + {
                      bond.adjudications.filter(
                        (a) => a.weightedAvgPrice != null || a.marginalPrice != null
                      ).length
                    } prix d&apos;adjudication observés
                  </p>
                </div>
                <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                  EXCLUSIVITÉ AZIMUT
                </span>
              </div>
              {pricingSeries.length > 0 ? (
                <div className="h-72 md:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={pricingSeries}>
                      <defs>
                        <linearGradient id="sovPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#9333ea" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#9333ea" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        stroke="#94a3b8"
                        fontSize={11}
                        tickFormatter={(d) => formatDateShort(d as string)}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => formatFCFA(Number(v))}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                        formatter={(value, name) => {
                          const v = Number(value ?? 0);
                          if (!isFinite(v) || v === 0) return ["—", String(name ?? "")];
                          if (name === "theoretical")
                            return [formatFCFA(v) + " FCFA", "Prix théorique"];
                          return [String(value ?? "—"), String(name ?? "")];
                        }}
                        labelFormatter={(d) => formatDate(d as string)}
                      />
                      <ReferenceLine
                        y={bond.nominalValue}
                        stroke="#94a3b8"
                        strokeDasharray="3 3"
                        label={{
                          value: "Pair",
                          position: "right",
                          fill: "#64748b",
                          fontSize: 10,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="theoretical"
                        stroke="#9333ea"
                        strokeWidth={2}
                        fill="url(#sovPrice)"
                        connectNulls
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-sm text-slate-500">
                  Pas de série de prix disponible (titre échu ou pas de calibration).
                </div>
              )}
            </section>

            {marketMetrics && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">
                  💰 Prix actuariel au YTM marché
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Prix pied de coupon</div>
                    <div className="text-2xl font-semibold">
                      {formatFCFA(marketMetrics.cleanPrice)}
                    </div>
                    <div className="text-xs text-slate-400">FCFA / titre</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Coupon couru</div>
                    <div className="text-2xl font-semibold">
                      {formatFCFA(marketMetrics.accruedInterest)}
                    </div>
                    <div className="text-xs text-slate-400">FCFA / titre</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Prix coupon couru</div>
                    <div className="text-2xl font-semibold text-blue-900">
                      {formatFCFA(marketMetrics.dirtyPrice)}
                    </div>
                    <div className="text-xs text-slate-400">FCFA réel / titre</div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET ADJUDICATIONS                                           */}
        {/* ============================================================ */}
        {activeTab === "adjudications" && (
          <>
            {orderedAdjudications.length > 1 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <div>
                    <h3 className="text-base font-medium">
                      📈 Évolution du rendement par round
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Rendement moyen pondéré à chaque adjudication.
                      {bond.couponRate != null &&
                        " Trait pointillé = coupon nominal."}
                    </p>
                  </div>
                </div>
                <div className="h-56 md:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={roundsChartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="round"
                        stroke="#94a3b8"
                        fontSize={11}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        unit="%"
                        domain={[
                          (dataMin: number) => Math.max(0, Math.floor(dataMin - 0.5)),
                          (dataMax: number) => Math.ceil(dataMax + 0.5),
                        ]}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                        formatter={(value, name) => {
                          const v = Number(value ?? 0);
                          if (name === "yield")
                            return [v.toFixed(2).replace(".", ",") + "%", "Rendement"];
                          if (name === "coupon")
                            return [
                              v.toFixed(2).replace(".", ",") + "%",
                              "Coupon nominal",
                            ];
                          return [String(value ?? "—"), String(name ?? "")];
                        }}
                        labelFormatter={(round, payload) => {
                          const d = payload?.[0]?.payload?.date as string;
                          return `${round} · ${formatDate(d)}`;
                        }}
                      />
                      {bond.couponRate != null && (
                        <ReferenceLine
                          y={bond.couponRate * 100}
                          stroke="#94a3b8"
                          strokeDasharray="3 3"
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="yield"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#2563eb" }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div>
                  <h3 className="text-base font-medium">
                    📜 Historique des adjudications
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chaque ligne = un round (initial ou ré-abondement)
                  </p>
                </div>
                <div className="text-xs text-slate-500 flex gap-3">
                  <span>{bond.nbRounds} round{bond.nbRounds > 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>Cumul : {formatBigFCFA(bond.totalAmount)}</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-2 py-2 font-medium">#</th>
                      <th className="text-left px-2 py-2 font-medium">Date opération</th>
                      <th className="text-left px-2 py-2 font-medium hidden md:table-cell">
                        Date valeur
                      </th>
                      <th className="text-left px-2 py-2 font-medium">Nature</th>
                      <th className="text-left px-2 py-2 font-medium hidden lg:table-cell">
                        Type
                      </th>
                      <th className="text-right px-2 py-2 font-medium">
                        Rendement
                      </th>
                      <th className="text-right px-2 py-2 font-medium hidden md:table-cell">
                        Taux marginal
                      </th>
                      <th className="text-right px-2 py-2 font-medium hidden lg:table-cell">
                        Prix moyen
                      </th>
                      <th className="text-right px-2 py-2 font-medium">
                        Soumis
                      </th>
                      <th className="text-right px-2 py-2 font-medium">
                        Retenu
                      </th>
                      <th className="text-right px-2 py-2 font-medium">
                        Absorption
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedAdjudications.map((a) => (
                      <tr
                        key={`${a.valueDate}-${a.roundIndex}`}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-2 py-2 text-xs">
                          <span className="text-slate-500">R</span>
                          {a.roundIndex}
                          {a.roundIndex === 1 && (
                            <span className="ml-1 text-[10px] px-1 py-0.5 bg-blue-50 text-blue-700 rounded">
                              initial
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {formatDateShort(a.tradeDate)}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap hidden md:table-cell">
                          {formatDateShort(a.valueDate)}
                        </td>
                        <td className="px-2 py-2">
                          {a.kind === "cash_auction" ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                              Cash
                            </span>
                          ) : a.kind === "swap" ? (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700"
                              title="Échange / Rachat simultané — pas de cash neuf"
                            >
                              Swap
                            </span>
                          ) : (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                              title="Rachat — sortie de dette"
                            >
                              Rachat
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-xs hidden lg:table-cell text-slate-600">
                          {a.precisions || "—"}
                        </td>
                        <td className="px-2 py-2 text-right font-medium">
                          {(a.yield * 100).toFixed(2).replace(".", ",")}%
                        </td>
                        <td className="px-2 py-2 text-right hidden md:table-cell">
                          {a.marginalYield != null
                            ? (a.marginalYield * 100).toFixed(2).replace(".", ",") + "%"
                            : "—"}
                        </td>
                        <td className="px-2 py-2 text-right hidden lg:table-cell">
                          {a.weightedAvgPrice != null
                            ? formatFCFA(a.weightedAvgPrice)
                            : "—"}
                        </td>
                        <td className="px-2 py-2 text-right text-xs">
                          {formatBigFCFA(a.amountSubmitted)}
                        </td>
                        <td className="px-2 py-2 text-right text-xs font-medium">
                          {formatBigFCFA(a.amount)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              a.absorption >= 0.9
                                ? "bg-green-50 text-green-700"
                                : a.absorption >= 0.6
                                ? "bg-blue-50 text-blue-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {(a.absorption * 100).toFixed(2).replace(".", ",")} %
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed space-y-1">
                <div>
                  <strong>Taux d&apos;absorption</strong> = montant retenu / montant soumis :
                  part de la demande effectivement servie par l&apos;État (100 % = tout
                  le soumis a été retenu). <strong>Taux marginal</strong> = taux le plus
                  élevé accepté à l&apos;adjudication ; <strong>Rendement moyen
                  pondéré</strong> = moyenne pondérée par les montants alloués.
                </div>
                <div>
                  <strong>Nature</strong> :{" "}
                  <span className="text-blue-700">Cash</span> = adjudication compétitive
                  avec entrée de cash neuf · <span className="text-amber-700">Swap</span> =
                  échange ou rachat simultané (pas de cash, rendement mécanique non
                  comparable au marché) · <span className="text-slate-600">Rachat</span> =
                  sortie de dette. Seuls les rounds <strong>Cash</strong> entrent dans le
                  KPI &quot;Cash levé cumulé&quot; et dans la calibration de la courbe
                  des taux pays.
                </div>
              </div>
            </section>
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET ÉCHÉANCIER & FLUX                                       */}
        {/* ============================================================ */}
        {activeTab === "cashflow" && (
          <>
            {nextCashflow && (
              <section className="bg-blue-50 border border-blue-100 rounded-lg p-4 md:p-5">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-blue-700 font-medium mb-1">
                      Prochain flux
                    </div>
                    <div className="text-lg md:text-xl font-semibold">
                      {formatDate(nextCashflow.date)}
                    </div>
                    <div className="text-sm text-slate-600 mt-1 capitalize">
                      {nextCashflow.type === "coupon"
                        ? "Coupon"
                        : nextCashflow.type === "amortissement"
                        ? "Amortissement"
                        : "Remboursement final"}
                      {" · "}
                      {formatFCFA(nextCashflow.amount)} FCFA / titre
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    Capital restant après :{" "}
                    <span className="font-medium">
                      {formatFCFA(nextCashflow.outstandingAfter)} FCFA
                    </span>
                  </div>
                </div>
              </section>
            )}

            {cashflows.length > 0 ? (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <h3 className="text-base font-medium">📅 Échéancier complet des flux</h3>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="text-xs text-slate-500 flex gap-3">
                      <span>{pastCashflowsCount} versés</span>
                      <span>·</span>
                      <span>{futureCashflows.length} à venir</span>
                    </div>
                    <button
                      type="button"
                      onClick={exportCashflowsXLSX}
                      className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-1.5"
                      title="Télécharger le tableau d'amortissement au format Excel (.xlsx)"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-3.5 h-3.5"
                      >
                        <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                        <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                      </svg>
                      Exporter Excel
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-200">
                        <th className="text-left py-2 px-2 font-medium">Statut</th>
                        <th className="text-left py-2 px-2 font-medium">Date</th>
                        <th className="text-left py-2 px-2 font-medium">Type</th>
                        <th className="text-right py-2 px-2 font-medium">
                          Montant par titre
                        </th>
                        <th className="text-right py-2 px-2 font-medium hidden md:table-cell">
                          Capital restant
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashflows.map((cf, i) => {
                        const isPast = new Date(cf.date).getTime() <= todayMs;
                        return (
                          <tr
                            key={i}
                            className={`border-b border-slate-100 hover:bg-slate-50 ${
                              isPast ? "opacity-60" : ""
                            }`}
                          >
                            <td className="py-2 px-2">
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  isPast
                                    ? "bg-slate-100 text-slate-500"
                                    : "bg-blue-50 text-blue-700"
                                }`}
                              >
                                {isPast ? "Versé" : "À venir"}
                              </span>
                            </td>
                            <td className="py-2 px-2">{formatDate(cf.date)}</td>
                            <td className="py-2 px-2">
                              {cf.type === "coupon" ? (
                                <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                                  💰 Coupon
                                </span>
                              ) : cf.type === "amortissement" ? (
                                <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                                  📉 Amortissement
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded">
                                  🏁 Remboursement final
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-right font-medium">
                              {formatFCFA(cf.amount)} FCFA
                            </td>
                            <td className="py-2 px-2 text-right hidden md:table-cell text-xs text-slate-500">
                              {formatFCFA(cf.outstandingAfter)} FCFA
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-500">
                Aucun flux n&apos;a pu être généré (données incomplètes).
              </div>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET RISQUE & ANALYTICS                                      */}
        {/* ============================================================ */}
        {activeTab === "risk" && (
          <>
            {marketMetrics ? (
              <>
                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-4">
                    Sensibilité au taux d&apos;intérêt
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Calculé au YTM marché ={" "}
                    {(bond.lastYield * 100).toFixed(2).replace(".", ",")}% (dernier round
                    cash) · prix pied de coupon{" "}
                    {formatFCFA(marketMetrics.cleanPrice)} FCFA.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                    <Stat
                      label="Duration Macaulay"
                      value={marketMetrics.macaulay.toFixed(2).replace(".", ",")}
                      hint="années · maturité moyenne pondérée"
                    />
                    <Stat
                      label="Duration modifiée"
                      value={marketMetrics.modified.toFixed(2).replace(".", ",")}
                      hint="−ΔP/Δy en %"
                    />
                    <Stat
                      label="Convexité"
                      value={marketMetrics.convexity.toFixed(2).replace(".", ",")}
                      hint="terme du second ordre"
                    />
                    <Stat
                      label="BPV (DV01)"
                      value={formatFCFA(marketMetrics.bpv)}
                      hint="FCFA pour +1 bp · par titre"
                    />
                  </div>
                </section>

                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-1">Stress-test taux</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Impact sur le prix pied de coupon en appliquant un choc parallèle de
                    la courbe (approximation duration + convexité).
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                          <th className="text-left px-3 py-2 font-medium">Choc</th>
                          <th className="text-right px-3 py-2 font-medium">YTM résultant</th>
                          <th className="text-right px-3 py-2 font-medium">
                            Variation prix
                          </th>
                          <th className="text-right px-3 py-2 font-medium">Δ prix (%)</th>
                          <th className="text-right px-3 py-2 font-medium">Prix simulé</th>
                          <th className="text-right px-3 py-2 font-medium hidden md:table-cell">
                            Effet duration
                          </th>
                          <th className="text-right px-3 py-2 font-medium hidden md:table-cell">
                            Effet convexité
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {stressScenarios.map((s) => {
                          const isCenter = s.bp === 0;
                          const sign = s.bp > 0 ? "+" : "";
                          return (
                            <tr
                              key={s.bp}
                              className={`border-b border-slate-100 ${
                                isCenter
                                  ? "bg-blue-50/50 font-medium"
                                  : "hover:bg-slate-50"
                              }`}
                            >
                              <td className="px-3 py-2 font-mono">
                                {sign}
                                {s.bp} bps
                              </td>
                              <td className="px-3 py-2 text-right">
                                {(s.newYtm * 100).toFixed(2).replace(".", ",")}%
                              </td>
                              <td
                                className={`px-3 py-2 text-right ${
                                  s.deltaPrice > 0
                                    ? "text-green-700"
                                    : s.deltaPrice < 0
                                    ? "text-red-700"
                                    : "text-slate-500"
                                }`}
                              >
                                {s.deltaPrice >= 0 ? "+" : ""}
                                {formatFCFA(s.deltaPrice)}
                              </td>
                              <td
                                className={`px-3 py-2 text-right ${
                                  s.deltaPct > 0
                                    ? "text-green-700"
                                    : s.deltaPct < 0
                                    ? "text-red-700"
                                    : "text-slate-500"
                                }`}
                              >
                                {formatPctSigned(s.deltaPct, 2)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {formatFCFA(s.newPrice)}
                              </td>
                              <td className="px-3 py-2 text-right hidden md:table-cell text-xs text-slate-500">
                                {s.linear >= 0 ? "+" : ""}
                                {formatFCFA(s.linear)}
                              </td>
                              <td className="px-3 py-2 text-right hidden md:table-cell text-xs text-slate-500">
                                {s.conv >= 0 ? "+" : ""}
                                {formatFCFA(s.conv)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                {interCountrySpreads.length > 1 && (
                  <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                    <h3 className="text-base font-medium mb-1">
                      Spread inter-pays UEMOA
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                      Rendement de chaque courbe pays à la maturité résiduelle (
                      {formatMaturity(residual)}). Permet de positionner ce titre dans
                      le panel souverain UEMOA.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                            <th className="text-left px-3 py-2 font-medium">Pays</th>
                            <th className="text-right px-3 py-2 font-medium">
                              YTM courbe
                            </th>
                            <th className="text-right px-3 py-2 font-medium">
                              Spread vs {bond.country}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {interCountrySpreads.map((r) => (
                            <tr
                              key={r.country}
                              className={`border-b border-slate-100 ${
                                r.isTarget
                                  ? "bg-blue-50/50 font-medium"
                                  : "hover:bg-slate-50"
                              }`}
                            >
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <CountryFlag country={r.country} size={16} />
                                  <span>{r.country}</span>
                                  {r.isTarget && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                      ce titre
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                {(r.ytm * 100).toFixed(2).replace(".", ",")}%
                              </td>
                              <td
                                className={`px-3 py-2 text-right ${
                                  r.isTarget
                                    ? "text-slate-400"
                                    : r.spread > 0
                                    ? "text-green-700"
                                    : "text-red-700"
                                }`}
                              >
                                {r.isTarget ? "—" : formatPctSigned(r.spread, 2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
                      Spread positif (vert) = ce pays paye plus que le pays cible à cette
                      maturité (signature plus risquée ou prime de liquidité plus
                      élevée). Toutes les courbes sont calibrées sur les cash auctions
                      des 3 derniers mois.
                    </div>
                  </section>
                )}
              </>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-500">
                Métriques de risque indisponibles (titre arrivé à échéance).
              </div>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET CARACTÉRISTIQUES                                        */}
        {/* ============================================================ */}
        {activeTab === "characteristics" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 lg:col-span-2">
              <h3 className="text-base font-medium mb-4">📋 Fiche signalétique</h3>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                <Row label="ISIN" value={bond.isin || "—"} mono />
                <Row label="Instrument" value={bond.type} />
                <Row label="Émetteur" value={`Trésor de ${bond.countryName}`} />
                <Row label="Pays" value={`${bond.countryName} (${bond.country})`} />

                <SectionTitle>Caractéristiques financières</SectionTitle>

                <Row
                  label="Coupon nominal"
                  value={
                    bond.couponRate != null
                      ? (bond.couponRate * 100).toFixed(2).replace(".", ",") + "%"
                      : "Zéro-coupon"
                  }
                />
                <Row
                  label="Amortissement"
                  value={bond.amortizationType || "—"}
                />
                <Row
                  label="Différé"
                  value={
                    bond.graceYears > 0
                      ? `${bond.graceYears} an${bond.graceYears > 1 ? "s" : ""}`
                      : "—"
                  }
                />
                <Row label="Fréquence coupon" value={bond.type === "OAT" ? "Annuelle" : "—"} />

                <SectionTitle>Calendrier</SectionTitle>

                <Row label="1er round" value={formatDate(bond.firstIssueDate)} />
                <Row label="Dernier round" value={formatDate(bond.lastIssueDate)} />
                <Row label="Échéance" value={formatDate(bond.maturityDate)} />
                <Row
                  label="Maturité initiale"
                  value={formatMaturity(bond.maturity)}
                />
                <Row
                  label="Maturité résiduelle"
                  value={isExpired ? "Échue" : formatMaturity(residual)}
                />

                <SectionTitle>Volumes & demande</SectionTitle>

                <Row
                  label="Encours estimé circulant"
                  value={formatBigFCFA(bond.outstandingEstimate)}
                />
                <Row label="Cash levé cumulé" value={formatBigFCFA(bond.cashAmount)} />
                {bond.swapAmount > 0 && (
                  <Row
                    label="Notional créé par swap"
                    value={formatBigFCFA(bond.swapAmount)}
                  />
                )}
                {bond.buybackAmount > 0 && (
                  <Row
                    label="Rachats partiels"
                    value={`− ${formatBigFCFA(bond.buybackAmount)}`}
                  />
                )}
                <Row
                  label="Taux d'absorption moyen (cash)"
                  value={cashAbsorption > 0 ? (cashAbsorption * 100).toFixed(2).replace(".", ",") + " %" : "—"}
                />
                <Row
                  label="Rounds"
                  value={
                    [
                      bond.cashRoundsCount > 0 && `${bond.cashRoundsCount} cash`,
                      bond.swapRoundsCount > 0 &&
                        `${bond.swapRoundsCount} swap${bond.swapRoundsCount > 1 ? "s" : ""}`,
                      bond.buybackRoundsCount > 0 &&
                        `${bond.buybackRoundsCount} rachat${bond.buybackRoundsCount > 1 ? "s" : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" + ") || `${bond.nbRounds}`
                  }
                />

                <SectionTitle>Yields</SectionTitle>

                <Row
                  label="Rendement dernier round cash"
                  value={(bond.lastYield * 100).toFixed(2).replace(".", ",") + "%"}
                />
                <Row
                  label="Rendement moyen pondéré (cash)"
                  value={(bond.avgYield * 100).toFixed(2).replace(".", ",") + "%"}
                />
                {first && (
                  <Row
                    label="Rendement 1er round"
                    value={(first.yield * 100).toFixed(2).replace(".", ",") + "%"}
                  />
                )}
                {bond.buybackAmount > 0 && (
                  <Row
                    label="Yield de sortie moyen (rachats)"
                    value={(bond.avgBuybackYield * 100).toFixed(2).replace(".", ",") + "%"}
                  />
                )}
              </dl>
            </section>

            <div className="space-y-4 md:space-y-6">
              {related.length > 0 && (
                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-3">
                    🇫{bond.country} Autres titres {bond.country}
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    Maturité proche, même émetteur souverain
                  </p>
                  <div className="space-y-2">
                    {related.map((b) => (
                      <Link
                        key={b.id}
                        href={`/souverain/${encodeURIComponent(b.id)}`}
                        className="block p-2.5 rounded-md border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition"
                      >
                        <div className="text-sm font-medium truncate">
                          {b.type} · {formatMaturity(b.maturity)}
                        </div>
                        <div className="text-xs text-slate-500 flex justify-between mt-0.5">
                          <span>
                            {(b.lastYield * 100).toFixed(2).replace(".", ",")}%
                            {b.nbRounds > 1 && ` · ×${b.nbRounds}`}
                          </span>
                          {b.isin && <span className="font-mono">{b.isin}</span>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-slate-400 leading-relaxed pt-2">
          Source : <span className="font-medium text-slate-600">UMOA-Titres</span>.
        </div>

        <div className="pt-2">
          <Link
            href="/marches/souverains-non-cotes"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            ← Retour à la liste des souverains non cotés
          </Link>
        </div>
      </main>

      <MemberGateDialog
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        tier={gateTier}
        title={
          gateTier === "premium"
            ? "Onglet réservé Premium"
            : "Onglet réservé aux membres"
        }
        description={
          gateMsg ||
          (gateTier === "premium"
            ? "Cet onglet de la fiche souveraine est réservé à l'abonnement Premium."
            : "Cet onglet de la fiche souveraine est réservé aux membres inscrits.")
        }
      />
    </>
  );
}

// === Helper : description de l'activite des rounds ===
function describeRoundActivity(bond: SovereignBond): string {
  const parts: string[] = [];
  if (bond.cashRoundsCount === 1) {
    parts.push("Émission unique en cash");
  } else if (bond.cashRoundsCount > 1) {
    parts.push(
      `${bond.cashRoundsCount} émissions cash cumulant ${formatBigFCFA(bond.cashAmount)}`
    );
  }
  if (bond.swapRoundsCount > 0) {
    parts.push(
      `${bond.swapRoundsCount} ${bond.swapRoundsCount > 1 ? "échanges" : "échange"} (${formatBigFCFA(bond.swapAmount)} de notional créé sans cash)`
    );
  }
  if (bond.buybackRoundsCount > 0) {
    parts.push(
      `${bond.buybackRoundsCount} ${bond.buybackRoundsCount > 1 ? "rachats partiels" : "rachat partiel"} pour ${formatBigFCFA(bond.buybackAmount)}`
    );
  }
  if (parts.length === 0) return "";
  const list =
    parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(", ") + " et " + parts[parts.length - 1];
  return `${list}. Encours circulant estimé : ${formatBigFCFA(bond.outstandingEstimate)}.`;
}

// ===== sous-composants =====

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-slate-50/50 rounded-md border border-slate-100 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl md:text-2xl font-semibold mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-medium text-right ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:col-span-2 pt-3 mt-1 border-t border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 font-medium">
      {children}
    </div>
  );
}

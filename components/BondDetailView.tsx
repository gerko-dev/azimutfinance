"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Area,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import type {
  ListedBond,
  ListedBondPrice,
  ListedBondEvent,
} from "@/lib/listedBondsTypes";
import {
  calculateActuarialYTM,
  calculateDuration,
  calculateBPV,
  generateBondLifecycleEvents,
  buildBondCashflowSchedule,
  priceFromYtm,
} from "@/lib/listedBondsTypes";
import type { UserRole } from "@/lib/auth/userRole";
import { commissionsMarche } from "@/lib/bondFees";
import CountryFlag from "./CountryFlag";
import BondHistoryView from "./BondHistoryView";
import LivePriceBadge from "./LivePriceBadge";
import MemberGateDialog from "./MemberGateDialog";
import AddToWatchlistButton from "./watchlist/AddToWatchlistButton";
import { bondHref, isBondMatured } from "@/lib/listedBondsTypes";

// === HELPERS DE FORMATAGE ===
function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatFCFA2(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBigFCFA(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2).replace(".", ",") + " T FCFA";
  if (value >= 1e9) return (value / 1e9).toFixed(1).replace(".", ",") + " Mds FCFA";
  if (value >= 1e6) return (value / 1e6).toFixed(0) + " M FCFA";
  return formatFCFA(value) + " FCFA";
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

// === HELPER : prix pied de coupon a partir d'un YTM cible ===
// Wrapper sur le moteur partage qui gere IF / AC / ACD.
function priceFromYtmActuarial(
  bond: ListedBond,
  operationDate: Date,
  ytm: number
): number {
  return priceFromYtm(bond, operationDate, ytm).cleanPrice;
}

// === HELPER : calcul complet des metriques ===
// Toutes les valeurs derivent de buildBondCashflowSchedule, donc le coupon
// couru est sur capital restant du, et duration / convexite / BPV reflectent
// la cascade d'amortissement reelle.
function computeMetrics(
  bond: ListedBond,
  operationDate: Date,
  cleanPrice: number,
  ytmOverride?: number
) {
  if (bond.yearsToMaturity <= 0 || cleanPrice <= 0) return null;

  const ytm =
    ytmOverride !== undefined
      ? ytmOverride
      : calculateActuarialYTM(bond, operationDate, cleanPrice);

  const { macaulay, modified, convexity } = calculateDuration(bond, operationDate, ytm);

  const sched = buildBondCashflowSchedule(bond, operationDate);
  const accruedInterest =
    sched.daysInPeriod > 0
      ? (sched.periodicCoupon * sched.daysSinceLastCoupon) / sched.daysInPeriod
      : 0;
  const dirtyPrice = cleanPrice + accruedInterest;
  // PV01 sur dirty price (convention UMOA-Titres).
  const bpv = calculateBPV(bond, operationDate, ytm, dirtyPrice);

  const futureCouponDates = sched.futureCashflows
    .filter((cf) => cf.coupon > 0)
    .map((cf) => cf.date);
  const nextCouponDate =
    futureCouponDates.length > 0
      ? futureCouponDates[0]
      : new Date(bond.maturityDate);

  return {
    ytm,
    cleanPrice,
    macaulay,
    modified,
    convexity,
    bpv,
    accruedInterest,
    dirtyPrice,
    daysSinceLastCoupon: sched.daysSinceLastCoupon,
    daysInPeriod: sched.daysInPeriod,
    periodicCoupon: sched.periodicCoupon,
    nextCouponDate,
  };
}

type Props = {
  bond: ListedBond;
  priceHistory: ListedBondPrice[];
  events: ListedBondEvent[];
  similarBonds: ListedBond[];
  theoreticalHistory: Array<{ date: string; theoreticalPrice: number; ytm: number }>;
  signatureSpread: number | null;
  livePrice?: {
    currentPrice: number;
    couponCouru: number;
    lastPaymentDate: string;
    lastPaymentAmount: number;
    fetchedAt: string;
    sessionLabel: string | null;
    isClosed: boolean | null;
  } | null;
  userRole: UserRole;
};

type Tab =
  | "overview"
  | "quotations"
  | "cashflow"
  | "risk"
  | "simulator"
  | "characteristics"
  | "history";

export default function BondDetailView({
  bond,
  priceHistory,
  events,
  similarBonds,
  theoreticalHistory,
  signatureSpread,
  livePrice,
  userRole,
}: Props) {
  const isMember = userRole !== null;
  const matured = isBondMatured(bond);
  const isPremium = userRole === "premium" || userRole === "pro";
  const isPro = userRole === "pro";
  const [premiumGateOpen, setPremiumGateOpen] = useState(false);
  const [premiumGateMsg, setPremiumGateMsg] = useState<string>("");
  // tier du gate ouvert : "member" (CTA inscription) ou "premium" (CTA upgrade).
  // Distingue Onglet Caractéristiques/Échéancier/Simulateur (member) vs
  // Pricing/Risque (premium) selon les regles produit.
  const [premiumGateTier, setPremiumGateTier] = useState<"member" | "premium">(
    "premium",
  );
  const [gateFor, setGateFor] = useState<"watchlist" | "alerte" | null>(null);
  function openPremiumGate(msg: string, tier: "member" | "premium" = "premium") {
    setPremiumGateMsg(msg);
    setPremiumGateTier(tier);
    setPremiumGateOpen(true);
  }

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  /** Fenetre visible du graphique de cours, en jours. null = tout. */
  const [priceRange, setPriceRange] = useState<number | null>(180);
  /** Onglet Pricing : fenetre affichee et courbes activees. La serie
   *  theorique est hebdomadaire et remonte loin — sans selecteur, les
   *  derniers mois sont ecrases par plusieurs annees d'historique. */
  const [quotationsRange, setQuotationsRange] = useState<number | null>(null);
  const [showTheoretical, setShowTheoretical] = useState(true);
  const [showObserved, setShowObserved] = useState(true);
  const [quotationsUnit, setQuotationsUnit] = useState<"fcfa" | "pct">(
    // Meme raison que sur le graphique de la vue d'ensemble : sur un titre
    // amortissable, la courbe en FCFA decroche a chaque tombee de capital
    // sans que le marche ait bouge.
    bond.amortizationMode === "N" && bond.amortizationType !== "IF"
      ? "pct"
      : "fcfa",
  );
  /** Unite du graphique : FCFA, ou pourcentage de la valeur nominale.
   *  Sur un titre amortissable, seul le pourcentage rend la serie
   *  comparable dans le temps — en FCFA la courbe decroche a chaque
   *  tombee de capital sans que le marche ait bouge. */
  const [priceUnit, setPriceUnit] = useState<"fcfa" | "pct">(
    // Sur un titre dont le nominal par titre decroit, la courbe en FCFA
    // decroche a chaque tombee de capital sans que le marche ait bouge. On
    // ouvre donc en pourcentage, quitte a ce que le lecteur bascule.
    bond.amortizationMode === "N" && bond.amortizationType !== "IF"
      ? "pct"
      : "fcfa",
  );

  // Émetteur souverain : l'écart vs courbe UMOA-Titres du pays n'est pas une
  // prime de risque crédit (l'État est comparé à lui-même), mais une prime de
  // liquidité / cotation BRVM vs primaire. On adapte le wording en conséquence.
  const isSovereign =
    bond.issuerType === "Obligation d'Etat" || bond.issuerType === "Sukuk Etat";

  // === PRIX DE MARCHE ===
  const latestHistoricalPrice =
    priceHistory.length > 0
      ? priceHistory.reduce((latest, p) =>
          new Date(p.date) > new Date(latest.date) ? p : latest
        )
      : null;

  const latestTheoretical =
    theoreticalHistory.length > 0
      ? theoreticalHistory[theoreticalHistory.length - 1]
      : null;

  const marketPrice =
    (livePrice && Number.isFinite(livePrice.currentPrice) && livePrice.currentPrice > 0
      ? livePrice.currentPrice
      : null) ||
    latestHistoricalPrice?.cleanPrice ||
    latestTheoretical?.theoreticalPrice ||
    bond.nominalValue;

  // === DATE DE COTATION ===
  // Priorité : date de la dernière session live BRVM > dernier prix CSV >
  // dernier point théorique > aujourd'hui. Le coupon couru est calculé en
  // s'arrêtant à cette date.
  const operationDate = useMemo(() => {
    if (livePrice) {
      // sessionLabel = ex. "Séance du 06/05/2026" — on en extrait la date.
      const m = livePrice.sessionLabel?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) {
        const [, dd, mm, yyyy] = m;
        return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
      }
      // Fallback : timestamp du fetch (tronqué à minuit UTC).
      const fetched = new Date(livePrice.fetchedAt);
      if (!isNaN(fetched.getTime())) {
        return new Date(
          Date.UTC(
            fetched.getUTCFullYear(),
            fetched.getUTCMonth(),
            fetched.getUTCDate()
          )
        );
      }
    }
    if (latestHistoricalPrice) {
      const [y, m, d] = latestHistoricalPrice.date.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
    if (latestTheoretical) {
      const [y, m, d] = latestTheoretical.date.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
  }, [livePrice, latestHistoricalPrice, latestTheoretical]);

  // === METRIQUES MARCHE ===
  const marketMetrics = useMemo(
    () => computeMetrics(bond, operationDate, marketPrice),
    [bond, operationDate, marketPrice]
  );

  // === ETATS DU SIMULATEUR ===
  // Style UMOA-Titres : date de simulation editable, mode YTM par defaut,
  // panneau de frais BRVM/DC-BR/SGI/TPS calcules sur le dirty price.
  const [simPrice, setSimPrice] = useState<number>(marketPrice);
  const [simYtm, setSimYtm] = useState<number>(bond.couponRate);
  // Etats string pour la saisie : evitent le reformatage agressif via
  // .toFixed() a chaque keystroke (qui interrompt la saisie du point decimal).
  // Le canonical (simYtm/simPrice) est mis a jour des qu'un parse reussit.
  // simPriceInput est en FCFA (valeur absolue), simYtmInput en % de coupon.
  const [simYtmInput, setSimYtmInput] = useState<string>(
    (bond.couponRate * 100).toFixed(4)
  );
  const [simPriceInput, setSimPriceInput] = useState<string>(
    marketPrice.toFixed(2)
  );
  const [simMode, setSimMode] = useState<"price" | "ytm">("ytm");
  const [simDate, setSimDate] = useState<Date>(operationDate);
  // Frais en pourcentage du dirty price (conventions place BRVM/UEMOA).
  /** Frais de l'intermediaire : propres a chaque SGI, donc saisissables.
   *  Les commissions BRVM et DC/BR, elles, sont reglementees et calculees
   *  par commissionsMarche() — les rendre editables laisserait croire
   *  qu'elles se negocient. */
  const [feeSGI, setFeeSGI] = useState<number>(0.15);
  const [feeTPS, setFeeTPS] = useState<number>(10); // % applique sur le frais SGI

  /** Parametres de l'operation simulee. */
  const [simSide, setSimSide] = useState<"achat" | "vente">("achat");
  const [simQty, setSimQty] = useState<number>(1000);
  const [simQtyInput, setSimQtyInput] = useState<string>("1000");

  const simMetrics = useMemo(() => {
    if (simMode === "price") {
      return computeMetrics(bond, simDate, simPrice);
    } else {
      const cleanPrice = priceFromYtmActuarial(bond, simDate, simYtm);
      return computeMetrics(bond, simDate, cleanPrice, simYtm);
    }
  }, [bond, simPrice, simYtm, simMode, simDate]);

  // Toggle Prix↔YTM : on transfere la metrique courante vers l'autre mode
  // pour preserver la continuite numerique (l'utilisateur voit le prix
  // correspondant a son YTM saisi, et reciproquement).
  const switchSimMode = (newMode: "price" | "ytm") => {
    if (newMode === simMode || !simMetrics) {
      setSimMode(newMode);
      return;
    }
    if (newMode === "price") {
      setSimPrice(simMetrics.cleanPrice);
      setSimPriceInput(simMetrics.cleanPrice.toFixed(2));
    } else {
      setSimYtm(simMetrics.ytm);
      setSimYtmInput((simMetrics.ytm * 100).toFixed(4));
    }
    setSimMode(newMode);
  };

  // Avertissements de plausibilite (bornes empiriques marche UEMOA).
  const simWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (simMode === "price") {
      if (simPrice < bond.nominalValue * 0.5) {
        warnings.push(
          `Prix saisi inferieur a 50 % du nominal (${formatFCFA(bond.nominalValue * 0.5)} FCFA) — bond distresse ?`
        );
      } else if (simPrice > bond.nominalValue * 1.5) {
        warnings.push(
          `Prix saisi superieur a 150 % du nominal (${formatFCFA(bond.nominalValue * 1.5)} FCFA) — verifier la cotation.`
        );
      }
    } else {
      if (simYtm < 0) {
        warnings.push("YTM negatif — possible mais inhabituel sur le marche UEMOA.");
      } else if (simYtm > 0.25) {
        warnings.push(
          `YTM > 25 % — au-dela des spreads observes en zone UEMOA, verifier la saisie.`
        );
      }
    }
    return warnings;
  }, [simMode, simPrice, simYtm, bond.nominalValue]);

  // === ECHEANCIER DES FLUX ===
  // Source unique : generateBondLifecycleEvents — la même fonction qui alimente
  // le calendrier global (/marches/obligations/calendrier). Garantit l'égalité
  // stricte entre la fiche et le calendrier (montants round2, descriptions,
  // index k/N, capital restant).
  const cashflows = useMemo(() => {
    return generateBondLifecycleEvents(bond)
      .filter(
        (e): e is typeof e & { eventType: "coupon" | "amortissement" | "remboursement" } =>
          e.eventType === "coupon" ||
          e.eventType === "amortissement" ||
          e.eventType === "remboursement"
      )
      .map((e) => ({
        date: e.date,
        type: e.eventType,
        amount: e.amount,
        outstandingAfter: e.outstandingAfter,
        description: e.description,
      }));
  }, [bond]);
  const todayMs = operationDate.getTime();
  const futureCashflows = cashflows.filter((cf) => new Date(cf.date).getTime() > todayMs);
  const pastCashflows = cashflows.filter((cf) => new Date(cf.date).getTime() <= todayMs);
  const nextCashflow = futureCashflows[0];

  // Export du tableau d'amortissement complet au format .xlsx
  // (exceljs lazy-loadé au clic pour ne pas alourdir le bundle initial).
  const exportCashflowsCSV = async () => {
    type Row = {
      date: string;
      capitalDebut: number;
      coupon: number;
      amortissement: number;
      capitalFin: number;
    };
    // `cashflows` contient deja passe + futur (sortie de generateBondLifecycleEvents).
    const allFlows = cashflows;
    const rowsByDate = new Map<string, Row>();
    // outstandingDebut de la 1ere ligne = capital avant le 1er flux. On le
    // reconstruit a partir de outstandingAfter + (amort si non-coupon), ce qui
    // donne le capital initial par titre. Fallback au nominal courant.
    let prevOutstanding =
      allFlows.length > 0
        ? allFlows[0].outstandingAfter +
          (allFlows[0].type !== "coupon" ? allFlows[0].amount : 0)
        : bond.nominalValue;
    for (const cf of allFlows) {
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
      a.date.localeCompare(b.date)
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

    // === BANDEAU LOGO AZIMUT (cellules fusionnées avec rich text) ===
    ws.mergeCells("A1:H2");
    const logoCell = ws.getCell("A1");
    logoCell.value = {
      richText: [
        {
          text: "Azimut",
          font: { name: "Calibri", size: 22, bold: true, color: { argb: "FF1D4ED8" } },
        },
        {
          text: "Finance",
          font: { name: "Calibri", size: 22, bold: true, color: { argb: "FF0F172A" } },
        },
      ],
    };
    logoCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    logoCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF8FAFC" },
    };
    ws.getRow(1).height = 24;
    ws.getRow(2).height = 24;

    // === TITRE DOCUMENT ===
    ws.mergeCells("A3:H3");
    const titleCell = ws.getCell("A3");
    titleCell.value = "Tableau d'amortissement";
    titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF0F172A" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(3).height = 22;

    // === MÉTADONNÉES OBLIGATION ===
    const meta: [string, string][] = [
      ["Émission", `${bond.name} (${bond.code})`],
      ["ISIN", bond.isin],
      ["Émetteur", `${bond.issuer} · ${bond.country}`],
      ["Nominal / Coupon / Fréq.", `${bond.nominalValue.toLocaleString("fr-FR")} FCFA · ${(bond.couponRate * 100).toFixed(2)}% · ${bond.couponFrequency}/an`],
      ["Émission → Maturité", `${bond.issueDate} → ${bond.maturityDate} · Amort. ${bond.amortizationType}`],
    ];
    meta.forEach(([k, v], i) => {
      const r = 4 + i;
      ws.getCell(`A${r}`).value = k;
      ws.getCell(`A${r}`).font = { bold: true, color: { argb: "FF475569" }, size: 10 };
      ws.mergeCells(`B${r}:H${r}`);
      ws.getCell(`B${r}`).value = v;
      ws.getCell(`B${r}`).font = { color: { argb: "FF0F172A" }, size: 10 };
    });

    // === EN-TÊTES TABLEAU (ligne 9) ===
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
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1D4ED8" },
      };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      c.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });
    headerRow.height = 28;

    // === LIGNES DE DONNÉES ===
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

      // Alternance de couleur de fond pour lisibilité.
      if (i % 2 === 1) {
        for (let col = 1; col <= 8; col++) {
          xlRow.getCell(col).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        }
      }
      // Bordures fines
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

    // === FOOTER MÉTHODOLOGIE ===
    const footerRow = startRow + rows.length + 2;
    ws.mergeCells(`A${footerRow}:H${footerRow}`);
    const footerCell = ws.getCell(`A${footerRow}`);
    const amortLabel =
      bond.amortizationType === "IF"
        ? "in fine"
        : bond.amortizationType === "ACD"
        ? "constant différé"
        : "constant";
    footerCell.value = `Convention UEMOA · coupon sur capital restant dû · amortissement ${amortLabel} · valeurs par titre.`;
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
    a.download = `tableau-amortissement-${bond.code}-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // === DONNEES POUR L'ONGLET COTATIONS : merge theorique + observe par date ===
  const quotationsSeries = useMemo(() => {
    const map = new Map<
      string,
      { date: string; theoretical: number | null; observed: number | null }
    >();
    for (const t of theoreticalHistory) {
      map.set(t.date, {
        date: t.date,
        theoretical: t.theoreticalPrice,
        observed: null,
      });
    }
    for (const p of priceHistory) {
      const existing = map.get(p.date);
      if (existing) {
        existing.observed = p.cleanPrice;
      } else {
        map.set(p.date, { date: p.date, theoretical: null, observed: p.cleanPrice });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [theoreticalHistory, priceHistory]);

  // === ONGLET COURS : serie observee, issue de obligations-cotees-prix.csv ===
  // On distingue une SEANCE COTEE (volume > 0, une transaction a eu lieu) d'une
  // simple cotation indicative. Sur le marche obligataire BRVM, tres peu
  // liquide, moins de 4 % des lignes portent un volume : afficher le prix sans
  // cette distinction laisserait croire a une cotation quotidienne active.
  const priceSeries = useMemo(() => {
    return [...priceHistory]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({
        date: p.date,
        cleanPrice: p.cleanPrice,
        dirtyPrice: p.dirtyPrice > 0 ? p.dirtyPrice : null,
        volume: p.volume,
        valeurTransigee: p.valeurTransigee,
        traded: p.volume > 0,
      }));
  }, [priceHistory]);

  // Nominal par titre a une date donnee — indispensable pour comparer deux
  // cours dans le temps, mais SEULEMENT sur les titres en mode N.
  //
  // Deux modes d'amortissement coexistent, et ils se comportent a l'oppose :
  //   mode N  le nominal PAR TITRE decroit, le cours suit mecaniquement.
  //           EOM.O5 : 6 000 -> 4 000, cours 6 000 -> 4 000. Lire -33 % serait
  //           faux, la performance reelle est nulle.
  //   mode T  c'est le NOMBRE DE TITRES qui diminue, la face reste a 10 000
  //           et le cours ne bouge pas. EOS.O10 : nominal restant 9 000 ->
  //           8 000 mais cours stable a 10 000. Diviser par l'encours y
  //           fabriquerait un gain fictif de +12,5 %.
  //
  // On s'appuie donc sur les evenements uniquement en mode N. En mode T le
  // denominateur reste la valeur faciale, comme le fait deja
  // computeCurrentNominalPerTitre.
  const nominalAt = useMemo(() => {
    if (bond.amortizationMode === "T" || bond.amortizationType === "IF") {
      return () => bond.nominalValue;
    }
    const steps = events
      .filter(
        (e) =>
          (e.eventType === "amortissement" || e.eventType === "remboursement") &&
          e.outstandingAfter > 0,
      )
      .map((e) => ({
        date: e.date,
        nominal: e.outstandingAfter,
        amount: e.amount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Convention BRVM : TOUTE obligation cotee est emise a 10 000 FCFA par
    // titre. Le bareme part donc de cette face, et on ne la recale surtout
    // pas. Si le palier calcule pour aujourd'hui ne retombe pas sur
    // bond.nominalValue (nominal restant courant, tenu au referentiel), c'est
    // la FICHE de l'obligation qui est fausse — calendrier d'amortissement mal
    // renseigne. Un recalage rendrait la courbe jolie en dissimulant l'erreur.
    const initial =
      steps.length > 0 ? steps[0].nominal + steps[0].amount : bond.nominalValue;
    // Comparaison STRICTE : le nouveau nominal ne s'applique qu'a
    // partir de la seance SUIVANT la tombee. Verifie sur les cours BRVM —
    // TPCI.O47 cote 4 100 jusqu'au 16/06/2026 inclus (jour de la tombee
    // 4 000 -> 2 000) puis 2 050 le 17/06. Avec un "<=" on divisait 4 100 par
    // 2 000 et la serie affichait 205 % le jour meme, exactement le decrochage
    // que ce mode est cense supprimer.
    return (date: string) => {
      let n = initial;
      for (const s of steps) {
        if (s.date < date) n = s.nominal;
        else break;
      }
      return n > 0 ? n : bond.nominalValue;
    };
  }, [events, bond.nominalValue, bond.amortizationMode, bond.amortizationType]);

  const visiblePriceSeries = useMemo(() => {
    let base = priceSeries;
    if (priceRange !== null && priceSeries.length > 0) {
      const last = priceSeries[priceSeries.length - 1].date;
      const d = new Date(last + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - priceRange);
      const from = d.toISOString().slice(0, 10);
      base = priceSeries.filter((p) => p.date >= from);
    }
    return base.map((p) => {
      const nom = nominalAt(p.date);
      return {
        ...p,
        pctNominal: nom > 0 ? (p.cleanPrice / nom) * 100 : null,
      };
    });
  }, [priceSeries, priceRange, nominalAt]);

  const priceStats = useMemo(() => {
    if (priceSeries.length === 0) return null;
    const first = priceSeries[0];
    const last = priceSeries[priceSeries.length - 1];
    const traded = priceSeries.filter((p) => p.traded);
    const closes = priceSeries.map((p) => p.cleanPrice).filter((v) => v > 0);

    // Amplitude en POURCENTAGE DU NOMINAL. Sur un titre amortissable, un
    // min-max en FCFA melange deux regimes : TPCI.O40 affichait "2 000 -
    // 4 000", qui ne dit rien du marche mais tout de l'amortissement. En
    // pourcentage du nominal restant, les deux bornes redeviennent
    // comparables.
    const pcts = priceSeries
      .map((p) => {
        const n = nominalAt(p.date);
        return n > 0 && p.cleanPrice > 0 ? p.cleanPrice / n : null;
      })
      .filter((v): v is number => v !== null);

    // Variation en pourcentage DU NOMINAL, seule mesure comparable dans le
    // temps sur un titre amortissable.
    const nomFirst = nominalAt(first.date);
    const nomLast = nominalAt(last.date);
    const pctFirst = nomFirst > 0 ? first.cleanPrice / nomFirst : null;
    const pctLast = nomLast > 0 ? last.cleanPrice / nomLast : null;

    return {
      first,
      last,
      sessions: priceSeries.length,
      tradedSessions: traded.length,
      lastTraded: traded.length > 0 ? traded[traded.length - 1] : null,
      totalVolume: traded.reduce((s, p) => s + p.volume, 0),
      min: closes.length ? Math.min(...closes) : 0,
      max: closes.length ? Math.max(...closes) : 0,
      minPct: pcts.length ? Math.min(...pcts) : null,
      maxPct: pcts.length ? Math.max(...pcts) : null,
      nomFirst,
      nomLast,
      amortized: Math.abs(nomLast - nomFirst) > 0.01,
      pctLast,
      change:
        pctFirst && pctLast ? (pctLast - pctFirst) / pctFirst : null,
      rawChange:
        first.cleanPrice > 0
          ? (last.cleanPrice - first.cleanPrice) / first.cleanPrice
          : null,
    };
  }, [priceSeries, nominalAt]);

  const hasObservedPrices = priceHistory.length > 0;
  const liveCleanPrice =
    livePrice && Number.isFinite(livePrice.currentPrice) && livePrice.currentPrice > 0
      ? livePrice.currentPrice
      : null;

  // Domaine Y calé sur l'enveloppe réelle des séries + lignes de référence,
  // avec 2 % de marge haut/bas pour ne pas coller les courbes aux bords.
  /** Fenetre affichee de l'onglet Pricing. On borne a partir du DERNIER
   *  point de la serie et non d'aujourd'hui : le prix theorique est
   *  hebdomadaire et peut s'arreter plusieurs jours avant, auquel cas une
   *  fenetre calee sur le jour courant renverrait un graphique vide. */
  const visibleQuotations = useMemo(() => {
    if (quotationsRange === null || quotationsSeries.length === 0) {
      return quotationsSeries;
    }
    const last = quotationsSeries[quotationsSeries.length - 1].date;
    const d = new Date(last + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - quotationsRange);
    const from = d.toISOString().slice(0, 10);
    return quotationsSeries.filter((r) => r.date >= from);
  }, [quotationsSeries, quotationsRange]);

  /** Les memes points, rapportes au nominal restant a leur date. */
  const quotationsWithPct = useMemo(
    () =>
      visibleQuotations.map((r) => {
        const nom = nominalAt(r.date);
        return {
          ...r,
          pctTheoretical:
            nom > 0 && r.theoretical !== null ? (r.theoretical / nom) * 100 : null,
          pctObserved:
            nom > 0 && r.observed !== null ? (r.observed / nom) * 100 : null,
        };
      }),
    [visibleQuotations, nominalAt],
  );

  const quotationsYDomain = useMemo<[number, number]>(() => {
    const pct = quotationsUnit === "pct";
    const values: number[] = [pct ? 100 : bond.nominalValue];
    if (liveCleanPrice !== null) {
      values.push(
        pct ? (liveCleanPrice / bond.nominalValue) * 100 : liveCleanPrice,
      );
    }
    for (const r of quotationsWithPct) {
      const t = pct ? r.pctTheoretical : r.theoretical;
      const o = pct ? r.pctObserved : r.observed;
      if (showTheoretical && t !== null && Number.isFinite(t)) values.push(t);
      if (showObserved && o !== null && Number.isFinite(o)) values.push(o);
    }
    if (values.length === 0) return [0, bond.nominalValue * 1.1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(max - min, 1);
    return [min - span * 0.02, max + span * 0.02];
  }, [
    quotationsWithPct,
    quotationsUnit,
    showTheoretical,
    showObserved,
    liveCleanPrice,
    bond.nominalValue,
  ]);

  // === STRESS TEST TAUX (Risque & analytics) ===
  // Variation prix ≈ -ModDur × Δy × P + 0.5 × Convex × Δy² × P
  const stressScenarios = useMemo(() => {
    if (!marketMetrics) return [];
    const shocks = [-200, -100, -50, -25, 0, 25, 50, 100, 200];
    return shocks.map((bp) => {
      const dy = bp / 10000;
      const linear = -marketMetrics.modified * dy * marketPrice;
      const conv = 0.5 * marketMetrics.convexity * dy * dy * marketPrice;
      const deltaPrice = linear + conv;
      const newPrice = marketPrice + deltaPrice;
      const deltaPct = deltaPrice / marketPrice;
      const newYtm = marketMetrics.ytm + dy;
      return {
        bp,
        dy,
        deltaPrice,
        deltaPct,
        newPrice,
        newYtm,
        linear,
        conv,
      };
    });
  }, [marketMetrics, marketPrice]);

  // === VARIATION VS SEANCE PRECEDENTE ===
  // Meme lecture que sur la fiche action : dernier cours (live s'il existe,
  // sinon derniere cloture) rapporte a la cloture de la seance d'AVANT.
  //
  // Deux precautions propres a l'obligataire :
  //  - la reference est la derniere cloture STRICTEMENT anterieure a la
  //    seance courante ; quand le live porte la meme date que la derniere
  //    cloture BOC, on remonte donc bien d'une seance au lieu de comparer
  //    un cours a lui-meme ;
  //  - les deux termes sont rapportes au nominal restant. Sans cela, une
  //    tombee de capital tombant entre les deux seances se lirait comme un
  //    decrochage — FBOAD.O2 affichait -21 % le 21/05/2026 alors que le
  //    marche n'avait pas bouge.
  const sessionChange = useMemo(() => {
    if (priceSeries.length === 0) return null;
    const jour = operationDate.toISOString().slice(0, 10);

    const anterieures = priceSeries.filter((p) => p.date < jour);
    const ref = anterieures.length > 0 ? anterieures[anterieures.length - 1] : null;
    if (!ref) return null;

    const courant =
      liveCleanPrice !== null
        ? { date: jour, cleanPrice: liveCleanPrice }
        : priceSeries[priceSeries.length - 1];
    if (courant.date === ref.date || !(courant.cleanPrice > 0)) return null;

    const nomRef = nominalAt(ref.date);
    const nomCourant = nominalAt(courant.date);
    if (!(nomRef > 0) || !(nomCourant > 0)) return null;

    const pctRef = ref.cleanPrice / nomRef;
    const pctCourant = courant.cleanPrice / nomCourant;
    if (!(pctRef > 0)) return null;

    return {
      refDate: ref.date,
      delta: courant.cleanPrice - ref.cleanPrice,
      change: (pctCourant - pctRef) / pctRef,
      // Un amortissement entre les deux seances rend l'ecart en FCFA
      // ininterpretable : on n'affiche alors que le pourcentage.
      amorti: Math.abs(nomCourant - nomRef) > 0.01,
    };
  }, [priceSeries, operationDate, liveCleanPrice, nominalAt]);

  /** Decompte complet de l'operation simulee : de la quantite au montant
   *  reellement regle, puis au rendement une fois les frais payes.
   *
   *  Le rendement net est le seul chiffre qui reponde a la question de
   *  l'investisseur : sur une ligne courte, des frais de 0,3 % amputent le
   *  YTM de plus de 30 points de base — un ecart qui change le classement
   *  de deux lignes voisines. */
  const dealTicket = useMemo(() => {
    if (!simMetrics || !(simQty > 0)) return null;

    const clean = simMetrics.cleanPrice;
    const couru = simMetrics.accruedInterest;
    const dirty = clean + couru;

    const montantBrut = simQty * clean;
    const couruTotal = simQty * couru;
    const montantNegocie = simQty * dirty;

    const com = commissionsMarche(montantNegocie);
    const sgi = (feeSGI / 100) * montantNegocie;
    const tps = (feeTPS / 100) * sgi;
    const fraisTotal = com.total + sgi + tps;

    const regle =
      simSide === "achat"
        ? montantNegocie + fraisTotal
        : montantNegocie - fraisTotal;

    const dirtyEffectif = regle / simQty;
    const cleanEffectif = dirtyEffectif - couru;
    const netMetrics =
      cleanEffectif > 0 ? computeMetrics(bond, simDate, cleanEffectif) : null;

    return {
      clean,
      couru,
      dirty,
      montantBrut,
      couruTotal,
      montantNegocie,
      com,
      sgi,
      tps,
      fraisTotal,
      fraisPct: montantNegocie > 0 ? fraisTotal / montantNegocie : 0,
      regle,
      dirtyEffectif,
      cleanEffectif,
      ytmNet: netMetrics?.ytm ?? null,
      ytmBrut: simMetrics.ytm,
    };
  }, [simMetrics, simQty, simSide, feeSGI, feeTPS, bond, simDate]);

  // === COULEUR DE LA COURBE ===
  // Meme regle que la fiche action : la courbe prend la couleur du sens
  // de la seance — vert a la hausse, rouge a la baisse. Definie ici pour
  // venir APRES sessionChange, dont elle depend.
  const chartColor =
    (sessionChange?.change ?? 0) >= 0 ? "#16a34a" : "#dc2626";

  // === VARIATION DU PRIX MARCHE ===
  const marketDelta = marketPrice - bond.nominalValue;
  const marketDeltaPct = (marketDelta / bond.nominalValue) * 100;
  const marketUp = marketDelta >= 0;

  return (
    <>
      {/* ====== HERO ====== */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-5">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
            {/* Une obligation remboursee reste consultable : historique de prix,
                evenements passes et portefeuilles anterieurs y renvoient. Mais
                rien ne le signalait, et ses indicateurs vivants (rendement,
                prix theorique, duree residuelle) n'ont plus de sens. */}
            {matured && (
              <div className="mb-4 rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
                <b>Obligation échue.</b> Elle est arrivée à maturité le{" "}
                {formatDate(bond.maturityDate)} et a été remboursée. Cette fiche
                reste accessible pour son historique ; le rendement, le prix
                théorique et la durée résiduelle affichés ci-dessous ne sont plus
                d&apos;actualité.
              </div>
            )}

            <div className="flex gap-4 items-start">
              <div className="mt-1">
                <CountryFlag country={bond.country} size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <div className="text-xl md:text-2xl font-semibold">{bond.name}</div>
                  {bond.code && (
                    <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">
                      {bond.code}
                    </span>
                  )}
                  {bond.greenBond && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                      🌱 Green Bond
                    </span>
                  )}
                  {bond.callable && (
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                      📞 Callable
                    </span>
                  )}
                  {matured && (
                    <span className="text-xs px-2 py-0.5 bg-slate-700 text-white rounded font-medium">
                      Échue
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-600">{bond.issuer}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {bond.issuerType} · {bond.sector} · ISIN{" "}
                  <span className="font-mono">{bond.isin}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {isMember ? (
                <AddToWatchlistButton
                  targetType="bond"
                  targetCode={bond.code}
                  targetLabel={bond.issuer}
                  isAuthenticated={true}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setGateFor("watchlist")}
                  aria-haspopup="dialog"
                  title="Watchlist — réservée aux membres"
                  className="px-3 py-1.5 text-xs md:text-sm border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  ★ Watchlist
                  <span aria-hidden className="text-[10px]">🔒</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!isMember) {
                    setGateFor("alerte");
                    return;
                  }
                  // TODO: brancher la creation d'alerte obligataire.
                }}
                aria-haspopup={isMember ? undefined : "dialog"}
                title={
                  isMember ? undefined : "Alertes — réservées aux membres"
                }
                className="px-3 py-1.5 text-xs md:text-sm border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1"
              >
                🔔 Alerte
                {!isMember && (
                  <span aria-hidden className="text-[10px]">🔒</span>
                )}
              </button>
            </div>
          </div>

          {/* Prix de marche */}
          <div className="flex flex-wrap items-baseline gap-4 md:gap-7 mb-4">
            <div>
              <span className="text-3xl md:text-4xl font-semibold">
                {formatFCFA2(marketPrice)}
              </span>
              <span className="text-sm text-slate-500 ml-2">
                FCFA (prix pied de coupon)
              </span>
            </div>
            {/* Variation vs seance precedente, comme sur la fiche action.
                formatPctSigned attend un RATIO : elle multiplie deja par 100. */}
            {sessionChange && (
              <div
                className={`font-medium ${
                  sessionChange.change > 0
                    ? "text-emerald-600"
                    : sessionChange.change < 0
                      ? "text-rose-600"
                      : "text-slate-600"
                }`}
              >
                {sessionChange.amorti ? (
                  <span className="text-base md:text-lg">
                    {formatPctSigned(sessionChange.change)}
                  </span>
                ) : (
                  <>
                    <span className="text-base md:text-lg">
                      {sessionChange.delta > 0 ? "+" : ""}
                      {formatFCFA2(sessionChange.delta)}
                    </span>
                    <span className="text-sm ml-1">
                      ({formatPctSigned(sessionChange.change)})
                    </span>
                  </>
                )}
                <span className="text-xs text-slate-400 ml-2">
                  vs {formatDateShort(sessionChange.refDate)}
                  {sessionChange.amorti && " · hors amortissement"}
                </span>
              </div>
            )}
            {/* Meme convention que le reste du site : hausse en vert.
                Ce bloc etait inverse (rouge au-dessus du pair), ce qui
                affichait une meme variation en vert sur une action et en
                rouge sur une obligation. */}
            <div className={`font-medium ${marketUp ? "text-green-600" : "text-red-600"}`}>
              <span className="text-base md:text-lg">
                {marketUp ? "+" : ""}
                {formatFCFA2(marketDelta)}
              </span>
              <span className="text-sm ml-1">
                ({marketUp ? "+" : ""}
                {marketDeltaPct.toFixed(2).replace(".", ",")}%)
              </span>
              <span className="text-xs text-slate-400 ml-2">vs nominal</span>
            </div>
            {livePrice ? (
              <LivePriceBadge
                sessionLabel={livePrice.sessionLabel}
                isClosed={livePrice.isClosed}
              />
            ) : latestHistoricalPrice ? (
              <div className="text-xs text-slate-400">
                Date de cotation : {formatDateShort(latestHistoricalPrice.date)}
              </div>
            ) : latestTheoretical ? (
              <div className="text-xs text-slate-400">
                Prix théorique au {formatDateShort(latestTheoretical.date)} · calibré UMOA-Titres
              </div>
            ) : (
              <div className="text-xs text-slate-400">Pas de cotation récente</div>
            )}
          </div>

          {/* Onglets — gating 3 niveaux :
              · Vue d'ensemble                  : guest (toujours ouvert)
              · Échéancier & flux / Simulateur
                / Caractéristiques              : member (cadenas pour invité)
              · Pricing / Risque & analytics    : premium (cadenas pour invité+membre)
              · Premium / Pro                   : tout déverrouillé */}
          <div className="flex gap-0 text-sm overflow-x-auto border-b border-slate-200 -mb-px">
            {(
              [
                { id: "overview", label: "Vue d'ensemble", tier: "guest" },
                { id: "quotations", label: "Pricing", tier: "premium" },
                { id: "cashflow", label: "Échéancier & flux", tier: "member" },
                { id: "risk", label: "Risque & analytics", tier: "premium" },
                { id: "simulator", label: "Simulateur", tier: "premium" },
                { id: "history", label: "Historique de cours", tier: "guest" },
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
              const gateTier: "member" | "premium" =
                tab.tier === "premium" ? "premium" : "member";
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (locked) {
                      openPremiumGate(
                        gateTier === "premium"
                          ? `L'onglet « ${tab.label} » est réservé à l'abonnement Premium.`
                          : `L'onglet « ${tab.label} » est réservé aux membres inscrits.`,
                        gateTier,
                      );
                      return;
                    }
                    setActiveTab(tab.id);
                  }}
                  aria-haspopup={locked ? "dialog" : undefined}
                  title={
                    locked
                      ? `${tab.label} — réservé ${gateTier === "premium" ? "Premium" : "aux membres"}`
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
            {/* Cours — remonte de l'ancien onglet dedie, en tete de la vue
                d'ensemble. Sur une ligne sans historique on n'affiche RIEN
                plutot qu'un encart vide : en tete de page il repousserait les
                metriques sans rien apprendre. L'onglet Historique porte deja
                son propre message pour ce cas. */}
            {priceStats !== null && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* Graphique — gabarit de la fiche action : deux tiers de la
                    largeur, la carte de donnees occupant le tiers restant. */}
                <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                    <div>
                      <h3 className="text-base font-medium">Historique du cours</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {visiblePriceSeries.length} séances · Source : BOC BRVM
                      </p>
                    </div>
                    <div className="flex gap-1.5 text-xs flex-wrap">
                      {[
                        { l: "1M", d: 30 },
                        { l: "3M", d: 90 },
                        { l: "6M", d: 180 },
                        { l: "Tout", d: null },
                      ].map((r) => (
                        <button
                          key={r.l}
                          onClick={() => setPriceRange(r.d)}
                          className={`px-2.5 py-1 rounded border ${
                            priceRange === r.d
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {r.l}
                        </button>
                      ))}
                      <span className="self-center text-slate-300">|</span>
                      {[
                        { l: "FCFA", u: "fcfa" as const },
                        { l: "% VN", u: "pct" as const },
                      ].map((m) => (
                        <button
                          key={m.u}
                          onClick={() => setPriceUnit(m.u)}
                          className={`px-2.5 py-1 rounded border ${
                            priceUnit === m.u
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {m.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-64 md:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={visiblePriceSeries}>
                        <defs>
                          <linearGradient
                            id="bondGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={chartColor}
                              stopOpacity={0.25}
                            />
                            <stop
                              offset="100%"
                              stopColor={chartColor}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          fontSize={11}
                          tickFormatter={(date) => {
                            const d = new Date(date);
                            return d.toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                            });
                          }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          fontSize={11}
                          domain={
                            priceUnit === "pct"
                              ? ["dataMin - 2", "dataMax + 2"]
                              : ["dataMin - 100", "dataMax + 100"]
                          }
                          tickFormatter={(v) =>
                            priceUnit === "pct"
                              ? `${Number(v).toFixed(0)} %`
                              : formatFCFA(Number(v))
                          }
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
                            if (!isFinite(v)) return ["—", name];
                            if (name === "pctNominal") {
                              return [
                                v.toFixed(2).replace(".", ",") + " %",
                                "Cours en % de la VN",
                              ];
                            }
                            return [formatFCFA(v) + " FCFA", "Cours"];
                          }}
                          labelFormatter={(date) =>
                            new Date(date as string).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                            })
                          }
                        />
                        <ReferenceLine
                          y={priceUnit === "pct" ? 100 : bond.nominalValue}
                          stroke="#94a3b8"
                          strokeDasharray="4 4"
                          label={{
                            value:
                              priceUnit === "pct" ? "Pair (100 %)" : "Nominal",
                            position: "insideTopRight",
                            fontSize: 10,
                            fill: "#64748b",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey={
                            priceUnit === "pct" ? "pctNominal" : "cleanPrice"
                          }
                          stroke={chartColor}
                          strokeWidth={2}
                          fill="url(#bondGradient)"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Bandeau sous le graphique, a la place des statistiques
                      52 semaines de la fiche action. */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
                    <div>
                      <div className="text-xs text-slate-500">Plus haut</div>
                      <div className="text-sm font-medium">
                        {priceStats.amortized && priceStats.maxPct !== null
                          ? (priceStats.maxPct * 100)
                              .toFixed(1)
                              .replace(".", ",") + " %"
                          : formatFCFA(priceStats.max)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Plus bas</div>
                      <div className="text-sm font-medium">
                        {priceStats.amortized && priceStats.minPct !== null
                          ? (priceStats.minPct * 100)
                              .toFixed(1)
                              .replace(".", ",") + " %"
                          : formatFCFA(priceStats.min)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">
                        Séances avec échange
                      </div>
                      <div className="text-sm font-medium">
                        {priceStats.tradedSessions} / {priceStats.sessions}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Volume échangé</div>
                      <div className="text-sm font-medium">
                        {priceStats.totalVolume > 0
                          ? formatFCFA(priceStats.totalVolume) + " titres"
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Carte donnees cles, a droite comme sur la fiche action. */}
                <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-4">Données clés</h3>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Nominal actuel</dt>
                      <dd className="font-medium">
                        {formatFCFA(bond.nominalValue)} FCFA
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Coupon</dt>
                      <dd className="font-medium">
                        {(bond.couponRate * 100).toFixed(2).replace(".", ",")}% ·{" "}
                        {bond.couponFrequency}/an
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Encours</dt>
                      <dd className="font-medium">
                        {formatFCFA(bond.outstanding)} FCFA
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Échéance</dt>
                      <dd className="font-medium">
                        {formatDateShort(bond.maturityDate)}
                      </dd>
                    </div>
                    <div className="flex justify-between pt-3 border-t border-slate-100">
                      <dt className="text-slate-500">Dernier échange</dt>
                      <dd className="font-medium">
                        {priceStats.lastTraded
                          ? formatDateShort(priceStats.lastTraded.date)
                          : "aucun"}
                      </dd>
                    </div>
                    {priceStats.lastTraded && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Volume ce jour-là</dt>
                        <dd className="font-medium">
                          {formatFCFA(priceStats.lastTraded.volume)} titres
                        </dd>
                      </div>
                    )}
                  </dl>

                  {/* Le marche obligataire BRVM est tres peu liquide : sans
                      cette mention, un cours quotidien se lit comme une
                      cotation active alors qu'il est le plus souvent
                      indicatif. */}
                  <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-100">
                    {priceStats.tradedSessions === 0
                      ? "Aucune transaction sur la période : les cours affichés sont des cotations indicatives, sans échange en face."
                      : "Les séances sans échange portent une cotation indicative, reportée de la veille."}
                  </p>
                </div>
              </div>
            )}
            {marketMetrics && (
              <section>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
                    Métriques de marché
                  </h2>
                  <span className="text-xs text-slate-400">
                    Basées sur le prix marché : {formatFCFA2(marketPrice)} FCFA
                  </span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                  <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
                    <div className="text-xs text-blue-700 font-medium mb-1">YTM actuariel</div>
                    <div className="text-2xl md:text-3xl font-semibold text-blue-900">
                      {(marketMetrics.ytm * 100).toFixed(2).replace(".", ",")}%
                    </div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <div className="text-xs text-slate-500 mb-1">Duration modifiée</div>
                    <div className="text-2xl md:text-3xl font-semibold">
                      {marketMetrics.modified.toFixed(2).replace(".", ",")}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      années · sensibilité aux taux
                    </div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <div className="text-xs text-slate-500 mb-1">Convexité</div>
                    <div className="text-2xl md:text-3xl font-semibold">
                      {marketMetrics.convexity.toFixed(2).replace(".", ",")}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Courbure prix-taux</div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <div className="text-xs text-slate-500 mb-1">BPV (par titre)</div>
                    <div className="text-2xl md:text-3xl font-semibold">
                      {formatFCFA2(marketMetrics.bpv)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">FCFA pour +1 bp</div>
                  </div>
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
              {/* Coupon couru / prochain coupon */}
              {marketMetrics && (
                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-3">Prochain coupon</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Date</span>
                      <span className="font-medium">
                        {formatDate(marketMetrics.nextCouponDate.toISOString().slice(0, 10))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Montant par titre</span>
                      <span className="font-medium">
                        {formatFCFA2(marketMetrics.periodicCoupon)} FCFA
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="text-slate-500">Coupon couru</span>
                      <span className="font-medium">
                        {formatFCFA2(marketMetrics.accruedInterest)} FCFA
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Avancement</span>
                      <span>
                        {marketMetrics.daysSinceLastCoupon}/{marketMetrics.daysInPeriod} j
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* Spread signature / Prime cotation BRVM */}
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">
                  {isSovereign ? "📐 Prime cotation BRVM" : "📐 Spread de signature"}
                </h3>
                {signatureSpread !== null ? (
                  <>
                    <div
                      className={`text-2xl md:text-3xl font-semibold ${
                        signatureSpread > 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {formatPctSigned(signatureSpread, 2)}
                    </div>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      {isSovereign
                        ? "Écart entre le YTM coté BRVM et la courbe primaire UMOA-Titres du pays à maturité équivalente. Positif (vert) = rendement coté supérieur au primaire, l'investisseur capte une prime de liquidité ; négatif (rouge) = sous-rémunération vs primaire."
                        : "Écart de YTM vs la courbe souveraine UMOA-Titres du même pays, maturité équivalente. Positif (vert) = rendement supplémentaire perçu par l'investisseur pour le risque crédit assumé ; négatif (rouge) = rendement inférieur au souverain pour un risque pourtant supérieur."}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Spread non calculable : pas de cotation BRVM observée, ou pas assez
                    d&apos;adjudications primaires comparables sur la fenêtre.
                  </p>
                )}
              </section>

              {/* Prix vs nominal */}
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">Prix vs nominal</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Prix marché</span>
                    <span className="font-medium">{formatFCFA2(marketPrice)} FCFA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nominal actuel</span>
                    <span className="font-medium">{formatFCFA(bond.nominalValue)} FCFA</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-100">
                    <span className="text-slate-500">Écart</span>
                    <span
                      className={`font-medium ${marketUp ? "text-green-700" : "text-red-700"}`}
                    >
                      {marketUp ? "+" : ""}
                      {marketDeltaPct.toFixed(2).replace(".", ",")}%
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 pt-1">
                    {Math.abs(marketDeltaPct) < 0.05
                      ? "Cotation au pair"
                      : marketUp
                      ? "Au-dessus du pair (above par)"
                      : "Sous le pair (below par)"}
                  </div>
                </div>
              </section>
            </div>

            {bond.description && (
              <section className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-lg border border-blue-100 p-4 md:p-6">
                <h3 className="text-base font-medium mb-2">ℹ️ À propos de cette obligation</h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {bond.description}
                </p>
              </section>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET COTATIONS                                               */}
        {/* ============================================================ */}
        {activeTab === "history" && (
          <BondHistoryView
            code={bond.code}
            history={priceSeries}
            nominalAt={nominalAt}
            amortized={priceStats?.amortized ?? false}
            userRole={userRole}
          />
        )}

        {activeTab === "quotations" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
                <h3 className="text-base font-medium">
                  Historique du prix théorique
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex gap-1.5 text-xs flex-wrap">
                    {[
                      { l: "1M", d: 30 },
                      { l: "3M", d: 90 },
                      { l: "6M", d: 180 },
                      { l: "1A", d: 365 },
                      { l: "3A", d: 1095 },
                      { l: "Tout", d: null },
                    ].map((r) => (
                      <button
                        key={r.l}
                        onClick={() => setQuotationsRange(r.d)}
                        className={`px-2.5 py-1 rounded border ${
                          quotationsRange === r.d
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {r.l}
                      </button>
                    ))}
                    <span className="self-center text-slate-300">|</span>
                    {[
                      { l: "FCFA", u: "fcfa" as const },
                      { l: "% VN", u: "pct" as const },
                    ].map((m) => (
                      <button
                        key={m.u}
                        onClick={() => setQuotationsUnit(m.u)}
                        className={`px-2.5 py-1 rounded border ${
                          quotationsUnit === m.u
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {m.l}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                    EXCLUSIVITÉ AZIMUT
                  </span>
                </div>
              </div>

              {/* Bascules de courbes, sur le modele des toggles de benchmark
                  de la fiche action : on peut retirer une serie pour lire
                  l'autre seule. */}
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setShowTheoretical(!showTheoretical)}
                  aria-pressed={showTheoretical}
                  className={`text-xs px-2.5 py-1 rounded-md border transition ${
                    showTheoretical
                      ? "border-purple-300 bg-purple-50 text-purple-800"
                      : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-white"
                  }`}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                    style={{
                      backgroundColor: showTheoretical ? "#9333ea" : "#cbd5e1",
                    }}
                  />
                  Prix théorique
                </button>
                {hasObservedPrices && (
                  <button
                    type="button"
                    onClick={() => setShowObserved(!showObserved)}
                    aria-pressed={showObserved}
                    className={`text-xs px-2.5 py-1 rounded-md border transition ${
                      showObserved
                        ? "border-blue-300 bg-blue-50 text-blue-800"
                        : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-white"
                    }`}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                      style={{
                        backgroundColor: showObserved ? "#2563eb" : "#cbd5e1",
                      }}
                    />
                    Prix observé
                  </button>
                )}
              </div>

              {quotationsWithPct.length > 0 ? (
                <div className="h-64 md:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={quotationsWithPct}>
                      <defs>
                        <linearGradient id="bondPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#9333ea" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#9333ea" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        stroke="#94a3b8"
                        fontSize={11}
                        tickFormatter={(date) => {
                          const d = new Date(date);
                          return d.toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                          });
                        }}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        domain={quotationsYDomain}
                        allowDataOverflow={false}
                        tickFormatter={(v) =>
                          quotationsUnit === "pct"
                            ? `${Number(v).toFixed(0)} %`
                            : formatFCFA(Number(v))
                        }
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
                          if (!isFinite(v) || v === 0) return ["—", name];
                          if (name === "theoretical")
                            return [formatFCFA2(v) + " FCFA", "Prix théorique"];
                          if (name === "observed")
                            return [formatFCFA2(v) + " FCFA", "Prix observé"];
                          if (name === "pctTheoretical")
                            return [
                              v.toFixed(2).replace(".", ",") + " %",
                              "Prix théorique (% VN)",
                            ];
                          if (name === "pctObserved")
                            return [
                              v.toFixed(2).replace(".", ",") + " %",
                              "Prix observé (% VN)",
                            ];
                          return [v, name];
                        }}
                        labelFormatter={(date) =>
                          new Date(date as string).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                          })
                        }
                      />
                      <ReferenceLine
                        y={quotationsUnit === "pct" ? 100 : bond.nominalValue}
                        stroke="#94a3b8"
                        strokeDasharray="3 3"
                        label={{
                          value:
                            quotationsUnit === "pct" ? "Pair (100 %)" : "Nominal",
                          position: "right",
                          fill: "#64748b",
                          fontSize: 10,
                        }}
                      />
                      {liveCleanPrice !== null && (
                        <ReferenceLine
                          y={
                            quotationsUnit === "pct"
                              ? (liveCleanPrice / bond.nominalValue) * 100
                              : liveCleanPrice
                          }
                          stroke="#0f172a"
                          strokeWidth={1.8}
                          ifOverflow="extendDomain"
                          label={{
                            value: "Prix observé (live BRVM)",
                            position: "insideTopRight",
                            fill: "#0f172a",
                            fontSize: 10,
                          }}
                        />
                      )}
                      {showTheoretical && (
                        <Area
                          type="monotone"
                          dataKey={
                            quotationsUnit === "pct"
                              ? "pctTheoretical"
                              : "theoretical"
                          }
                          stroke="#9333ea"
                          strokeWidth={2}
                          fill="url(#bondPrice)"
                          connectNulls
                        />
                      )}
                      {/* La serie observee figurait dans les donnees et dans
                          l'infobulle, mais aucune courbe ne la tracait : la
                          comparaison que cet onglet promet etait invisible. */}
                      {hasObservedPrices && showObserved && (
                        <Line
                          type="monotone"
                          dataKey={
                            quotationsUnit === "pct"
                              ? "pctObserved"
                              : "observed"
                          }
                          stroke="#2563eb"
                          strokeWidth={1.5}
                          dot={false}
                          connectNulls
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 md:h-72 flex items-center justify-center text-sm text-slate-500">
                  Aucun historique de prix disponible.
                </div>
              )}
            </div>

            {/* Carte donnees cles, a droite comme sur la fiche action. */}
            <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <h3 className="text-base font-medium mb-4">Données clés</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Prix théorique</dt>
                  <dd className="font-medium">
                    {latestTheoretical
                      ? formatFCFA2(latestTheoretical.theoreticalPrice) + " FCFA"
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Prix de marché</dt>
                  <dd className="font-medium">
                    {formatFCFA2(marketPrice)} FCFA
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Écart</dt>
                  <dd
                    className={`font-medium ${
                      !latestTheoretical
                        ? "text-slate-400"
                        : marketPrice >= latestTheoretical.theoreticalPrice
                          ? "text-green-600"
                          : "text-red-600"
                    }`}
                  >
                    {latestTheoretical &&
                    latestTheoretical.theoreticalPrice > 0
                      ? formatPctSigned(
                          (marketPrice - latestTheoretical.theoreticalPrice) /
                            latestTheoretical.theoreticalPrice,
                        )
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between pt-3 border-t border-slate-100">
                  <dt className="text-slate-500">YTM théorique</dt>
                  <dd className="font-medium">
                    {latestTheoretical
                      ? (latestTheoretical.ytm * 100)
                          .toFixed(2)
                          .replace(".", ",") + "%"
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Spread de signature</dt>
                  <dd className="font-medium">
                    {signatureSpread === null
                      ? "—"
                      : formatPctSigned(signatureSpread, 2)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Dernier point</dt>
                  <dd className="font-medium">
                    {latestTheoretical
                      ? formatDateShort(latestTheoretical.date)
                      : "—"}
                  </dd>
                </div>
              </dl>

              <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-100">
                Le prix théorique est calibré sur la courbe des adjudications
                UMOA-Titres. L&apos;écart au prix de marché mesure la prime ou
                la décote que la cote accorde à cette signature.
              </p>
            </div>
          </div>
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
                      {formatFCFA2(nextCashflow.amount)} FCFA / titre
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    Capital restant après :{" "}
                    <span className="font-medium">
                      {formatFCFA2(nextCashflow.outstandingAfter)} FCFA
                    </span>
                  </div>
                </div>
              </section>
            )}

            {cashflows.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <h3 className="text-base font-medium">Échéancier complet des flux</h3>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="text-xs text-slate-500 flex gap-3">
                      <span>{pastCashflows.length} versés</span>
                      <span>·</span>
                      <span>{futureCashflows.length} à venir</span>
                    </div>
                    <button
                      type="button"
                      onClick={exportCashflowsCSV}
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
                              {formatFCFA2(cf.amount)} FCFA
                            </td>
                            <td className="py-2 px-2 text-right hidden md:table-cell text-xs text-slate-500">
                              {formatFCFA2(cf.outstandingAfter)} FCFA
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
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
                      value={formatFCFA2(marketMetrics.bpv)}
                      hint="FCFA pour +1 bp · par titre"
                    />
                  </div>
                </section>

                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-1">
                    Stress-test taux
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Impact sur le prix pied de coupon en appliquant un choc parallèle de
                    la courbe (approximation duration + convexité).
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                          <th className="text-left px-3 py-2 font-medium">Choc taux</th>
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
                                {formatFCFA2(s.deltaPrice)}
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
                                {formatFCFA2(s.newPrice)}
                              </td>
                              <td className="px-3 py-2 text-right hidden md:table-cell text-xs text-slate-500">
                                {s.linear >= 0 ? "+" : ""}
                                {formatFCFA2(s.linear)}
                              </td>
                              <td className="px-3 py-2 text-right hidden md:table-cell text-xs text-slate-500">
                                {s.conv >= 0 ? "+" : ""}
                                {formatFCFA2(s.conv)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-3">
                    {isSovereign ? "Liquidité & signature" : "Risque de signature"}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">
                        {isSovereign ? "Prime cotation BRVM" : "Spread vs souverains"}
                      </div>
                      <div
                        className={`text-2xl font-semibold ${
                          signatureSpread === null
                            ? "text-slate-400"
                            : signatureSpread > 0
                            ? "text-green-700"
                            : "text-red-700"
                        }`}
                      >
                        {signatureSpread !== null
                          ? formatPctSigned(signatureSpread, 2)
                          : "—"}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {isSovereign
                          ? `coté BRVM vs primaire ${bond.country}`
                          : `vs courbe UMOA-Titres ${bond.country}`}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Rating</div>
                      <div className="text-2xl font-semibold">
                        {bond.rating || "—"}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {bond.ratingAgency || "Non noté"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Type d&apos;émetteur</div>
                      <div className="text-base font-medium mt-1">{bond.issuerType}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {bond.issuer} · {bond.country}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-500">
                Métriques de risque indisponibles (obligation arrivée à échéance ou prix
                non valide).
              </div>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET SIMULATEUR                                              */}
        {/* ============================================================ */}
        {activeTab === "simulator" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <div className="lg:col-span-2 space-y-4 md:space-y-6">
              {/* ---------- PARAMETRES ---------- */}
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <h3 className="text-base font-medium">Paramètres de l&apos;opération</h3>
                  <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs">
                    <button
                      onClick={() => setSimSide("achat")}
                      className={`px-3 py-1 rounded transition ${
                        simSide === "achat"
                          ? "bg-white shadow-sm font-medium"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Achat
                    </button>
                    <button
                      onClick={() => setSimSide("vente")}
                      className={`px-3 py-1 rounded transition ${
                        simSide === "vente"
                          ? "bg-white shadow-sm font-medium"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Vente
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      Quantité (titres)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={simQtyInput}
                      onChange={(e) => {
                        setSimQtyInput(e.target.value);
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n > 0) setSimQty(n);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      Date de dénouement
                    </label>
                    <input
                      type="date"
                      value={simDate.toISOString().slice(0, 10)}
                      onChange={(e) => {
                        const d = new Date(e.target.value);
                        if (!isNaN(d.getTime())) setSimDate(d);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-slate-500">
                        {simMode === "ytm" ? "Rendement visé" : "Cours pied de coupon"}
                      </label>
                      <div className="inline-flex rounded bg-slate-100 p-0.5 text-[10px]">
                        <button
                          onClick={() => switchSimMode("ytm")}
                          className={`px-1.5 py-0.5 rounded ${
                            simMode === "ytm" ? "bg-white shadow-sm font-medium" : "text-slate-500"
                          }`}
                        >
                          YTM
                        </button>
                        <button
                          onClick={() => switchSimMode("price")}
                          className={`px-1.5 py-0.5 rounded ${
                            simMode === "price" ? "bg-white shadow-sm font-medium" : "text-slate-500"
                          }`}
                        >
                          Prix
                        </button>
                      </div>
                    </div>
                    {simMode === "ytm" ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={simYtmInput}
                          onChange={(e) => {
                            setSimYtmInput(e.target.value);
                            const n = Number(e.target.value);
                            if (Number.isFinite(n)) setSimYtm(n / 100);
                          }}
                          onBlur={() => {
                            if (Number.isFinite(simYtm)) {
                              setSimYtmInput((simYtm * 100).toFixed(4));
                            }
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500 tabular-nums"
                        />
                        <span className="text-sm text-slate-500">%</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="1"
                          inputMode="decimal"
                          value={simPriceInput}
                          onChange={(e) => {
                            setSimPriceInput(e.target.value);
                            const n = Number(e.target.value);
                            if (Number.isFinite(n)) setSimPrice(n);
                          }}
                          onBlur={() => {
                            if (Number.isFinite(simPrice)) {
                              setSimPriceInput(simPrice.toFixed(2));
                            }
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500 tabular-nums"
                        />
                        <span className="text-sm text-slate-500">FCFA</span>
                      </div>
                    )}
                  </div>
                </div>

                {simWarnings.length > 0 && (
                  <div className="space-y-1">
                    {simWarnings.map((w, i) => (
                      <div
                        key={i}
                        className="text-xs px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800"
                      >
                        {w}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ---------- DECOMPTE ---------- */}
              {dealTicket && (
                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-4">
                    Décompte de l&apos;opération
                  </h3>
                  <div className="border border-slate-200 rounded-md overflow-hidden text-sm">
                    <table className="w-full">
                      <tbody className="divide-y divide-slate-100">
                        <SimRow
                          label={`Montant brut — ${formatFCFA(simQty)} × ${formatFCFA2(dealTicket.clean)}`}
                          value={`${formatFCFA(dealTicket.montantBrut)} FCFA`}
                        />
                        <SimRow
                          label={`Coupon couru — ${formatFCFA2(dealTicket.couru)} par titre`}
                          value={`${formatFCFA(dealTicket.couruTotal)} FCFA`}
                        />
                        <SimRow
                          label="Montant négocié (assiette des commissions)"
                          value={`${formatFCFA(dealTicket.montantNegocie)} FCFA`}
                        />
                      </tbody>
                    </table>

                    <div className="px-3 py-2 bg-slate-50 border-y border-slate-200 text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
                      Commissions réglementées
                    </div>
                    <table className="w-full">
                      <tbody className="divide-y divide-slate-100">
                        <SimRow
                          label={`BRVM — tranche ≤ 1 Md (${formatFCFA(dealTicket.com.t1)}) à 0,050 %`}
                          value={`${formatFCFA(dealTicket.com.brvmT1)} FCFA`}
                        />
                        {dealTicket.com.t2 > 0 && (
                          <SimRow
                            label={`BRVM — tranche > 1 Md (${formatFCFA(dealTicket.com.t2)}) à 0,0375 %`}
                            value={`${formatFCFA(dealTicket.com.brvmT2)} FCFA`}
                          />
                        )}
                        <SimRow
                          label={`DC/BR — tranche ≤ 1 Md (${formatFCFA(dealTicket.com.t1)}) à 0,100 %`}
                          value={`${formatFCFA(dealTicket.com.dcbrT1)} FCFA`}
                        />
                        {dealTicket.com.t2 > 0 && (
                          <SimRow
                            label={`DC/BR — tranche > 1 Md (${formatFCFA(dealTicket.com.t2)}) à 0,050 %`}
                            value={`${formatFCFA(dealTicket.com.dcbrT2)} FCFA`}
                          />
                        )}
                      </tbody>
                    </table>

                    <div className="px-3 py-2 bg-slate-50 border-y border-slate-200 text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
                      Frais d&apos;intermédiation
                    </div>
                    <table className="w-full">
                      <tbody className="divide-y divide-slate-100">
                        <FeeRow
                          label="Courtage SGI"
                          rate={feeSGI}
                          onRate={setFeeSGI}
                          absolute={dealTicket.sgi}
                        />
                        <FeeRow
                          label="TPS"
                          rate={feeTPS}
                          onRate={setFeeTPS}
                          absolute={dealTicket.tps}
                          note="(% sur courtage SGI)"
                        />
                      </tbody>
                    </table>

                    <div className="px-3 py-2 bg-blue-50 border-t border-slate-200 flex justify-between items-center">
                      <span className="text-sm font-medium">
                        {simSide === "achat"
                          ? "Montant total à régler"
                          : "Produit net de la vente"}
                      </span>
                      <span className="text-base font-semibold text-blue-900 tabular-nums">
                        {formatFCFA(dealTicket.regle)} FCFA
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* ---------- ANALYTIQUE ---------- */}
              {simMetrics && (
                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-4">
                    Analytique de la ligne
                  </h3>
                  <div className="border border-slate-200 rounded-md overflow-hidden text-sm">
                    <table className="w-full">
                      <tbody className="divide-y divide-slate-100">
                        <SimRow
                          label="Cours pied de coupon"
                          value={`${formatFCFA2(simMetrics.cleanPrice)} FCFA`}
                        />
                        <SimRow
                          label="Prix plein coupon"
                          value={`${formatFCFA2(simMetrics.dirtyPrice)} FCFA`}
                        />
                        <SimRow
                          label="Duration de Macaulay"
                          value={`${simMetrics.macaulay.toFixed(3)} ans`}
                        />
                        <SimRow
                          label="Duration modifiée"
                          value={simMetrics.modified.toFixed(3)}
                        />
                        <SimRow
                          label="Sensibilité (PV01)"
                          value={`${formatFCFA2(simMetrics.bpv)} FCFA`}
                        />
                        <SimRow
                          label="Convexité"
                          value={simMetrics.convexity.toFixed(4)}
                        />
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Un mouvement de 100 points de base ferait varier la position
                    d&apos;environ{" "}
                    <b>
                      {formatFCFA(
                        Math.abs(simMetrics.bpv) * 100 * simQty,
                      )}{" "}
                      FCFA
                    </b>{" "}
                    sur {formatFCFA(simQty)} titres.
                  </p>
                </section>
              )}
            </div>

            {/* ---------- RECAPITULATIF ---------- */}
            <div className="space-y-4 md:space-y-6">
              {dealTicket && (
                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-4">Récapitulatif</h3>
                  <div className="mb-4">
                    <div className="text-xs text-slate-500 mb-1">
                      {simSide === "achat" ? "À régler" : "À recevoir"}
                    </div>
                    <div className="text-2xl md:text-3xl font-semibold text-blue-900 tabular-nums">
                      {formatFCFA(dealTicket.regle)}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">FCFA</div>
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Frais totaux</dt>
                      <dd className="font-medium tabular-nums">
                        {formatFCFA(dealTicket.fraisTotal)} FCFA
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Poids des frais</dt>
                      <dd className="font-medium tabular-nums">
                        {(dealTicket.fraisPct * 100).toFixed(3).replace(".", ",")}%
                      </dd>
                    </div>
                    <div className="flex justify-between pt-3 border-t border-slate-100">
                      <dt className="text-slate-500">
                        {simSide === "achat" ? "Prix de revient" : "Prix de cession"}
                      </dt>
                      <dd className="font-medium tabular-nums">
                        {formatFCFA2(dealTicket.dirtyEffectif)} FCFA
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Rendement affiché</dt>
                      <dd className="font-medium tabular-nums">
                        {(dealTicket.ytmBrut * 100).toFixed(3).replace(".", ",")}%
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Rendement net de frais</dt>
                      <dd className="font-medium tabular-nums">
                        {dealTicket.ytmNet === null
                          ? "—"
                          : (dealTicket.ytmNet * 100).toFixed(3).replace(".", ",") + "%"}
                      </dd>
                    </div>
                    {dealTicket.ytmNet !== null && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Coût en rendement</dt>
                        <dd className="font-medium tabular-nums text-rose-600">
                          {Math.round(
                            Math.abs(dealTicket.ytmNet - dealTicket.ytmBrut) * 10000,
                          )}{" "}
                          pb
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>
              )}

              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">Barème appliqué</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="text-left py-1 font-medium">Tranche</th>
                        <th className="text-right py-1 font-medium">BRVM</th>
                        <th className="text-right py-1 font-medium">DC/BR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      <tr>
                        <td className="py-1.5">≤ 1 Md FCFA</td>
                        <td className="py-1.5 text-right">0,0500 %</td>
                        <td className="py-1.5 text-right">0,1000 %</td>
                      </tr>
                      <tr>
                        <td className="py-1.5">&gt; 1 Md FCFA</td>
                        <td className="py-1.5 text-right">0,0375 %</td>
                        <td className="py-1.5 text-right">0,0500 %</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  Barème marginal : la fraction de l&apos;opération sous le
                  milliard est commissionnée au premier taux, l&apos;excédent au
                  second. L&apos;assiette est le montant négocié, coupon couru
                  inclus. Le courtage SGI et la TPS varient d&apos;un
                  intermédiaire à l&apos;autre et restent modifiables.
                </p>
              </section>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* ONGLET CARACTÉRISTIQUES                                        */}
        {/* ============================================================ */}
        {activeTab === "characteristics" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 lg:col-span-2">
              <h3 className="text-base font-medium mb-4">Fiche signalétique</h3>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                <Row label="ISIN" value={bond.isin} mono />
                <Row label="Code BRVM" value={bond.code || "—"} />
                <Row label="Émetteur" value={bond.issuer} />
                <Row label="Type" value={bond.issuerType} />
                <Row label="Secteur" value={bond.sector} />
                <Row label="Pays" value={bond.country} />

                <SectionTitle>Caractéristiques financières</SectionTitle>

                <Row
                  label="Nominal actuel"
                  value={formatFCFA(bond.nominalValue) + " FCFA"}
                />
                <Row
                  label="Taux coupon"
                  value={(bond.couponRate * 100).toFixed(2).replace(".", ",") + "%"}
                />
                <Row
                  label="Fréquence"
                  value={
                    bond.couponFrequency === 1
                      ? "Annuelle"
                      : bond.couponFrequency === 2
                      ? "Semestrielle"
                      : "Trimestrielle"
                  }
                />
                <Row
                  label="Type d'amortissement"
                  value={
                    bond.amortizationType === "IF"
                      ? "In Fine"
                      : bond.amortizationType === "ACD"
                      ? "Constant différé"
                      : "Constant"
                  }
                />

                <SectionTitle>Calendrier</SectionTitle>

                <Row label="Date d'émission" value={formatDate(bond.issueDate)} />
                {bond.firstAmortizationDate && (
                  <Row
                    label="1er amortissement"
                    value={formatDate(bond.firstAmortizationDate)}
                  />
                )}
                <Row label="Date d'échéance" value={formatDate(bond.maturityDate)} />
                <Row
                  label="Durée résiduelle"
                  value={bond.yearsToMaturity.toFixed(1).replace(".", ",") + " ans"}
                />

                <SectionTitle>Volume & rating</SectionTitle>

                <Row label="Montant émis" value={formatBigFCFA(bond.totalIssued)} />
                <Row label="Encours" value={formatBigFCFA(bond.outstanding)} />
                {bond.rating && (
                  <Row
                    label="Rating"
                    value={`${bond.rating} (${bond.ratingAgency || "agence non précisée"})`}
                  />
                )}
                {bond.callable && bond.callDate && (
                  <Row label="Date d'appel" value={formatDate(bond.callDate)} />
                )}
              </dl>
            </section>

            <div className="space-y-4 md:space-y-6">
              {similarBonds.length > 0 && (
                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-3">Obligations similaires</h3>
                  <p className="text-xs text-slate-500 mb-3">
                    Même pays, durée résiduelle proche
                  </p>
                  <div className="space-y-2">
                    {similarBonds.map((b) => (
                      <Link
                        key={b.isin}
                        href={bondHref(b)}
                        className="block p-2.5 rounded-md border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition"
                      >
                        <div className="text-sm font-medium truncate">{b.name}</div>
                        <div className="text-xs text-slate-500 flex justify-between mt-0.5">
                          <span>
                            {(b.couponRate * 100).toFixed(2).replace(".", ",")}% ·{" "}
                            {b.yearsToMaturity.toFixed(1).replace(".", ",")} ans
                          </span>
                          <span className="font-mono">{b.isin}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {bond.description && (
                <section className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-lg border border-blue-100 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-2">ℹ️ Description</h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {bond.description}
                  </p>
                </section>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-slate-400 leading-relaxed pt-2">
          Les informations affichées sont indicatives et ne constituent pas un conseil en
          investissement.
        </div>

        <div className="pt-2">
          <Link
            href="/marches/obligations"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            ← Retour à la liste des obligations cotées
          </Link>
        </div>
      </main>

      <MemberGateDialog
        open={gateFor !== null}
        onClose={() => setGateFor(null)}
        title={
          gateFor === "alerte"
            ? "Alertes réservées aux membres"
            : "Watchlist réservée aux membres"
        }
        description={
          gateFor === "alerte"
            ? "Inscrivez-vous gratuitement pour créer des alertes sur les obligations (variation de YTM, échéances, événements)."
            : "Inscrivez-vous gratuitement pour suivre vos obligations préférées et retrouver votre watchlist sur tous vos appareils."
        }
      />
      <MemberGateDialog
        open={premiumGateOpen}
        onClose={() => setPremiumGateOpen(false)}
        tier={premiumGateTier}
        title={
          premiumGateTier === "premium"
            ? "Outils obligataires Premium"
            : "Onglet réservé aux membres"
        }
        description={
          premiumGateMsg ||
          (premiumGateTier === "premium"
            ? "Cet onglet de la fiche obligation est réservé à l'abonnement Premium."
            : "Cet onglet de la fiche obligation est réservé aux membres inscrits.")
        }
      />
    </>
  );
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

// Ligne de resultat du simulateur UMOA-Titres (label gauche / valeur droite).
function SimRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="px-3 py-2 text-slate-600">{label}</td>
      <td className="px-3 py-2 text-right font-medium text-slate-900 tabular-nums">
        {value}
      </td>
    </tr>
  );
}

// Ligne de frais : taux editable a gauche, montant absolu a droite.
function FeeRow({
  label,
  rate,
  onRate,
  absolute,
  note,
}: {
  label: string;
  rate: number;
  onRate: (n: number) => void;
  absolute: number;
  note?: string;
}) {
  return (
    <tr>
      <td className="px-3 py-2 text-slate-600 align-middle">
        {label}
        {note && (
          <span className="text-[10px] text-slate-400 ml-1">{note}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          <input
            type="number"
            step="0.001"
            value={rate}
            onChange={(e) => onRate(Number(e.target.value))}
            className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:border-blue-500 tabular-nums"
          />
          <span className="text-xs text-slate-500">%</span>
        </div>
      </td>
      <td className="px-3 py-2 text-right font-medium text-slate-900 tabular-nums whitespace-nowrap">
        {formatFCFA2(absolute)} FCFA
      </td>
    </tr>
  );
}

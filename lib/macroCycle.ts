// === DEDUCTEUR DE CYCLE ECONOMIQUE ===
//
// Server-only. Combine 5-6 indicateurs cles pour identifier la phase du cycle
// economique d'un pays UEMOA, dans une logique IMF Article IV. La sortie sert
// a alimenter MacroCyclePanel.
//
// Cadre conceptuel : positionnement sur le quadrant (output gap, ecart inflation
// cible) + qualifiers sur orientation budgetaire, position externe, dynamique du
// credit, stance monetaire UMOA.

import "server-only";
import {
  derivedRatio,
  computeYoY,
  getMultiCountrySeries,
  getSeries,
  type MacroCountryCode,
  type MacroRow,
} from "./macroLoader";
import { MACRO_COUNTRIES } from "./macroTypes";
import type {
  CyclePeerPoint,
  CyclePhase,
  CycleQualifier,
  CycleSnapshot,
  StanceTone,
} from "./macroCycleTypes";

// Re-export pour compat — l'API publique ne change pas.
export type {
  CyclePeerPoint,
  CyclePhase,
  CycleQualifier,
  CycleSnapshot,
  StanceTone,
} from "./macroCycleTypes";
export { PHASE_META } from "./macroCycleTypes";

// ---------------------------------------------------------------------------
// CONSTANTES UEMOA
// ---------------------------------------------------------------------------

const INFLATION_TARGET = 3; // critere convergence UEMOA
const TREND_LOOKBACK_YEARS = 10;
const GROWTH_GAP_THRESHOLD_HIGH = 0.5; // p.p. au-dessus tendance
const INFLATION_GAP_THRESHOLD = 1.0; // p.p. au-dessus cible

// ---------------------------------------------------------------------------
// API PRINCIPALE
// ---------------------------------------------------------------------------

/** Snapshot du cycle pour les 8 pays UEMOA (sans UMOA) — alimente le quadrant. */
export function getCyclePeerPoints(): CyclePeerPoint[] {
  const peers = MACRO_COUNTRIES.filter((c) => c.code !== "UMOA").map((c) => c.code);
  const growthByCountry = getMultiCountrySeries(
    "Global",
    ". Taux de croissance reel du PIB (en %)",
    peers,
  );
  const infByCountry = getMultiCountrySeries(
    "Global",
    "Taux d'inflation moyen annuel (IPC) (en %)",
    peers,
  );
  const out: CyclePeerPoint[] = [];
  for (const c of peers) {
    const g = growthByCountry.get(c) ?? [];
    const i = infByCountry.get(c) ?? [];
    if (g.length === 0 || i.length === 0) continue;
    const lastG = g[g.length - 1];
    const lastI = i[i.length - 1];
    out.push({
      countryCode: c,
      growth: lastG.value,
      inflation: lastI.value,
      period: lastG.label,
    });
  }
  return out;
}

export function inferCycle(country: MacroCountryCode): CycleSnapshot {
  const growthSeries = getSeries(country, "Global", ". Taux de croissance reel du PIB (en %)");
  const infSeries = getSeries(country, "Global", "Taux d'inflation moyen annuel (IPC) (en %)");

  if (growthSeries.length === 0 || infSeries.length === 0) {
    return emptyCycle(country);
  }

  const lastGrowth = growthSeries[growthSeries.length - 1];
  const prevGrowth = growthSeries.length > 1 ? growthSeries[growthSeries.length - 2] : null;
  const lastInf = infSeries[infSeries.length - 1];

  // Tendance : moyenne sur les TREND_LOOKBACK_YEARS dernières années (hors période courante)
  const trendWindow = growthSeries.slice(-TREND_LOOKBACK_YEARS - 1, -1);
  const growthTrend =
    trendWindow.length > 0
      ? trendWindow.reduce((s, r) => s + r.value, 0) / trendWindow.length
      : null;

  const growth = lastGrowth.value;
  const inflation = lastInf.value;
  const growthGap = growthTrend !== null ? growth - growthTrend : null;
  const inflationGap = inflation - INFLATION_TARGET;

  // ---- Determination de phase ----
  let phase: CyclePhase;
  if (growth < 0) {
    phase = "recession";
  } else if (prevGrowth && prevGrowth.value < 0 && growth >= 0) {
    phase = "reprise";
  } else if (
    growthGap !== null &&
    growthGap < -GROWTH_GAP_THRESHOLD_HIGH &&
    inflationGap > INFLATION_GAP_THRESHOLD
  ) {
    phase = "stagflation";
  } else if (
    growthGap !== null &&
    growthGap > GROWTH_GAP_THRESHOLD_HIGH &&
    inflationGap > INFLATION_GAP_THRESHOLD
  ) {
    phase = "surchauffe";
  } else if (growthGap !== null && growthGap >= -GROWTH_GAP_THRESHOLD_HIGH) {
    phase = "expansion";
  } else {
    phase = "ralentissement";
  }

  // ---- Confidence (4 votes) ----
  let votes = 0;
  let total = 0;
  // Vote 1: signe du growthGap coherent
  if (growthGap !== null) {
    total++;
    const expectsPositive = phase === "expansion" || phase === "surchauffe";
    const expectsNegative = phase === "ralentissement" || phase === "stagflation" || phase === "recession";
    if ((expectsPositive && growthGap >= 0) || (expectsNegative && growthGap < 0)) votes++;
  }
  // Vote 2: signe inflationGap coherent
  total++;
  const expectsHotInf = phase === "surchauffe" || phase === "stagflation";
  const expectsColdInf = phase === "expansion" || phase === "ralentissement" || phase === "recession" || phase === "reprise";
  if ((expectsHotInf && inflationGap > 0) || (expectsColdInf && inflationGap <= INFLATION_GAP_THRESHOLD)) votes++;

  // Vote 3: dynamique du credit (mensuel YoY)
  const creditYoY = lastValueOf(
    computeYoY(
      getSeries(
        country,
        "Masse monétaire",
        "Agregats de Monnaie - Creances interieures - Creances sur les autres secteurs",
      ),
    ),
  );
  if (creditYoY !== null) {
    total++;
    if (
      ((phase === "expansion" || phase === "surchauffe") && creditYoY > 5) ||
      ((phase === "recession" || phase === "ralentissement") && creditYoY < 8) ||
      (phase === "reprise" && creditYoY > 0)
    ) {
      votes++;
    }
  }

  // Vote 4: solde courant — positif/excédent ↔ expansion/surchauffe ; déficit ↔ ralent/recession
  const cab = lastValueOf(getSeries(country, "Global", "Balance courante sur PIB (en %)"));
  if (cab !== null) {
    total++;
    // Pour les economies UEMOA (importatrices), le compte courant est typiquement deficitaire ;
    // une amelioration relative (cab > -8 ex.) signale resilience externe.
    if (
      ((phase === "expansion" || phase === "surchauffe") && cab > -10) ||
      ((phase === "ralentissement" || phase === "recession" || phase === "stagflation") && cab <= -5)
    ) {
      votes++;
    }
  }

  const confidence = total > 0 ? votes / total : 0;

  // ---- Qualifiers ----
  const qualifiers = buildQualifiers(country);

  return {
    countryCode: country,
    phase,
    confidence,
    period: lastGrowth.label,
    growth,
    growthTrend,
    growthGap,
    inflation,
    inflationGap,
    qualifiers,
    reading: composeReading(phase, growth, growthTrend, inflation, qualifiers),
  };
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function emptyCycle(country: MacroCountryCode): CycleSnapshot {
  return {
    countryCode: country,
    phase: "indetermine",
    confidence: 0,
    period: null,
    growth: null,
    growthTrend: null,
    growthGap: null,
    inflation: null,
    inflationGap: null,
    qualifiers: [],
    reading: "Données insuffisantes pour identifier la phase du cycle.",
  };
}

function lastValueOf(rows: MacroRow[]): number | null {
  if (rows.length === 0) return null;
  return rows[rows.length - 1].value;
}

function buildQualifiers(country: MacroCountryCode): CycleQualifier[] {
  const out: CycleQualifier[] = [];

  // 1) Stance budgetaire (solde budg / PIB)
  const pibNominal = getSeries(country, "Global", "PIB nominal (en milliards de FCFA)");
  const solde = getSeries(
    country,
    "TOFE",
    "Solde budgetaire global, avec dons (base engagement) (R1 - D1)",
  );
  const soldeRatio = derivedRatio(solde, pibNominal, 100);
  const lastSolde = lastValueOf(soldeRatio);
  if (lastSolde !== null) {
    let tone: StanceTone = "neutre";
    let caption = "Orientation budgétaire neutre";
    if (lastSolde < -4) {
      tone = "expansive";
      caption = "Politique budgétaire expansive (déficit élevé)";
    } else if (lastSolde > -1.5) {
      tone = "restrictive";
      caption = "Consolidation budgétaire (déficit modéré ou excédent)";
    } else {
      caption = "Politique budgétaire intermédiaire";
    }
    out.push({
      key: "fiscal_stance",
      label: "Stance budgétaire",
      value: `${lastSolde.toFixed(1).replace(".", ",")} % PIB`,
      caption,
      tone,
    });
  }

  // 2) Position externe (compte courant)
  const cab = lastValueOf(getSeries(country, "Global", "Balance courante sur PIB (en %)"));
  if (cab !== null) {
    let tone: StanceTone = "neutre";
    let caption = "Compte courant équilibré";
    if (cab > 0) {
      tone = "restrictive"; // excedent = position externe forte
      caption = "Excédent courant — position externe solide";
    } else if (cab < -8) {
      tone = "expansive"; // deficit large = pression
      caption = "Déficit courant marqué — financement externe nécessaire";
    } else {
      caption = "Déficit courant modéré";
    }
    out.push({
      key: "external_position",
      label: "Position externe",
      value: `${cab.toFixed(1).replace(".", ",")} % PIB`,
      caption,
      tone,
    });
  }

  // 3) Dynamique du credit (Crédit aux autres secteurs YoY, mensuel)
  const creditYoYRows = computeYoY(
    getSeries(
      country,
      "Masse monétaire",
      "Agregats de Monnaie - Creances interieures - Creances sur les autres secteurs",
    ),
  );
  if (creditYoYRows.length > 0) {
    const last = creditYoYRows[creditYoYRows.length - 1];
    let tone: StanceTone = "neutre";
    let caption = "Crédit à l'économie en croissance modérée";
    if (last.value > 12) {
      tone = "expansive";
      caption = "Forte expansion du crédit — boom potentiel";
    } else if (last.value < 3) {
      tone = "restrictive";
      caption = "Atonie du crédit à l'économie";
    } else if (last.value < 0) {
      tone = "restrictive";
      caption = "Contraction du crédit — risque de credit crunch";
    }
    out.push({
      key: "credit_dynamics",
      label: "Dynamique du crédit",
      value: `${last.value.toFixed(1).replace(".", ",")} % YoY`,
      caption: `${caption} · ${last.label}`,
      tone,
    });
  } else {
    out.push({
      key: "credit_dynamics",
      label: "Dynamique du crédit",
      value: "—",
      caption: "Donnée mensuelle indisponible",
      tone: "indispo",
    });
  }

  // 4) Stance monetaire UMOA (taux interbancaire UMOA — meme pour tous les pays)
  const interbank = lastValueOf(
    getSeries(
      "UMOA",
      "Marché Mon. & Int.",
      "Taux moyen pondere des operations interbancaires toutes maturites confondues",
    ),
  );
  if (interbank !== null) {
    // moyenne 5 ans pour reference
    const allInterbank = getSeries(
      "UMOA",
      "Marché Mon. & Int.",
      "Taux moyen pondere des operations interbancaires toutes maturites confondues",
    );
    const avg5y = allInterbank.slice(-60).reduce((s, r) => s + r.value, 0) /
      Math.max(1, allInterbank.slice(-60).length);
    const gap = interbank - avg5y;
    let tone: StanceTone = "neutre";
    let caption = "Taux interbancaire UMOA proche de sa moyenne 5 ans";
    if (gap > 0.5) {
      tone = "restrictive";
      caption = `Conditions monétaires resserrées (+${gap.toFixed(1).replace(".", ",")} pp vs moy. 5 A)`;
    } else if (gap < -0.5) {
      tone = "expansive";
      caption = `Conditions monétaires accommodantes (${gap.toFixed(1).replace(".", ",")} pp vs moy. 5 A)`;
    }
    out.push({
      key: "monetary_stance",
      label: "Stance monétaire UMOA",
      value: `${interbank.toFixed(2).replace(".", ",")} %`,
      caption,
      tone,
    });
  }

  return out;
}

function composeReading(
  phase: CyclePhase,
  growth: number | null,
  growthTrend: number | null,
  inflation: number | null,
  qualifiers: CycleQualifier[],
): string {
  if (phase === "indetermine") return "Données insuffisantes pour conclure.";

  const fiscal = qualifiers.find((q) => q.key === "fiscal_stance");
  const credit = qualifiers.find((q) => q.key === "credit_dynamics");
  const ext = qualifiers.find((q) => q.key === "external_position");

  const parts: string[] = [];
  if (growth !== null && growthTrend !== null) {
    const direction = growth > growthTrend ? "au-dessus" : "en-dessous";
    parts.push(
      `Croissance de ${growth.toFixed(1).replace(".", ",")} % ${direction} de la tendance long terme (${growthTrend.toFixed(1).replace(".", ",")} %)`,
    );
  }
  if (inflation !== null) {
    parts.push(
      `inflation à ${inflation.toFixed(1).replace(".", ",")} % (cible UEMOA ≤ 3 %)`,
    );
  }
  if (fiscal && fiscal.tone === "expansive") parts.push("politique budgétaire expansive");
  else if (fiscal && fiscal.tone === "restrictive") parts.push("consolidation budgétaire en cours");
  if (credit && credit.tone === "expansive") parts.push("crédit en forte expansion");
  else if (credit && credit.tone === "restrictive") parts.push("crédit atone");
  if (ext && ext.tone === "expansive") parts.push("déficit courant marqué");

  return parts.join(" · ") + ".";
}

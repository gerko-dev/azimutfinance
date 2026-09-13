import "server-only";

import {
  loadFunds,
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
} from "@/lib/fcpMath";
import type { ScreenerRow, ScreenerCadence } from "@/lib/screenerFCPTypes";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Normalise la periodicite telle que la societe de gestion la declare. */
function cadenceDeclaree(freq: string | null): ScreenerCadence | null {
  switch ((freq ?? "").trim().toLowerCase()) {
    case "quotidienne":
      return "quotidienne";
    case "hebdomadaire":
      return "hebdomadaire";
    case "bimensuelle":
      return "bimensuelle";
    case "mensuelle":
      return "mensuelle";
    case "trimestrielle":
      return "trimestrielle";
    default:
      return null;
  }
}

/**
 * Periodicite OBSERVEE : ecart median entre deux VL sur les 365 derniers jours.
 *
 * La mediane et non la moyenne — une seule longue interruption estivale
 * suffirait a faire passer un fonds quotidien pour un fonds mensuel.
 */
function cadenceObservee(dates: string[], refMs: number): ScreenerCadence | null {
  const cutoff = new Date(refMs - 365 * MS_PER_DAY).toISOString().slice(0, 10);
  const recentes = Array.from(new Set(dates.filter((d) => d >= cutoff))).sort();
  if (recentes.length < 3) return null;
  const ecarts: number[] = [];
  for (let i = 1; i < recentes.length; i++) {
    ecarts.push(
      (Date.parse(`${recentes[i]}T00:00:00Z`) -
        Date.parse(`${recentes[i - 1]}T00:00:00Z`)) /
        MS_PER_DAY,
    );
  }
  ecarts.sort((a, b) => a - b);
  const m = Math.floor(ecarts.length / 2);
  const median =
    ecarts.length % 2 ? ecarts[m] : (ecarts[m - 1] + ecarts[m]) / 2;
  if (median <= 4) return "quotidienne";
  if (median <= 10) return "hebdomadaire";
  if (median <= 20) return "bimensuelle";
  if (median <= 45) return "mensuelle";
  if (median <= 120) return "trimestrielle";
  return "irrégulière";
}

export type FcpScreenerPayload = {
  rows: ScreenerRow[];
  refQuarter: string;
  latestVLGlobal: string;
  stalenessCutoff: string;
  categories: string[];
  managers: string[];
  types: string[];
};

/**
 * Donnees du screener FCP.
 *
 * Extrait de app/pros/screener-fcp pour etre partage avec l'espace Outils.
 *
 * `stalenessCutoff` marque les VL perimees a 15 jours de la derniere VL connue
 * du marche, et non de la date du jour : un fonds n'est pas en retard parce que
 * l'on consulte la page un dimanche, il l'est par rapport a ce que ses pairs
 * ont publie.
 */
export function buildFcpScreenerPayload(): FcpScreenerPayload {
  const funds = loadFunds();
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
    // La cadence etait deduite de la regularite sur la grille TRIMESTRIELLE,
    // via un compteur qui n'examinait que les observations « latest » — au plus
    // une par fonds. Le seuil « hebdomadaire » etait donc inatteignable et tout
    // fonds regulier ressortait « trimestrielle », pour tout le monde.
    // La periodicite de calcul declaree par la societe de gestion fait foi ;
    // a defaut, on mesure l'espacement reel des VL.
    const declaree = cadenceDeclaree(f.frequenceVL);
    const observee = cadenceObservee(
      f.observations.map((o) => o.date),
      refMs,
    );
    const cadence: ScreenerCadence = declaree ?? observee ?? "irrégulière";
    const cadenceSource = declaree ? "declaree" : observee ? "observee" : null;
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
      cadence,
      cadenceSource,
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

  return {
    rows,
    refQuarter,
    latestVLGlobal,
    stalenessCutoff,
    categories: Array.from(new Set(rows.map((r) => r.categorie))).sort(),
    managers: Array.from(new Set(rows.map((r) => r.gestionnaire))).sort(),
    types: Array.from(new Set(rows.map((r) => r.type))).sort(),
  };
}

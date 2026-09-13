import "server-only";

import { loadMultipleIndicesHistory } from "@/lib/dataLoader";
import { buildActionsScreenerRows } from "@/lib/screeners/actions";

export type ComparateurTitre = {
  code: string;
  nom: string;
  secteur: string;
  pays: string;
  cours: number;
  variationJour: number;
  capitalisation: number;
  volumeMoyen: number | null;
  volatilite: number | null;
  perfAn: number | null;
  per: number | null;
  rendement: number | null;
  /** Ratios fondamentaux du dernier exercice disponible. */
  roe: number | null;
  roa: number | null;
  margeNette: number | null;
  margeOperationnelle: number | null;
  croissanceCA: number | null;
  croissanceRNet: number | null;
  gearing: number | null;
  autonomieFinanciere: number | null;
  liquiditeGenerale: number | null;
  priceToBook: number | null;
  bpa: number | null;
  tauxDistribution: number | null;
  exercice: number | null;
};

export type ComparateurPayload = {
  titres: ComparateurTitre[];
  /** Axe de dates commun a toutes les series, du plus ancien au plus recent. */
  dates: string[];
  /** Cours par code, aligne sur `dates`. null = pas de cotation cette semaine. */
  series: Record<string, (number | null)[]>;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Donnees du comparateur de titres.
 *
 * UN AXE COMMUN, PAS UNE SERIE PAR TITRE. Chaque titre a son propre calendrier
 * de cotation — un titre peu liquide ne cote pas tous les jours. Envoyer 48
 * series datees independantes ferait plusieurs centaines de kilo-octets et
 * obligerait le client a les realigner. On construit donc un axe hebdomadaire
 * unique et on projette chaque titre dessus : le client n'envoie qu'un tableau
 * de nombres par titre, et la comparaison est alignee par construction.
 *
 * Le pas est HEBDOMADAIRE et la fenetre de trois ans : sur des titres dont
 * certains cotent quelques fois par mois, un pas quotidien produirait surtout
 * des trous, pour dix fois le poids.
 *
 * Aucun rebasage ici. Il depend de la fenetre que l'utilisateur choisit, et
 * rebaser cote serveur figerait ce choix.
 */
export async function buildComparateurPayload(): Promise<ComparateurPayload> {
  const rows = await buildActionsScreenerRows();

  const titres: ComparateurTitre[] = rows.map((r) => {
    // `fundByWindow` porte plusieurs exercices : on retient le plus recent.
    const fenetres = r.fundByWindow
      ? Object.values(r.fundByWindow).filter(Boolean)
      : [];
    const fond = fenetres.length
      ? (fenetres as { exercice: number }[]).reduce((a, b) =>
          b.exercice > a.exercice ? b : a,
        )
      : null;
    const f = fond as Record<string, number | null> | null;

    return {
      code: r.code,
      nom: r.name,
      secteur: r.sector,
      pays: r.country,
      cours: r.price,
      variationJour: r.changePercent,
      capitalisation: r.capitalization,
      volumeMoyen: r.avgVolume ?? null,
      volatilite: r.volatility ?? null,
      perfAn: r.yearChange ?? null,
      per: r.hasPer ? r.per : null,
      rendement: r.hasYield ? r.yieldPct : null,
      roe: f?.roe ?? null,
      roa: f?.roa ?? null,
      margeNette: f?.margeNette ?? null,
      margeOperationnelle: f?.margeOperationnelle ?? null,
      croissanceCA: f?.croissanceCA ?? null,
      croissanceRNet: f?.croissanceRNet ?? null,
      gearing: f?.gearing ?? null,
      autonomieFinanciere: f?.autonomieFinanciere ?? null,
      liquiditeGenerale: f?.liquiditeGenerale ?? null,
      priceToBook: f?.priceToBook ?? null,
      bpa: f?.bpa ?? null,
      tauxDistribution: f?.tauxDistribution ?? null,
      exercice: (f?.exercice as number | null) ?? null,
    };
  });

  // --- Axe hebdomadaire commun sur trois ans -------------------------------
  const codes = titres.map((t) => t.code);
  const histories = loadMultipleIndicesHistory(codes);

  const finMs = Date.now();
  const debutMs = finMs - 3 * 365 * MS_PER_DAY;
  const dates: string[] = [];
  for (let t = debutMs; t <= finMs; t += 7 * MS_PER_DAY) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }

  const series: Record<string, (number | null)[]> = {};
  for (const code of codes) {
    const h = (histories[code] ?? []).filter((p) => p.date >= dates[0]);
    if (h.length === 0) continue;
    const colonne: (number | null)[] = [];
    let i = 0;
    let dernier: number | null = null;
    for (const d of dates) {
      // Dernier cours connu A CETTE DATE : un titre qui n'a pas cote cette
      // semaine garde son cours precedent plutot que de trouer la courbe.
      while (i < h.length && h[i].date <= d) {
        dernier = h[i].value;
        i++;
      }
      colonne.push(dernier);
    }
    series[code] = colonne;
  }

  titres.sort((a, b) => b.capitalisation - a.capitalisation);
  return { titres, dates, series };
}

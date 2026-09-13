import "server-only";

// === Anticipations de cours — moteur ===
//
// Cinq méthodes appliquées à chaque valeur de la cote. Aucune n'est retenue
// d'office : le tableau les affiche toutes, le gérant choisit.
//
// PÉRIMÈTRE — toute la cote BRVM, pas seulement les lignes détenues. Anticiper
// sert d'abord à décider d'entrer sur une valeur qu'on n'a pas.

import { getLatestSikaQuote, loadAllActions, loadPriceHistory } from "@/lib/dataLoader";
import { computeRatiosByTicker } from "@/lib/fundamentalsCalc";
import { getPeriodicStatements } from "@/lib/fundamentals";
import { loadPublications } from "@/lib/reports/comite/publications";

import { loadCustomSecurities, loadFundPortfolios } from "./portfolio-data";
import { loadNavHistory } from "./nav-data";
import {
  AMORTISSEMENT_MOMENTUM,
  POIDS_FONDAMENTAL_MAX,
  type AnticipationTitre,
  type CibleMethode,
  type MethodeCible,
  type ProjectionFonds,
  type TableauAnticipation,
} from "./anticipation-types";

const num = (v: unknown, d = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }
  return d;
};

const mediane = (arr: number[]): number | null => {
  const v = arr.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

function valeurAu(serie: { date: string; value: number }[], date: string): number | null {
  let v: number | null = null;
  for (const p of serie) {
    if (p.date <= date) v = p.value;
    else break;
  }
  return v;
}

/** BPA de l'exercice à venir, par report du glissement annuel observé.
 *
 *  RN estimé = RN annuel N-1 × (RN période N / RN même période N-1).
 *
 *  Pas une annualisation « RN T1 × 4 » : la saisonnalité la rendrait fausse,
 *  une société réalisant l'essentiel de son résultat au second semestre serait
 *  sous-estimée de moitié. Le report suppose seulement que la tendance
 *  observée se prolonge — hypothèse explicite et bien plus faible.
 */
function projection(
  ticker: string,
  exercice: number,
  nbTitres: number,
): { bpa: number | null; periode: string | null; croissance: number | null } {
  const m = getPeriodicStatements(ticker).metrics.find((x) => x.codePoste === "CR_RNET");
  if (!m || !(nbTitres > 0)) return { bpa: null, periode: null, croissance: null };

  const annuelPrecedent = m.values[exercice - 1]?.Annuel;
  if (annuelPrecedent === undefined || !(annuelPrecedent > 0)) {
    return { bpa: null, periode: null, croissance: null };
  }
  // Publication la plus avancée d'abord : moins elle laisse d'exercice à
  // extrapoler, plus la projection porte.
  for (const per of ["9M", "S1", "T1"] as const) {
    const v = m.values[exercice]?.[per];
    const vPrec = m.values[exercice - 1]?.[per];
    if (v === undefined || vPrec === undefined || !(vPrec > 0)) continue;
    const croissance = v / vPrec - 1;
    return {
      bpa: (annuelPrecedent * (1 + croissance)) / nbTitres,
      periode: `${per} ${exercice}`,
      croissance,
    };
  }
  return { bpa: null, periode: null, croissance: null };
}

/** Performance médiane du titre entre le jour `jj/mm` et le 31/12, mesurée sur
 *  chaque année de son historique.
 *
 *  C'est la saisonnalité RÉSIDUELLE : elle se recalcule à chaque date et suit
 *  naturellement le temps restant. Au 15 mars elle porte sur neuf mois et demi,
 *  au 20 novembre sur six semaines — sans qu'aucun paramètre ne change.
 *
 *  La médiane, pas la moyenne : une année de crise (2008, 2020) écraserait une
 *  moyenne sur vingt observations et fausserait toutes les cibles.
 */
function saisonnaliteResiduelle(
  serie: { date: string; value: number }[],
  dateRef: string,
): { mediane: number | null; annees: number } {
  if (serie.length === 0) return { mediane: null, annees: 0 };
  const mmjj = dateRef.slice(5); // "MM-JJ"
  const anneeRef = Number(dateRef.slice(0, 4));
  const anneeMin = Number(serie[0].date.slice(0, 4));

  const valeurAuDans = (d: string): number | null => {
    let v: number | null = null;
    for (const p of serie) {
      if (p.date <= d) v = p.value;
      else break;
    }
    return v;
  };

  const perfs: number[] = [];
  // On s'arrête à l'année précédente : l'année en cours n'a pas encore son
  // 31/12, l'inclure reviendrait à comparer une période tronquée.
  for (let a = anneeMin; a < anneeRef; a++) {
    const debut = valeurAuDans(`${a}-${mmjj}`);
    const fin = valeurAuDans(`${a}-12-31`);
    // Le point de départ doit exister APRÈS le début de l'historique, sinon on
    // mesure depuis la première cotation et non depuis la date voulue.
    if (!debut || !fin || `${a}-${mmjj}` < serie[0].date) continue;
    if (debut <= 0) continue;
    perfs.push(fin / debut - 1);
  }

  if (perfs.length === 0) return { mediane: null, annees: 0 };
  perfs.sort((x, y) => x - y);
  const m = Math.floor(perfs.length / 2);
  return {
    mediane: perfs.length % 2 ? perfs[m] : (perfs[m - 1] + perfs[m]) / 2,
    annees: perfs.length,
  };
}

/** Fraction d'année restante, de 1 au 1er janvier à 0 au 31 décembre. */
function fractionRestante(dateRef: string): { fraction: number; jours: number } {
  const d = new Date(dateRef + "T00:00:00Z");
  const an = d.getUTCFullYear();
  const fin = new Date(Date.UTC(an, 11, 31));
  const debut = new Date(Date.UTC(an, 0, 1));
  const jours = Math.max(0, (fin.getTime() - d.getTime()) / 86_400_000);
  const total = (fin.getTime() - debut.getTime()) / 86_400_000;
  return { fraction: total > 0 ? jours / total : 0, jours: Math.round(jours) };
}

const vide = (reserve: string): CibleMethode => ({
  cible: null,
  potentiel: null,
  reserve,
});

const avec = (cible: number, cours: number): CibleMethode => ({
  cible,
  potentiel: cours > 0 ? cible / cours - 1 : null,
  reserve: null,
});

export async function construireAnticipations(
  fundId: string,
  /** Objectif de performance annuel du fonds, tel que saisi. */
  objectifPerf = "",
): Promise<TableauAnticipation> {
  const avertissements: string[] = [];

  const [snapshots, customs, nav] = await Promise.all([
    loadFundPortfolios(fundId),
    loadCustomSecurities(),
    loadNavHistory(fundId),
  ]);
  const actuel =
    [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).pop() ?? null;
  const dateReference = actuel?.asOfDate ?? new Date().toISOString().slice(0, 10);
  const customParId = new Map(customs.map((c) => [c.id, c]));
  const exercice = Number(dateReference.slice(0, 4));

  // Positions actions détenues, par code de marché.
  const detenues = new Map<string, { quantite: number; valorisation: number }>();
  for (const p of actuel?.positions ?? []) {
    if (p.section !== "action") continue;
    const custom = p.customSecurityId ? customParId.get(p.customSecurityId) : undefined;
    const cle = (custom?.code || p.matchId || p.rawCode || "").trim().toUpperCase();
    if (!cle) continue;
    const cur = detenues.get(cle) ?? { quantite: 0, valorisation: 0 };
    cur.quantite += num(p.quantity);
    cur.valorisation += num(p.valuation);
    detenues.set(cle, cur);
  }

  const frac = fractionRestante(dateReference);

  // Dates de mise en paiement du dividende de l'exercice en cours : un
  // détachement à venir sort mécaniquement du cours, ce n'est pas une
  // prévision mais un fait daté.
  const detachementsParTicker = new Map<string, string>();
  for (const p of loadPublications()) {
    if (p.type !== "dividende") continue;
    if (p.exercice !== String(exercice)) continue;
    const cur = detachementsParTicker.get(p.ticker);
    if (!cur || p.date < cur) detachementsParTicker.set(p.ticker, p.date);
  }

  const actions = loadAllActions();

  // Médianes de référence, calculées sur les valeurs qui publient.
  const perMedianMarche = mediane(
    actions.filter((a) => a.hasPer && a.per > 0).map((a) => a.per),
  );
  const rendementMedianMarche = mediane(
    actions.filter((a) => a.hasYield && a.yieldPct > 0).map((a) => a.yieldPct / 100),
  );

  // PER médian par secteur : un multiple ne se compare qu'entre comparables.
  const perParSecteur = new Map<string, number[]>();
  for (const a of actions) {
    if (!a.hasPer || !(a.per > 0)) continue;
    const s = (a.sector || "Non classé").trim();
    const l = perParSecteur.get(s) ?? [];
    l.push(a.per);
    perParSecteur.set(s, l);
  }
  const medianeSecteur = new Map<string, number | null>();
  for (const [s, v] of perParSecteur) medianeSecteur.set(s, mediane(v));

  const titres: AnticipationTitre[] = [];

  for (const a of actions) {
    const serie = loadPriceHistory(a.code);
    // Cours arrêté à la date d'inventaire, pas à aujourd'hui : le tableau doit
    // se rejouer à l'identique plus tard.
    const cours = valeurAu(serie, dateReference) ?? num(getLatestSikaQuote(a.code)?.price);
    if (!(cours > 0)) continue;

    const secteur = (a.sector || "Non classé").trim();
    const perMedianSecteur = medianeSecteur.get(secteur) ?? null;

    const ratios = computeRatiosByTicker(a.code);
    const dernier = ratios[ratios.length - 1] ?? null;
    const nbTitres = num(dernier?.nbTitres);
    const bpa = dernier && num(dernier.bpa) > 0 ? num(dernier.bpa) : null;
    const dpa = dernier && num(dernier.dpa) > 0 ? num(dernier.dpa) : null;
    const per = a.hasPer && a.per > 0 ? a.per : null;
    const rendement = a.hasYield && a.yieldPct > 0 ? a.yieldPct / 100 : null;

    // Moyennes mobiles arrêtées à la date de référence.
    const jusqua = serie.filter((p) => p.date <= dateReference);
    const mm = (n: number): number | null => {
      const f = jusqua.slice(-n);
      return f.length >= Math.min(20, n)
        ? f.reduce((s, p) => s + p.value, 0) / f.length
        : null;
    };
    const mm50 = mm(50);
    const mm200 = mm(200);

    const proj = projection(a.code, exercice, nbTitres);

    // ── Les cinq méthodes ──────────────────────────────────────────────────
    const cibles: Record<MethodeCible, CibleMethode> = {
      per:
        bpa === null
          ? vide("Bénéfice par action non disponible.")
          : perMedianSecteur === null
            ? vide(`Aucun PER médian pour le secteur « ${secteur} ».`)
            : avec(bpa * perMedianSecteur, cours),

      rendement:
        dpa === null
          ? vide("Valeur sans dividende publié.")
          : rendementMedianMarche === null || rendementMedianMarche <= 0
            ? vide("Rendement médian du marché indisponible.")
            : avec(dpa / rendementMedianMarche, cours),

      // Même multiple que la méthode PER : deux références différentes pour un
      // même calcul rendraient les deux cibles incomparables — l'écart entre
      // elles doit refléter la croissance attendue, rien d'autre.
      projection:
        proj.bpa === null
          ? vide("Pas de publication intermédiaire exploitable sur l'exercice.")
          : perMedianSecteur === null
            ? vide(`Aucun PER médian pour le secteur « ${secteur} ».`)
            : avec(proj.bpa * perMedianSecteur, cours),

      technique:
        mm200 === null
          ? vide("Historique insuffisant pour une moyenne mobile 200 séances.")
          : (() => {
              // La MM200 donne le niveau de référence ; l'écart MM50/MM200
              // donne le sens et l'ampleur de la tendance. Un titre en tendance
              // haussière est projeté au-dessus de sa moyenne longue.
              const tendance = mm50 !== null && mm200 > 0 ? mm50 / mm200 - 1 : 0;
              return avec(mm200 * (1 + tendance), cours);
            })(),

      mix: vide("Aucune autre méthode applicable."),
      annuelle: vide("Composantes insuffisantes."),
    };

    // Le mix moyenne ce qui a pu être calculé. Il ne remplace pas une méthode
    // choisie : il amortit l'erreur d'une méthode isolée, au prix d'un mélange
    // d'horizons.
    const disponibles = (["per", "rendement", "projection", "technique"] as const)
      .map((k) => cibles[k].cible)
      .filter((x): x is number => x !== null);
    if (disponibles.length > 0) {
      cibles.mix = avec(
        disponibles.reduce((s, x) => s + x, 0) / disponibles.length,
        cours,
      );
    }

    // ── Cible au 31 décembre ───────────────────────────────────────────────
    //
    // Trois composantes, pondérées selon le TEMPS RESTANT :
    //
    //   fondamentale  poids = fraction restante × plafond. En janvier un
    //                 multiple a le temps de converger ; en décembre non.
    //   saisonnière   performance médiane historique du titre entre cette date
    //                 et le 31/12. Se recalcule à chaque date, sans paramètre.
    //   momentum      tendance récente, amortie et proratisée sur la période
    //                 restante — une tendance s'épuise, elle ne s'extrapole pas.
    //
    // Les dividendes détachés d'ici la fin d'année sont retranchés : ils
    // sortent du cours à la date de détachement, ce n'est pas une prévision.
    const sais = saisonnaliteResiduelle(serie, dateReference);

    // Momentum : dérive quotidienne des 60 dernières séances, projetée sur les
    // jours restants, puis amortie.
    let momentumResiduel: number | null = null;
    const fen = jusqua.slice(-60);
    if (fen.length >= 20 && fen[0].value > 0) {
      const joursObserves = Math.max(
        1,
        (new Date(fen[fen.length - 1].date).getTime() -
          new Date(fen[0].date).getTime()) /
          86_400_000,
      );
      const deriveJour = (fen[fen.length - 1].value / fen[0].value - 1) / joursObserves;
      momentumResiduel = deriveJour * frac.jours * AMORTISSEMENT_MOMENTUM;
    }

    // Dividende à détacher d'ici le 31/12, s'il est daté sur l'exercice.
    const detachement = detachementsParTicker.get(a.code.toUpperCase());
    const dividendeADetacher =
      detachement && detachement > dateReference && dpa !== null ? dpa : 0;

    const cibleFondamentale = cibles.mix.cible;
    const poidsFond =
      cibleFondamentale !== null ? frac.fraction * POIDS_FONDAMENTAL_MAX : 0;

    const composantes: number[] = [];
    if (sais.mediane !== null) composantes.push(sais.mediane);
    if (momentumResiduel !== null) composantes.push(momentumResiduel);

    if (composantes.length === 0 && cibleFondamentale === null) {
      cibles.annuelle = vide(
        "Ni historique saisonnier, ni tendance, ni valeur fondamentale exploitable.",
      );
    } else {
      // Trajectoire de marché : moyenne des composantes disponibles.
      const derive =
        composantes.length > 0
          ? composantes.reduce((s, x) => s + x, 0) / composantes.length
          : 0;
      const coursTendanciel = cours * (1 + derive);
      const brut =
        cibleFondamentale !== null
          ? coursTendanciel * (1 - poidsFond) + cibleFondamentale * poidsFond
          : coursTendanciel;
      cibles.annuelle = avec(Math.max(0, brut - dividendeADetacher), cours);
    }

    const det = detenues.get(a.code.toUpperCase());

    titres.push({
      code: a.code,
      libelle: a.name.trim(),
      secteur,
      detenu: !!det,
      quantiteDetenue: det?.quantite ?? 0,
      valorisation: det?.valorisation ?? 0,
      cours,
      bpa,
      per,
      perMedianMarche,
      perMedianSecteur,
      dpa,
      rendement,
      rendementMedianMarche,
      bpaProjete: proj.bpa,
      periodeProjection: proj.periode,
      croissanceProjetee: proj.croissance,
      mm50,
      mm200,
      saisonnaliteResiduelle: sais.mediane,
      anneesObservees: sais.annees,
      momentumResiduel,
      dividendeADetacher,
      cibles,
    });
  }

  // Les lignes détenues d'abord : c'est là que la décision se joue.
  titres.sort(
    (a, b) =>
      Number(b.detenu) - Number(a.detenu) ||
      b.valorisation - a.valorisation ||
      a.code.localeCompare(b.code),
  );

  const sansAucune = titres.filter((t) => t.cibles.mix.cible === null).length;
  if (sansAucune > 0) {
    avertissements.push(
      `${sansAucune} valeur(s) sans aucune méthode applicable : ni bénéfice, ni dividende, ni historique suffisant.`,
    );
  }
  if (!actuel) {
    avertissements.push(
      "Aucun inventaire : les colonnes de détention sont vides, les cours sont ceux du jour.",
    );
  }

  // ── Projection du portefeuille au 31/12 ─────────────────────────────────
  //
  // La cible par titre ne sert à rien isolée : ce que pilote le gérant, c'est
  // la performance du fonds face à son objectif annuel.
  const detenusProjetes = titres.filter(
    (t) => t.detenu && t.valorisation > 0 && t.cibles.annuelle.cible !== null,
  );
  const detenusTous = titres.filter((t) => t.detenu && t.valorisation > 0);
  const valorisationActuelle = detenusTous.reduce((s, t) => s + t.valorisation, 0);
  const valorisationProjetee = detenusTous.reduce((s, t) => {
    const pot = t.cibles.annuelle.potentiel;
    // Une ligne non projetée est reportée à sa valeur actuelle : la supposer
    // nulle effondrerait la projection, la supposer performante l'embellirait.
    return s + t.valorisation * (1 + (pot ?? 0));
  }, 0);
  const couverture =
    valorisationActuelle > 0
      ? detenusProjetes.reduce((s, t) => s + t.valorisation, 0) / valorisationActuelle
      : 0;

  const objectifAnnuel = lireObjectif(objectifPerf);

  // Performance déjà acquise : VL courante rapportée à la dernière VL de
  // l'exercice précédent.
  let performanceAcquise: number | null = null;
  const navTriee = [...nav].sort((a, b) => a.date.localeCompare(b.date));
  const vlBase = navTriee.filter((p) => p.date <= `${exercice - 1}-12-31`).pop();
  const vlCourante = navTriee.filter((p) => p.date <= dateReference).pop();
  if (vlBase && vlCourante && num(vlBase.vl) > 0) {
    performanceAcquise = num(vlCourante.vl) / num(vlBase.vl) - 1;
  }

  const performanceResiduelle =
    valorisationActuelle > 0 ? valorisationProjetee / valorisationActuelle - 1 : null;

  // La poche actions n'est pas tout le fonds : appliquer sa performance à
  // l'ensemble de l'actif surestimerait grossièrement un fonds diversifié. On
  // la pondère par son poids dans l'actif net. Le reste — obligations, OPCVM,
  // DAT — est supposé porter zéro d'ici la fin d'année : c'est faux mais
  // conservateur, ces poches délivrent un coupon positif.
  const actifNet = num(vlCourante?.actifNet);
  const poidsActions =
    actifNet > 0 ? Math.min(1, valorisationActuelle / actifNet) : null;
  const contributionActions =
    performanceResiduelle !== null && poidsActions !== null
      ? performanceResiduelle * poidsActions
      : performanceResiduelle;

  const performanceProjetee =
    performanceAcquise !== null && contributionActions !== null
      ? (1 + performanceAcquise) * (1 + contributionActions) - 1
      : null;

  const projectionFonds: ProjectionFonds = {
    fractionRestante: frac.fraction,
    joursRestants: frac.jours,
    valorisationActuelle,
    valorisationProjetee,
    performanceResiduelle,
    poidsActions,
    couverture,
    objectifAnnuel,
    performanceAcquise,
    performanceProjetee,
    ecartObjectif:
      performanceProjetee !== null && objectifAnnuel !== null
        ? performanceProjetee - objectifAnnuel
        : null,
    avertissement: [
      performanceAcquise === null
        ? "Aucune VL au 31/12 de l'exercice précédent : la performance acquise n'est pas calculable, seule la contribution résiduelle des actions est affichée."
        : null,
      poidsActions === null
        ? "Actif net inconnu à la date de référence : la performance de la poche actions est appliquée au fonds entier, ce qui la surestime si le fonds est diversifié."
        : null,
      couverture < 0.8 && valorisationActuelle > 0
        ? `Seules ${(couverture * 100).toFixed(0)} % des lignes actions sont projetées ; les autres sont reportées à leur valeur actuelle.`
        : null,
    ]
      .filter(Boolean)
      .join(" ") || null,
  };

  return {
    titres,
    perMedianMarche,
    rendementMedianMarche,
    dateReference,
    projection: projectionFonds,
    avertissements,
  };
}

/** Lit un objectif de performance saisi en clair : « 7 % », « 7,5 », « +8% ». */
function lireObjectif(texte: string): number | null {
  const m = /(-?\d+(?:[.,]\d+)?)/.exec(texte ?? "");
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  if (!Number.isFinite(v)) return null;
  // Un objectif se saisit en points de pourcentage, jamais en décimal : « 7 »
  // veut dire 7 %, pas 700 %.
  return v / 100;
}

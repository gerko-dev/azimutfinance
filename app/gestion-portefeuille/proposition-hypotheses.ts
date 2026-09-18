import "server-only";

// === Hypothèses de la proposition d'allocation, tirées des données du site ===
//
// Quatre des cinq paramètres du modèle ne sont plus saisis : ils sont DÉDUITS.
// Une hypothèse ressaisie à la main dans chaque écran finit par différer d'un
// écran à l'autre, et personne ne sait plus laquelle fait foi. Ici :
//
//   montant           → la poche actions arrêtée par l'allocation validée
//   taux sans risque  → le taux directeur BCEAO publié sur le portail
//   rendement marché  → la moyenne du BRVM Composite sur cinq ans
//   part maximale     → le ratio de division des risques du fonds
//
// Seule la rentabilité minimale reste une décision, et reste saisissable.

import { loadIndexHistory, loadStocks } from "@/lib/dataLoader";
import { getLatest, preloadTauxData } from "@/lib/tauxLoader";

import { construireTableauAllocation } from "./allocation-data";

/**
 * Forme minimale d'un ratio, tolerant les deux representations du depot : la
 * ligne de base (`seuil_max`) et le type de domaine (`seuilMax`). Les deux
 * circulent selon l'appelant, et convertir l'une en l'autre pour lire un seul
 * champ serait plus de code que d'accepter les deux.
 */
type RatioLisible = {
  metrique?: string | null;
  libelle?: string | null;
  seuilMax?: string | number | null;
  seuil_max?: string | number | null;
};

/** Semaines d'observation par an — le modèle travaille en pas hebdomadaire. */
export const SEMAINES_PAR_AN = 52;

/** Un taux annuel en décimal ramené à la semaine, en composé. */
export function annuelVersHebdo(annuel: number): number {
  return Math.pow(1 + annuel, 1 / SEMAINES_PAR_AN) - 1;
}

/**
 * Taux sans risque : taux minimum des appels d'offres de la BCEAO, le taux
 * directeur que le portail publie déjà sur /marche-monetaire. C'est le taux
 * court sans risque de crédit de la zone, le choix canonique pour l'UEMOA.
 *
 * Renvoie null si la série est indisponible — mieux vaut une hypothèse
 * manquante, et dite, qu'un chiffre inventé que le gérant prendrait pour une
 * mesure.
 */
export async function tauxDirecteurBceao(): Promise<number | null> {
  await preloadTauxData();
  const p = getLatest(
    "1_Taux_directeurs_BCEAO",
    "Taux minimum appels offres",
    "UEMOA",
  );
  return p && Number.isFinite(p.value) ? p.value / 100 : null;
}

/** Fenêtre du rendement de marché, en années civiles révolues. */
const ANNEES_MARCHE = 5;

/**
 * Rendement du marché : MOYENNE des rendements annuels du BRVM Composite sur
 * les cinq dernières années.
 *
 * Moyenne arithmétique des performances année par année, et non taux de
 * croissance annuel moyen sur toute la période. Les deux diffèrent, parfois
 * beaucoup : la moyenne arithmétique est toujours la plus élevée dès que les
 * rendements varient, et c'est elle qu'attend un modèle moyenne-variance, dont
 * l'espérance porte sur le rendement d'UNE période tirée au hasard. Le CAGR
 * répondrait à une autre question — ce qu'on aurait gagné en restant investi.
 */
export function rendementMoyenComposite(): {
  moyenne: number;
  annees: { annee: number; rendement: number }[];
} | null {
  const hist = loadIndexHistory("BRVMC").filter((p) => p.value > 0);
  if (hist.length < 2) return null;

  // Dernière clôture de chaque année civile présente dans l'historique.
  const clotures = new Map<number, number>();
  for (const p of hist) {
    const an = Number(p.date.slice(0, 4));
    if (Number.isFinite(an)) clotures.set(an, p.value);
  }
  const anneesTriees = [...clotures.keys()].sort((a, b) => a - b);
  if (anneesTriees.length < 2) return null;

  const rendements: { annee: number; rendement: number }[] = [];
  for (let i = 1; i < anneesTriees.length; i++) {
    const precedente = clotures.get(anneesTriees[i - 1])!;
    const courante = clotures.get(anneesTriees[i])!;
    if (precedente > 0) {
      rendements.push({
        annee: anneesTriees[i],
        rendement: courante / precedente - 1,
      });
    }
  }
  const retenus = rendements.slice(-ANNEES_MARCHE);
  if (retenus.length === 0) return null;

  return {
    moyenne: retenus.reduce((s, r) => s + r.rendement, 0) / retenus.length,
    annees: retenus,
  };
}

/**
 * Part maximale par ligne : le ratio de DIVISION DES RISQUES du fonds, saisi
 * dans ses paramètres.
 *
 * On ne crée pas un réglage de plus. « Valeurs mobilières ou IMM d'un même
 * émetteur » (Art. 41.1 a) dit déjà, pour ce fonds précis, le poids maximal
 * d'une signature — c'est exactement la contrainte de concentration que
 * l'optimisateur doit respecter. Un second champ à côté aurait pu le
 * contredire, et le modèle aurait alors proposé une allocation en infraction
 * avec le règlement du fonds.
 */
const METRIQUE_EMETTEUR = "VM/IMM par émetteur";

export function partMaxDuFonds(ratios: RatioLisible[] | null | undefined): {
  part: number | null;
  libelle: string | null;
} {
  const candidats = (ratios ?? []).filter((r) => {
    const m = (r.metrique ?? "").trim().toLowerCase();
    const l = (r.libelle ?? "").trim().toLowerCase();
    return m === METRIQUE_EMETTEUR.toLowerCase() || l.includes("même émetteur");
  });
  for (const r of candidats) {
    const brut = r.seuilMax ?? r.seuil_max;
    const v = typeof brut === "number" ? brut : Number(String(brut ?? "").replace(",", "."));
    if (Number.isFinite(v) && v > 0) {
      return { part: v / 100, libelle: (r.libelle ?? "").trim() || METRIQUE_EMETTEUR };
    }
  }
  return { part: null, libelle: null };
}

/**
 * Montant à investir : la VALEUR CIBLE de la poche actions telle que
 * l'allocation validée par classe d'actif l'a arrêtée.
 *
 * La cible, et non l'écart à combler : le modèle répartit la poche ENTIÈRE
 * entre les valeurs, puis la confronte aux positions détenues pour en déduire
 * les achats et les ventes. Lui donner le seul argent frais reviendrait à
 * n'arbitrer que celui-ci, en figeant tout ce qui est déjà en portefeuille.
 *
 * La trésorerie à investir y est comprise, puisqu'elle entre dans l'actif net
 * sur lequel la cible de classe s'applique.
 */
export async function pocheActionsCible(
  fundId: string,
  tresorerieAInvestir = 0,
): Promise<{ montant: number | null; cible: number | null }> {
  const tableau = await construireTableauAllocation(fundId, "classe", tresorerieAInvestir);
  const ligne = tableau.lignes.find((l) => l.bucket === "action");
  if (!ligne || ligne.allocationValidee === null || ligne.valeurCible === null) {
    return { montant: null, cible: null };
  }
  return { montant: ligne.valeurCible, cible: ligne.allocationValidee };
}

// ===========================================================================
// Dérogation de l'Art. 41.3 — titres à forte pondération indicielle
// ===========================================================================

/** titres.csv porte des nombres français ; le parseur du dataLoader n'est pas
 *  exporté, et la conversion tient en une ligne. */
const nombreFr = (v: string | null | undefined) => {
  const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Seuil de pondération dans l'indice au-delà duquel la dérogation s'ouvre. */
const SEUIL_FORTE_PONDERATION = 0.1;
/** Métrique du ratio portant la dérogation, telle que le catalogue la nomme. */
const METRIQUE_DEROGATION = "Titre à forte pondération indicielle";
/** Métrique du plafond cumulé des lignes dépassant 15 %. */
const METRIQUE_CUMUL = "Somme des lignes > 15 %";
/** Seuil à partir duquel une ligne entre dans ce cumul. */
export const SEUIL_LIGNE_CUMULEE = 0.15;

/**
 * Poids de chaque valeur dans l'indice, en capitalisation FLOTTANTE.
 *
 * Le flottant, et non la capitalisation totale : c'est la convention des
 * indices, et l'écart n'est pas anecdotique — la SGBCI pèse 11,4 % du flottant
 * pour 7,0 % de la capitalisation totale, soit de part et d'autre du seuil de
 * l'Art. 41.3. Le poids retenu est exposé à l'écran pour que ce choix reste
 * vérifiable plutôt que caché dans un calcul.
 */
export function poidsIndiciels(): Map<string, number> {
  // loadStocks, et non loadAllActions : seule la ligne brute de titres.csv
  // porte le flottant, que le type enrichi n'expose pas.
  const flottant = new Map<string, number>();
  let total = 0;
  for (const s of loadStocks()) {
    const code = (s.code ?? "").trim().toUpperCase();
    const f = nombreFr(s.float) * nombreFr(s.price);
    if (code && Number.isFinite(f) && f > 0) {
      flottant.set(code, f);
      total += f;
    }
  }
  const out = new Map<string, number>();
  if (total <= 0) return out;
  for (const [code, f] of flottant) out.set(code, f / total);
  return out;
}

export type PlafondLigne = {
  code: string;
  /** Plafond applicable à cette ligne, en décimal. */
  plafond: number;
  /** Poids de la valeur dans l'indice. */
  poidsIndice: number | null;
  /** La dérogation de l'Art. 41.3 s'applique à cette ligne. */
  derogation: boolean;
};

function seuilDuRatio(
  ratios: RatioLisible[] | null | undefined,
  metrique: string,
): number | null {
  for (const r of ratios ?? []) {
    if ((r.metrique ?? "").trim().toLowerCase() !== metrique.toLowerCase()) continue;
    const brut = r.seuilMax ?? r.seuil_max;
    const v = typeof brut === "number" ? brut : Number(String(brut ?? "").replace(",", "."));
    if (Number.isFinite(v) && v > 0) return v / 100;
  }
  return null;
}

/**
 * Plafond de concentration LIGNE PAR LIGNE.
 *
 * Le règlement ne pose pas une limite unique. L'Art. 41.1 a plafonne toute
 * signature, mais l'Art. 41.3 relève ce plafond pour un titre pesant plus de
 * 10 % de l'indice : sans cette dérogation, un fonds indiciel de la place ne
 * pourrait pas détenir SONATEL à hauteur de son poids réel, et le modèle
 * proposait une allocation plus contrainte que ce que la loi permet.
 *
 * Le plafond dérogatoire n'est appliqué que s'il est SUPÉRIEUR au plafond
 * général : une dérogation qui restreindrait n'en serait pas une.
 */
export function plafondsParLigne(
  codes: string[],
  ratios: RatioLisible[] | null | undefined,
  poids: Map<string, number>,
): { plafonds: PlafondLigne[]; general: number | null; derogatoire: number | null } {
  const general = partMaxDuFonds(ratios).part;
  const derogatoire = seuilDuRatio(ratios, METRIQUE_DEROGATION);

  const plafonds = codes.map((code) => {
    const c = code.toUpperCase();
    const p = poids.get(c) ?? null;
    const eligible =
      derogatoire !== null &&
      general !== null &&
      derogatoire > general &&
      p !== null &&
      p > SEUIL_FORTE_PONDERATION;
    return {
      code,
      plafond: eligible ? derogatoire : (general ?? 0),
      poidsIndice: p,
      derogation: eligible,
    };
  });
  return { plafonds, general, derogatoire };
}

/** Plafond cumulé des lignes dépassant 15 %, s'il est inscrit au fonds. */
export function plafondCumule(ratios: RatioLisible[] | null | undefined): number | null {
  return seuilDuRatio(ratios, METRIQUE_CUMUL);
}

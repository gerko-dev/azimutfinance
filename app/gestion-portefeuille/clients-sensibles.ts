// === Performance d'un client sensible — par fonds, puis globale ===
//
// UN CLIENT N'EST PAS UNE SOUSCRIPTION. Il entre plusieurs fois, dans
// plusieurs fonds, il reprend une partie de sa mise, il remet au bout de six
// mois. Mesurer chaque souscription contre la VL du jour répond à « combien
// cette ligne-là a-t-elle rapporté » ; le client, lui, demande « combien
// M'avez-vous rapporté ». Ce n'est pas la même question, et ce n'est pas le
// même calcul.
//
// LA RÉPONSE EST LE TRI DES PAIEMENTS — `TRI.PAIEMENTS` au tableur, XIRR
// ailleurs. On pose les mouvements à leurs dates :
//
//   souscription          − ce qu'il verse
//   rachat                + ce qu'il encaisse
//   valorisation du jour  + ce que ses parts valent aujourd'hui
//
// et l'on cherche le taux qui annule la somme actualisée. C'est le rendement
// que son ARGENT a réellement obtenu, dates et montants compris — un retrait
// avant une bonne année ne lui est pas crédité, un renfort avant une mauvaise
// lui est compté.
//
// LA PERFORMANCE GLOBALE EST LA SOMME DES PRODUITS des performances par fonds
// et de leurs poids. Et l'OBJECTIF global se pondère EXACTEMENT PAREIL : sans
// cela on comparerait une performance pondérée à une promesse qui ne l'est
// pas, et l'écart ne voudrait rien dire.
//
// LE POIDS EST LE CAPITAL VERSÉ dans le fonds. C'est le seul qui reste défini
// quand une position est soldée — sa valorisation est alors nulle, et pondérer
// par elle effacerait une performance pourtant réalisée.
//
// MODULE NEUTRE : ni base ni système de fichiers. Il se vérifie sur des
// nombres.

import { fraisPart, partsDuFlux } from "./parts-types";

const JOUR = 86_400_000;

export function joursEntre(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / JOUR,
  );
}

/**
 * DURÉE MINIMALE AVANT D'ANNUALISER. Un taux annuel tiré de douze jours donne
 * des nombres à trois chiffres que personne ne peut lire : +0,4 % en douze
 * jours ressort à +12 % l'an. Sous un mois, on préfère ne rien dire.
 */
export const JOURS_MIN_TRI = 30;

export type Paiement = { date: string; montant: number };

/**
 * TAUX DE RENDEMENT INTERNE À DATES IRRÉGULIÈRES — le `TRI.PAIEMENTS` du
 * tableur, base ACT/365.
 *
 *   Σ Fᵢ / (1 + r) ^ (jᵢ / 365) = 0
 *
 * BISSECTION, ET NON NEWTON SEUL. Newton converge vite quand il converge, et
 * diverge sans prévenir sur les profils à plusieurs changements de signe — un
 * client qui entre, sort, rentre. On encadre donc la racine d'abord, puis on
 * resserre : c'est quelques dizaines d'itérations sur des tableaux de dix
 * lignes, et cela ne rend jamais un nombre faux.
 *
 * Null quand il n'y a pas de racine à trouver : moins de deux flux, ou tous de
 * même signe — un client qui n'a jamais rien récupéré ni rien qui vaille
 * quelque chose n'a pas de rendement, il a une perte totale ou une attente.
 */
export function triPaiements(paiements: Paiement[]): number | null {
  const flux = paiements.filter((p) => Number.isFinite(p.montant) && p.montant !== 0);
  if (flux.length < 2) return null;
  const positifs = flux.some((p) => p.montant > 0);
  const negatifs = flux.some((p) => p.montant < 0);
  if (!positifs || !negatifs) return null;

  const t0 = flux.reduce((d, p) => (p.date < d ? p.date : d), flux[0].date);
  const annees = flux.map((p) => joursEntre(t0, p.date) / 365);

  const vna = (r: number): number => {
    let s = 0;
    for (let i = 0; i < flux.length; i++) {
      // (1 + r) ne doit jamais atteindre zéro : la borne basse s'arrête juste
      // avant −100 %, qui n'est pas un taux mais la disparition du capital.
      s += flux[i].montant / Math.pow(1 + r, annees[i]);
    }
    return s;
  };

  let bas = -0.9999;
  let haut = 1;
  let vBas = vna(bas);
  let vHaut = vna(haut);
  // On repousse la borne haute tant que les deux bouts sont du même côté : un
  // placement qui double en trois mois dépasse 1 000 % l'an, et refuser de
  // l'afficher serait refuser de voir ce qui s'est passé.
  let essais = 0;
  while (vBas * vHaut > 0 && essais < 60) {
    haut = haut * 2 + 1;
    vHaut = vna(haut);
    essais++;
  }
  if (vBas * vHaut > 0) return null;

  for (let i = 0; i < 200; i++) {
    const milieu = (bas + haut) / 2;
    const v = vna(milieu);
    if (Math.abs(v) < 1e-9 || haut - bas < 1e-10) return milieu;
    if (vBas * v <= 0) {
      haut = milieu;
      vHaut = v;
    } else {
      bas = milieu;
      vBas = v;
    }
  }
  return (bas + haut) / 2;
}

/** Ce qu'un flux de parts apporte au calcul, réduit à l'essentiel. */
export type FluxClient = {
  id: string;
  fondsId: string;
  fondsNom: string;
  investisseur: string;
  bureau: string | null;
  sens: "souscription" | "rachat";
  dateOperation: string;
  dateVl: string | null;
  vl: number | null;
  montant: number;
  tauxFrais: number;
  typeClient: "sensible" | "autre";
  performanceCible: number | null;
  dateFin: string | null;
};

/** La VL la plus récente d'un fonds. */
export type VlCourante = { date: string; vl: number };

/** La position d'un client dans UN fonds, tous mouvements confondus. */
export type PositionClientFonds = {
  fondsId: string;
  fondsNom: string;
  /** Total versé, frais d'entrée compris : c'est ce qui a quitté sa poche. */
  souscrit: number;
  /** Total encaissé sur les rachats, net des droits de sortie. */
  rachete: number;
  /** Parts encore détenues, et ce qu'elles valent à la dernière VL publiée. */
  parts: number | null;
  valorisation: number | null;
  dateValorisation: string | null;
  /** TRI des paiements. Null quand il n'y a rien à résoudre, ou trop tôt. */
  perf: number | null;
  /** Objectif du fonds : moyenne des cibles promises, pondérée par les
   *  montants souscrits. Un client qui entre deux fois à deux conditions a un
   *  objectif entre les deux, pas la dernière promesse faite. */
  objectif: number | null;
  ecart: number | null;
  /** Première entrée, et durée courue jusqu'à la valorisation retenue. */
  premiereEntree: string;
  jours: number;
  mouvements: number;
  soldee: boolean;
  reserve: string | null;
};

export type SuiviClientSensible = {
  client: string;
  bureau: string | null;
  fonds: PositionClientFonds[];
  souscritTotal: number;
  racheteTotal: number;
  valorisationTotale: number | null;
  /** Σ (perf du fonds × poids du fonds), poids = capital versé. */
  perfGlobale: number | null;
  /** Σ (objectif du fonds × poids du fonds) — mêmes poids, sinon l'écart ne
   *  compare rien. */
  objectifGlobal: number | null;
  ecartGlobal: number | null;
  reserves: string[];
};

/**
 * Le suivi de chaque client sensible : ses positions fonds par fonds, puis son
 * résultat d'ensemble.
 *
 * UN CLIENT EST UN NOM. Faute d'identifiant investisseur dans le modèle, c'est
 * le libellé saisi qui fait foi — normalisé sur les espaces et la casse, pour
 * que « Kone Aboubacar » et « KONE  ABOUBACAR » ne fassent pas deux clients.
 */
export function suiviClientsSensibles(
  flux: FluxClient[],
  vlCourantes: Record<string, VlCourante>,
  aujourdhui = new Date().toISOString().slice(0, 10),
): SuiviClientSensible[] {
  const retenus = flux.filter(
    (f) => f.typeClient === "sensible" && f.investisseur.trim() !== "",
  );

  const parClient = new Map<string, FluxClient[]>();
  for (const f of retenus) {
    const cle = f.investisseur.trim().replace(/\s+/g, " ").toUpperCase();
    const l = parClient.get(cle) ?? [];
    l.push(f);
    parClient.set(cle, l);
  }

  const suivis: SuiviClientSensible[] = [];

  for (const mouvements of parClient.values()) {
    const parFonds = new Map<string, FluxClient[]>();
    for (const f of mouvements) {
      const l = parFonds.get(f.fondsId) ?? [];
      l.push(f);
      parFonds.set(f.fondsId, l);
    }

    const positions: PositionClientFonds[] = [];
    for (const [fondsId, mvts] of parFonds) {
      positions.push(positionDansUnFonds(fondsId, mvts, vlCourantes, aujourdhui));
    }
    positions.sort((a, b) => b.souscrit - a.souscrit);

    // ── Le global : une somme de produits ───────────────────────────────
    //
    // Les poids se renormalisent sur les fonds QUI ONT UNE PERFORMANCE. Un
    // fonds trop récent, ou dont la VL manque, n'a pas de rendement : lui
    // donner un poids reviendrait à le compter pour zéro, et à tirer vers le
    // bas une moyenne où il n'a rien à faire.
    const mesurables = positions.filter((p) => p.perf !== null && p.souscrit > 0);
    const assiette = mesurables.reduce((s, p) => s + p.souscrit, 0);
    const perfGlobale =
      assiette > 0
        ? mesurables.reduce((s, p) => s + (p.perf as number) * (p.souscrit / assiette), 0)
        : null;

    // L'objectif se pondère sur LES MÊMES fonds et LES MÊMES poids : comparer
    // une performance pondérée sur trois fonds à une promesse pondérée sur
    // quatre ne dirait rien de l'écart.
    const avecObjectif = mesurables.filter((p) => p.objectif !== null);
    const assietteObjectif = avecObjectif.reduce((s, p) => s + p.souscrit, 0);
    const objectifGlobal =
      assietteObjectif > 0
        ? avecObjectif.reduce(
            (s, p) => s + (p.objectif as number) * (p.souscrit / assietteObjectif),
            0,
          )
        : null;

    const reserves: string[] = [];
    const sansPerf = positions.filter((p) => p.perf === null);
    if (sansPerf.length > 0) {
      reserves.push(
        `${sansPerf.length} fonds hors du calcul global : ${sansPerf
          .map((p) => `${p.fondsNom} (${p.reserve ?? "performance indisponible"})`)
          .join(" · ")}`,
      );
    }
    if (objectifGlobal !== null && avecObjectif.length < mesurables.length) {
      reserves.push(
        "L'objectif global ne porte que sur les fonds où une cible a été promise.",
      );
    }

    const valorisations = positions.filter((p) => p.valorisation !== null);
    suivis.push({
      client: mouvements[0].investisseur.trim().replace(/\s+/g, " "),
      bureau: mouvements.find((m) => m.bureau)?.bureau ?? null,
      fonds: positions,
      souscritTotal: positions.reduce((s, p) => s + p.souscrit, 0),
      racheteTotal: positions.reduce((s, p) => s + p.rachete, 0),
      valorisationTotale:
        valorisations.length > 0
          ? valorisations.reduce((s, p) => s + (p.valorisation as number), 0)
          : null,
      perfGlobale,
      objectifGlobal,
      ecartGlobal:
        perfGlobale !== null && objectifGlobal !== null ? perfGlobale - objectifGlobal : null,
      reserves,
    });
  }

  return suivis.sort((a, b) => b.souscritTotal - a.souscritTotal);
}

/** Une position, tous mouvements d'un client dans un fonds. */
function positionDansUnFonds(
  fondsId: string,
  mvts: FluxClient[],
  vlCourantes: Record<string, VlCourante>,
  aujourdhui: string,
): PositionClientFonds {
  const tries = [...mvts].sort((a, b) =>
    dateDuFlux(a).localeCompare(dateDuFlux(b)),
  );
  const paiements: Paiement[] = [];
  let souscrit = 0;
  let rachete = 0;
  let parts = 0;
  let partsConnues = true;
  let cibleProduit = 0;
  let cibleAssiette = 0;

  for (const f of tries) {
    const date = dateDuFlux(f);
    const p = partsDuFlux(f);
    if (f.sens === "souscription") {
      // CE QUI QUITTE SA POCHE, droit d'entrée compris. Les frais sont un coût
      // pour le client : les exclure lui prêterait un rendement qu'il n'a pas
      // eu.
      souscrit += f.montant;
      paiements.push({ date, montant: -f.montant });
      if (p === null) partsConnues = false;
      else parts += p;
      if (f.performanceCible !== null) {
        cibleProduit += f.performanceCible * f.montant;
        cibleAssiette += f.montant;
      }
    } else {
      // CE QU'IL ENCAISSE, net du droit de sortie.
      const net = f.montant - fraisPart(f);
      rachete += net;
      paiements.push({ date, montant: net });
      if (p === null) partsConnues = false;
      else parts -= p;
    }
  }

  const vlCourante = vlCourantes[fondsId] ?? null;
  // Les arrondis de parts laissent des poussières : sous un millième de part,
  // la position est soldée, et la valoriser afficherait trois francs qui ne
  // seraient jamais rachetés.
  const partsRestantes = partsConnues ? Math.max(0, parts) : null;
  const soldee = partsRestantes !== null && partsRestantes < 1e-3;
  const valorisation =
    partsRestantes !== null && vlCourante ? partsRestantes * vlCourante.vl : null;

  if (valorisation !== null && valorisation > 0 && vlCourante) {
    paiements.push({ date: vlCourante.date, montant: valorisation });
  }

  const premiereEntree = dateDuFlux(tries[0]);
  const finMesure = vlCourante?.date ?? aujourdhui;
  const jours = joursEntre(premiereEntree, finMesure);

  let reserve: string | null = null;
  let perf: number | null = null;
  if (!partsConnues) {
    reserve =
      "Un mouvement est sans VL : les parts restantes, donc la valorisation, ne peuvent pas être établies.";
  } else if (!vlCourante && !soldee) {
    reserve = "Aucune VL publiée pour ce fonds : la position ne peut pas être valorisée.";
  } else if (jours < JOURS_MIN_TRI) {
    reserve = `Position ouverte depuis ${jours} jour(s) : un taux annuel n'y aurait aucun sens.`;
  } else {
    perf = triPaiements(paiements);
    if (perf === null) {
      reserve =
        "Aucun flux de sens contraire : le taux de rendement n'a pas de solution.";
    }
  }

  const objectif = cibleAssiette > 0 ? cibleProduit / cibleAssiette : null;

  return {
    fondsId,
    fondsNom: tries[0].fondsNom,
    souscrit,
    rachete,
    parts: partsRestantes,
    valorisation,
    dateValorisation: vlCourante?.date ?? null,
    perf,
    objectif,
    ecart: perf !== null && objectif !== null ? perf - objectif : null,
    premiereEntree,
    jours,
    mouvements: tries.length,
    soldee,
    reserve,
  };
}

/** La date qui compte est celle de la VL — c'est à elle que les parts sont
 *  créées ou détruites. L'ordre ne sert que si aucune VL n'a été retenue. */
function dateDuFlux(f: FluxClient): string {
  return f.dateVl ?? f.dateOperation;
}

import "server-only";

// === Opérations à réaliser — moteur de propositions ===
//
// Ce fichier ne fait que lire et proposer. Rien n'est exécuté : le gérant
// arbitre, le comité valide.

import {
  loadBonds,
  loadIssuances,
  loadListedBondPrices,
  loadUmoaEmissionsAVenir,
  loadUmoaEmissionsPlanifiees,
  loadListedBonds,
  loadUmoaEmissions,
} from "@/lib/dataLoader";
import { coursDe } from "./cours-types";
import { indexerCoursSite } from "./cours-data";
import {
  calculateAverageYield3Months,
  calculateYTMFromCleanPrice,
  formatDateISO,
  priceBondFromYield,
} from "@/lib/bondMath";
import type { Bond, IssuanceResult } from "@/lib/bondsUEMOA";
import {
  classifyOperation,
  theoreticalCleanPrice,
  type EmissionUMOA,
  type ListedBond,
} from "@/lib/listedBondsTypes";

import { construireTableauAllocation } from "./allocation-data";
import { loadCustomSecurities, loadFundPortfolios } from "./portfolio-data";
import type { SavedPosition } from "./portfolio-types";
import {
  ECART_DECOTE_MIN,
  MARGE_PRIX_ACTION,
  RESIDUEL_NEGLIGEABLE,
  type BilanConvergence,
  type RendementNaturelObligataire,
  type EcartPoste,
  type CessionObligation,
  type OperationAction,
  type PaireArbitrage,
  type PlanOperations,
  type SouscriptionAdjudication,
} from "./operations-types";

const num = (v: unknown, d = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }
  return d;
};

const UEMOA_CODES = ["CI", "SN", "BF", "ML", "BJ", "TG", "NE", "GW"];

/** Nombre d'adjudications retenues pour batir la courbe de ce module. */
const NB_ADJUDICATIONS_COURBE = 5;

/**
 * Courbe souveraine LOCALE A CE MODULE : les N dernieres adjudications du pays,
 * positionnees par MATURITE RESIDUELLE, puis interpolation lineaire au residuel
 * vise.
 *
 * Le reste du site utilise calibrateTheoreticalYTM, qui retient toutes les
 * adjudications d'une FENETRE DE 90 JOURS. Les deux approches ont ete mesurees
 * ici, sans fuite d'information :
 *
 *   cessions (prix theorique vs 1 234 cotations effectivement traitees)
 *     fenetre 90 j   err. abs. mediane 2,17 %   couverture  97 %
 *     3 dernieres    err. abs. mediane 2,20 %   couverture 100 %
 *     5 dernieres    err. abs. mediane 2,20 %   couverture 100 %
 *   souscriptions (repli, vs 392 prix marginaux realises)
 *     fenetre 90 j   err. abs. mediane 65 F     couverture  96 %
 *     3 dernieres    err. abs. mediane 68 F     couverture 100 %
 *     5 dernieres    err. abs. mediane 58 F     couverture 100 %
 *
 * Le gain principal est la COUVERTURE : un compte de seances ne peut pas rendre
 * null faute d'activite recente, la ou la fenetre laissait sans prix les Etats
 * qui emettent peu — le calcul retombait alors sur une cote perimee, ou sur le
 * prix plafond.
 *
 * CINQ seances plutot que trois : a precision egale sur les cessions, c'est la
 * meilleure des quatre configurations mesurees sur le repli des souscriptions
 * (58 F). Trois seances suffisent a peupler la courbe, mais une seance atypique
 * y pese un tiers ; cinq amortissent ce risque sans vieillir sensiblement
 * l'echantillon.
 *
 * CONTREPARTIE, a ne pas perdre de vue : supprimer la fenetre, c'est supprimer
 * le garde-fou d'anciennete. Un Etat silencieux depuis huit mois produit
 * desormais un prix, bati sur des seances vieilles d'autant. `ageJours` porte
 * cette information jusqu'a l'appelant, qui doit la faire voir plutot que de
 * presenter un chiffre perime comme courant.
 */
function courbeRecente(
  pays: string,
  dateCible: Date,
  residuelAnnees: number,
  emissions: EmissionUMOA[],
  nb: number = NB_ADJUDICATIONS_COURBE,
): { ytm: number; points: number; ageJours: number; seancesUtilisees: number } | null {
  if (!(residuelAnnees > 0)) return null;
  // Un souverain UEMOA a sa propre courbe ; un supranational se lit sur
  // l'agregat de la zone, faute de courbe propre.
  const estUemoa = UEMOA_CODES.includes(pays);
  const eligibles = emissions
    .filter((e) => {
      if (estUemoa ? e.country !== pays : !UEMOA_CODES.includes(e.country)) return false;
      if (e.type !== "OAT") return false;
      if (e.maturity <= 0 || e.maturity > 50 || e.amount <= 0) return false;
      if (e.weightedAvgYield <= 0 || e.weightedAvgYield > 0.3) return false;
      // Echanges et rachats n'ont pas de rendement de marche : leurs taux sont
      // mecaniques et tirent la courbe vers le bas.
      if (classifyOperation(e.precisions) !== "cash_auction") return false;
      const d = new Date(e.date);
      return !isNaN(d.getTime()) && d <= dateCible;
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, nb);
  if (eligibles.length === 0) return null;

  // Une seance simultanee sert plusieurs maturites : on agrege par residuel,
  // pondere par les montants servis.
  const parResiduel = new Map<number, { rdt: number; montant: number }>();
  for (const e of eligibles) {
    const cle = Math.round(e.maturity * 100) / 100;
    const v = parResiduel.get(cle) ?? { rdt: 0, montant: 0 };
    v.rdt += e.weightedAvgYield * e.amount;
    v.montant += e.amount;
    parResiduel.set(cle, v);
  }
  const points = [...parResiduel.entries()]
    .map(([maturite, v]) => ({ maturite, ytm: v.rdt / v.montant }))
    .sort((a, b) => a.maturite - b.maturite);

  let ytm: number;
  if (residuelAnnees <= points[0].maturite) ytm = points[0].ytm;
  else if (residuelAnnees >= points[points.length - 1].maturite) ytm = points[points.length - 1].ytm;
  else {
    let bas = points[0];
    let haut = points[points.length - 1];
    for (let i = 0; i < points.length - 1; i++) {
      if (points[i].maturite <= residuelAnnees && points[i + 1].maturite >= residuelAnnees) {
        bas = points[i];
        haut = points[i + 1];
        break;
      }
    }
    const ratio = (residuelAnnees - bas.maturite) / (haut.maturite - bas.maturite);
    ytm = bas.ytm + ratio * (haut.ytm - bas.ytm);
  }

  const plusAncienne = eligibles[eligibles.length - 1].date;
  return {
    ytm,
    points: points.length,
    ageJours: Math.round(
      (dateCible.getTime() - new Date(plusAncienne).getTime()) / (24 * 60 * 60 * 1000),
    ),
    seancesUtilisees: eligibles.length,
  };
}

/** Dernier cours coté d'une obligation, et sa date. */
/**
 * Prix theorique d'une obligation : rendement de la courbe souveraine du pays
 * interpole a la maturite residuelle du titre (cf. courbeRecente), applique
 * aux flux propres du titre.
 *
 * Renvoie null quand la courbe n'est pas calibrable — un pays sans aucune
 * adjudication cash exploitable, ou un titre deja echu. On bascule alors sur
 * la cote.
 */
function prixTheorique(
  bond: ListedBond | undefined,
  dateRef: string,
  emissions: EmissionUMOA[],
): { prix: number; ytm: number } | null {
  if (!bond) return null;
  // Voir aussi prixTheoriqueSouverain, plus bas : les deux univers ont chacun
  // leur moteur, et un titre n'appartient qu'a l'un des deux.
  const date = new Date(dateRef);
  const residuelle = anneesRestantes(bond.maturityDate, dateRef);
  if (residuelle === null || residuelle <= 0) return null;
  try {
    const calib = courbeRecente(bond.country, date, residuelle, emissions);
    if (!calib) return null;
    const prix = theoreticalCleanPrice(bond, date, calib.ytm);
    return prix > 0 ? { prix, ytm: calib.ytm } : null;
  } catch {
    return null;
  }
}

/**
 * Prix theorique d'un SOUVERAIN NON COTE — OAT et BAT d'UMOA-Titres.
 *
 * Ces titres ne sont pas dans l'univers BRVM : la recherche par ISIN dans
 * loadListedBonds echouait, `prixTheorique` rendait null, et la cession
 * retombait sur la valorisation d'inventaire. Or le site sait parfaitement les
 * valoriser — il le fait sur les pages « souverains non cotes » et dans le
 * simulateur YTM — par le rendement moyen des adjudications du pays sur trois
 * mois, applique aux flux restants.
 *
 * C'est le meme principe que pour une obligation cotee, avec un autre moteur :
 * les deux univers sont deliberement separes dans ce depot, amortissements et
 * courbes n'y obeissant pas aux memes regles.
 */
function prixTheoriqueSouverain(
  bond: Bond | undefined,
  dateRef: string,
  issuances: IssuanceResult[],
): { prix: number; ytm: number } | null {
  if (!bond) return null;
  try {
    const date = new Date(dateRef);
    const { averageYield } = calculateAverageYield3Months(bond.country, issuances, date);
    if (!(averageYield > 0)) return null;
    const { cleanPrice } = priceBondFromYield(bond, date, averageYield);
    return cleanPrice > 0 ? { prix: cleanPrice, ytm: averageYield } : null;
  } catch {
    return null;
  }
}

function dernierCoursObligation(
  isin: string,
  jusqua: string,
): { prix: number; date: string } | null {
  let best: { prix: number; date: string } | null = null;
  for (const p of loadListedBondPrices()) {
    if (p.isin !== isin) continue;
    if (!(p.cleanPrice > 0) || p.date > jusqua) continue;
    // Séances COTÉES seulement : une cotation sans volume n'est qu'indicative,
    // et ne vaut pas comme prix de cession réalisable.
    if (!(p.volume > 0)) continue;
    if (!best || p.date > best.date) best = { prix: p.cleanPrice, date: p.date };
  }
  return best;
}

/** Nominal par titre en vigueur : la décote se mesure par rapport à lui, pas
 *  par rapport à la face d'émission d'un titre déjà amorti. */
/** Nominal de reference. Le souverain non cote le porte aussi — sans lui, la
 *  decote de cession de ces titres se calculait sur un nominal presume. */
function nominalCourant(
  b: ListedBond | undefined,
  souverain: Bond | undefined,
  fallback: number,
): number {
  const n = num(b?.nominalValue) || num(souverain?.nominalValue);
  return n > 0 ? n : fallback > 0 ? fallback : 10_000;
}

function anneesRestantes(echeance: string, dateRef: string): number | null {
  if (!echeance || !dateRef) return null;
  const ms = new Date(echeance).getTime() - new Date(dateRef).getTime();
  return Number.isFinite(ms) ? ms / (365.25 * 86_400_000) : null;
}

/**
 * Construit le plan d'opérations d'un fonds.
 *
 * `tresorerieAInvestir` est répercutée sur l'allocation, comme dans l'onglet
 * Allocation validée : les montants à réaliser en dépendent.
 */
export async function construirePlanOperations(
  fundId: string,
  tresorerieAInvestir = 0,
): Promise<PlanOperations> {
  const avertissements: string[] = [];

  const [parTitre, parEmetteur, snapshots, customs] = await Promise.all([
    construireTableauAllocation(fundId, "action_titre", tresorerieAInvestir),
    construireTableauAllocation(fundId, "obligation_emetteur", tresorerieAInvestir),
    loadFundPortfolios(fundId),
    loadCustomSecurities(),
  ]);

  const actuel = [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).pop() ?? null;
  const dateInventaire = actuel?.asOfDate ?? null;
  const dateRef = dateInventaire ?? new Date().toISOString().slice(0, 10);
  const customParId = new Map(customs.map((c) => [c.id, c]));

  // ── ACTIONS ──────────────────────────────────────────────────────────────
  //
  // L'axe « par titre » porte une cible par valeur : le montant à réaliser se
  // convertit directement. Le prix limite s'écarte du dernier cours de 2,5 %
  // — vers le BAS à l'achat, vers le HAUT à la vente : on négocie, on ne court
  // pas après l'exécution (cf. MARGE_PRIX_ACTION).
  // Lignes ecartees en cours de route, et pourquoi. Elles nourrissent le bilan
  // de convergence : une ligne qui disparait sans explication est un ecart que
  // personne ne voit.
  const lignesAbandonnees = new Map<string, string>();

  const positionsAction = new Map<string, SavedPosition>();
  for (const p of actuel?.positions ?? []) {
    if (p.section !== "action") continue;
    const cle = (p.matchId || p.rawCode || "").trim().toUpperCase();
    const custom = p.customSecurityId ? customParId.get(p.customSecurityId) : undefined;
    positionsAction.set(custom ? (custom.code || cle).toUpperCase() : cle, p);
  }

  // Les cours du site, bâtis UNE FOIS : les relire par ligne coûterait autant
  // d'appels au fournisseur live qu'il y a de titres à traiter.
  const coursSite = await indexerCoursSite();

  const achatsActions: OperationAction[] = [];
  const ventesActions: OperationAction[] = [];

  for (const l of parTitre.lignes) {
    if (l.montantARealiser === null || Math.abs(l.montantARealiser) < 1) continue;
    const pos = positionsAction.get(l.bucket) ?? null;
    // LE COURS DU SITE, celui de l'inventaire à défaut.
    //
    // Deux corrections en une.
    //
    // L'ORDRE, d'abord : l'inventaire primait, et c'est une faute de
    // raisonnement — on chiffre un ordre à passer AUJOURD'HUI, pas à la date
    // d'arrêté. Entre l'arrêté de fin de mois et le comité qui lit le plan,
    // un titre peut avoir bougé de dix pour cent, et les quantités calculées
    // avec l'ancien cours sont fausses d'autant.
    //
    // LA SOURCE, ensuite : `indexerCoursSite` appelle la fonction même
    // qu'emploient /marches/actions et la fiche de chaque titre. Le plan
    // affiche donc EXACTEMENT le cours que le site affiche — un écart entre
    // les deux écrans, sur un chiffre aussi simple, ruine la confiance dans
    // tout le reste.
    const coursInventaire = num(pos?.price);
    const coursMarche = num(coursDe(coursSite, l.bucket)?.prix);
    const cours = coursMarche > 0 ? coursMarche : coursInventaire;
    const quantiteDetenue = num(pos?.quantity);

    if (!(cours > 0)) {
      avertissements.push(`${l.bucket} : cours indisponible, opération non chiffrable.`);
      lignesAbandonnees.set(l.bucket, "Cours indisponible : opération non chiffrable.");
      continue;
    }

    const achat = l.montantARealiser > 0;
    // On achete SOUS le cours et on vend AU-DESSUS : le prix propose est une
    // position de negociation, pas une limite calee pour passer a coup sur.
    const prixOptimal = Math.round(
      achat ? cours * (1 - MARGE_PRIX_ACTION) : cours * (1 + MARGE_PRIX_ACTION),
    );
    // Arrondi à la baisse : on ne dépasse jamais la cible par arrondi.
    let quantite = Math.floor(Math.abs(l.montantARealiser) / prixOptimal);
    let reserve: string | null = null;

    if (!achat && quantite > quantiteDetenue) {
      quantite = Math.floor(quantiteDetenue);
      reserve = "Vente plafonnée à la quantité détenue.";
    }
    if (quantite === 0) {
      // Montant inferieur au prix d'un titre. La ligne disparaissait ici sans
      // laisser de trace : on la garde dans le bilan de convergence.
      lignesAbandonnees.set(
        l.bucket,
        `Montant à réaliser (${Math.round(Math.abs(l.montantARealiser)).toLocaleString("fr-FR")} F) inférieur au prix d'un titre (${prixOptimal.toLocaleString("fr-FR")} F).`,
      );
      continue;
    }

    const op: OperationAction = {
      sens: achat ? "achat" : "vente",
      code: l.bucket,
      libelle: l.libelle,
      secteur: l.groupe ?? "—",
      quantiteDetenue,
      cours,
      prixOptimal,
      quantite,
      montant: quantite * prixOptimal,
      ecart: l.ecart ?? 0,
      reserve,
    };
    (achat ? achatsActions : ventesActions).push(op);
  }

  achatsActions.sort((a, b) => b.montant - a.montant);
  ventesActions.sort((a, b) => b.montant - a.montant);

  // Adjudications DEJA servies : elles calibrent la courbe souveraine qui donne
  // le prix theorique, et servent de reference de prix marginal.
  const emissionsPassees = loadUmoaEmissions().filter((e) => e.date && e.date <= dateRef);

  // ── OBLIGATIONS : cessions ───────────────────────────────────────────────
  //
  // L'allocation obligataire est arrêtée par émetteur, pas par ligne. Le choix
  // des titres à céder est donc un arbitrage, et le critère est le RENDEMENT :
  // on sort d'abord ce qui rapporte le moins, en conservant les signatures
  // rémunératrices.
  // Les souverains non cotes forment un univers a part : un titre absent de la
  // cote BRVM y est tres souvent present, et parfaitement valorisable.
  const souverainParIsin = new Map<string, Bond>();
  for (const b of loadBonds()) {
    if (b.isin) souverainParIsin.set(b.isin.toUpperCase(), b);
  }
  const adjudications = loadIssuances();

  const bondParIsin = new Map<string, ListedBond>();
  const bondParCode = new Map<string, ListedBond>();
  for (const b of loadListedBonds()) {
    if (b.isin) bondParIsin.set(b.isin.toUpperCase(), b);
    if (b.code) bondParCode.set(b.code.toUpperCase(), b);
  }

  // Postes à alléger : ceux dont le montant à réaliser est négatif.
  const aAlleger = new Map<string, number>();
  const aRenforcer: { poste: string; montant: number }[] = [];
  for (const l of parEmetteur.lignes) {
    if (l.montantARealiser === null) continue;
    if (l.montantARealiser < -1) aAlleger.set(l.bucket, Math.abs(l.montantARealiser));
    else if (l.montantARealiser > 1) aRenforcer.push({ poste: l.bucket, montant: l.montantARealiser });
  }
  aRenforcer.sort((a, b) => b.montant - a.montant);

  // Candidates à la cession : les lignes obligataires des postes à alléger.
  type Candidate = CessionObligation & { montantPoste: number };
  const candidates: Candidate[] = [];
  // Toutes les lignes obligataires, valorisees : l'assiette du rendement naturel.
  const pocheObligataire: { valeur: number; rendement: number | null }[] = [];

  for (const p of actuel?.positions ?? []) {
    if (p.section !== "obligation") continue;
    const valorisation = num(p.valuation);
    if (!(valorisation > 0)) continue;

    const custom = p.customSecurityId ? customParId.get(p.customSecurityId) : undefined;
    const cle = (custom?.isin || custom?.code || p.matchId || p.rawCode || "")
      .trim()
      .toUpperCase();
    const bond = bondParIsin.get(cle) ?? bondParCode.get(cle);
    const souverain = souverainParIsin.get(cle);

    // Poste d'allocation de cette ligne, pour savoir si elle doit être allégée.
    const poste =
      parEmetteur.lignes.find((l) =>
        l.positions.some((x) => x.code.toUpperCase() === (custom?.code || p.rawCode || "").toUpperCase()),
      )?.bucket ?? null;

    const quantiteDetenue = num(p.quantity);
    const nominal = nominalCourant(bond, souverain, num(p.pru));

    // Prix de cession : le PRIX THÉORIQUE d'abord.
    //
    // La cote passait avant, au motif qu'elle seule est réellement obtenable.
    // Mais le marché obligataire régional ne cote que par intermittence : la
    // dernière séance échangée peut remonter à des semaines, et un arbitrage
    // bâti sur un prix périmé décide de céder au mauvais moment. Le prix
    // théorique, lui, est recalculé sur la courbe souveraine du jour — c'est
    // la valeur que le site publie, et la seule disponible pour toutes les
    // lignes en même temps. La cote reste en repli, et la source est affichée.
    const theo =
      prixTheorique(bond, dateRef, emissionsPassees) ??
      prixTheoriqueSouverain(souverain, dateRef, adjudications);
    const cote = bond?.isin ? dernierCoursObligation(bond.isin, dateRef) : null;
    const prixInventaire = quantiteDetenue > 0 ? valorisation / quantiteDetenue : 0;
    const prixCession =
      theo?.prix ?? cote?.prix ?? (prixInventaire > 0 ? prixInventaire : nominal);
    const sourcePrix: CessionObligation["sourcePrix"] = theo
      ? "theorique"
      : cote
        ? "cote"
        : prixInventaire > 0
          ? "inventaire"
          : "nominal";

    // Rendement actuariel au prix de cession : le critère de tri. Un souverain
    // non coté se calcule avec le même moteur actuariel, ses champs ayant la
    // même forme.
    let rendement: number | null = null;
    if (!bond && souverain && prixCession > 0) {
      try {
        const res = calculateYTMFromCleanPrice(souverain, new Date(dateRef), prixCession);
        rendement = res.error ? null : res.ytm;
      } catch {
        rendement = null;
      }
    }
    if (rendement === null && bond && prixCession > 0) {
      try {
        // Signature : (bond, dateOpération, coursPiedDeCoupon) → { ytm, error }.
        const res = calculateYTMFromCleanPrice(
          {
            isin: bond.isin,
            nominalValue: nominal,
            couponRate: bond.couponRate,
            frequency: bond.couponFrequency,
            issueDate: bond.issueDate,
            maturityDate: bond.maturityDate,
          } as never,
          new Date(dateRef),
          prixCession,
        );
        rendement = res.error ? null : res.ytm;
      } catch {
        rendement = null;
      }
    }
    if (rendement === null) {
      // Repli : rendement courant coupon / prix, suffisant pour classer.
      const taux = bond?.couponRate ?? souverain?.couponRate ?? null;
      rendement =
        taux !== null && prixCession > 0 ? (taux * nominal) / prixCession : null;
    }

    // Base de reference du rendement naturel : TOUTE ligne obligataire y entre,
    // qu'elle bouge ou non. Une poche ne se juge pas sur les seules lignes
    // qu'on allege. La valeur retenue est quantite x prix de cession, et non la
    // valorisation d'inventaire : c'est la meme base de prix que celle a
    // laquelle on vend, sans quoi ceder une ligne entiere ne retirerait pas
    // exactement sa contribution.
    pocheObligataire.push({
      valeur: quantiteDetenue > 0 ? quantiteDetenue * prixCession : valorisation,
      rendement,
    });

    if (!poste || !aAlleger.has(poste)) continue;

    candidates.push({
      isin: bond?.isin ?? souverain?.isin ?? cle,
      code: custom?.code || p.rawCode || cle,
      libelle: custom?.name || p.matchLabel || p.rawLabel || "",
      emetteur: bond?.issuer ?? souverain?.issuer ?? "—",
      poste,
      quantiteDetenue,
      rendement,
      couponRate: bond?.couponRate ?? souverain?.couponRate ?? 0,
      maturiteResiduelle: (() => {
        const echeance = bond?.maturityDate ?? souverain?.maturityDate ?? null;
        return echeance ? anneesRestantes(echeance, dateRef) : null;
      })(),
      prixCession,
      ytmTheorique: theo?.ytm ?? null,
      // Renseigne au dimensionnement : l'impact depend du montant cede, qui
      // n'est pas encore connu a ce stade.
      impactRendementBp: null,
      decoteCession: nominal > 0 ? 1 - prixCession / nominal : 0,
      nominalCourant: nominal,
      quantite: 0,
      produitNet: 0,
      sourcePrix,
      reserve: null,
      montantPoste: aAlleger.get(poste) ?? 0,
    });
  }

  // ── RENDEMENT NATUREL DE LA POCHE OBLIGATAIRE ────────────────────────────
  //
  // Le portage de la poche : moyenne des rendements actuariels des lignes,
  // ponderee par leur valeur de marche. C'est ce que le fonds encaisse s'il ne
  // fait rien, et donc la reference contre laquelle chaque operation se juge.
  //
  // Une ligne dont le rendement n'est pas calculable est exclue des DEUX termes
  // du quotient : la faire entrer au numerateur a zero ecraserait la moyenne.
  // `couverture` dit quelle part de la poche l'assiette represente reellement.
  const pocheValorisee = pocheObligataire.filter((x) => x.rendement !== null);
  const valeurPoche = pocheValorisee.reduce((s, x) => s + x.valeur, 0);
  const rendementPoche =
    valeurPoche > 0
      ? pocheValorisee.reduce((s, x) => s + x.valeur * (x.rendement as number), 0) / valeurPoche
      : null;
  const valeurPocheTotale = pocheObligataire.reduce((s, x) => s + x.valeur, 0);

  /**
   * Effet d'une operation sur le rendement de la poche, en points de base.
   *
   * Formule marginale : dR = M (r − R0) / V0, avec M signe (negatif pour une
   * cession). Elle dit la seule chose qui compte pour arbitrer : une operation
   * ne releve le portage que si son rendement s'ecarte de celui de la poche
   * DANS LE BON SENS — acheter au-dessus, vendre en dessous.
   *
   * C'est un developpement au premier ordre : la somme des effets s'ecarte
   * legerement du delta total, qui est recalcule exactement plus bas. L'ecart
   * est le terme du second ordre, d'autant plus visible que le plan deplace une
   * part importante de la poche.
   */
  const impactBp = (montantSigne: number, rendement: number | null): number | null => {
    if (rendement === null || rendementPoche === null || !(valeurPoche > 0)) return null;
    return ((montantSigne * (rendement - rendementPoche)) / valeurPoche) * 10_000;
  };

  // Les plus faibles rendements d'abord : c'est ce qu'on sacrifie en premier.
  candidates.sort((a, b) => (a.rendement ?? 9) - (b.rendement ?? 9));

  const cessionsObligations: CessionObligation[] = [];
  const resteParPoste = new Map(aAlleger);
  for (const c of candidates) {
    const reste = resteParPoste.get(c.poste) ?? 0;
    if (reste < 1) continue;
    const titresPossibles = Math.floor(Math.min(reste / c.prixCession, c.quantiteDetenue));
    if (titresPossibles <= 0) continue;
    const produit = titresPossibles * c.prixCession;
    resteParPoste.set(c.poste, reste - produit);
    // `montantPoste` n'est qu'un accumulateur de travail : il ne sort pas.
    const ligne: CessionObligation = { ...c };
    cessionsObligations.push({
      ...ligne,
      quantite: titresPossibles,
      produitNet: produit,
      // Ceder, c'est retirer du portage : le montant est signe negativement.
      impactRendementBp: impactBp(-produit, c.rendement),
      reserve:
        c.sourcePrix === "theorique"
          ? null
          : c.sourcePrix === "cote"
            ? "Prix théorique non calculable : dernière cotation retenue."
            : c.sourcePrix === "inventaire"
              ? "Ni prix théorique ni cotation : valorisation de l'inventaire, à confirmer au carnet."
              : "Aucun prix disponible : ramené au nominal.",
    });
  }

  const produitCessions = cessionsObligations.reduce((s, c) => s + c.produitNet, 0);
  const decoteCessionMoyenne =
    produitCessions > 0
      ? cessionsObligations.reduce((s, c) => s + c.decoteCession * c.produitNet, 0) /
        produitCessions
      : null;

  // ── OBLIGATIONS : appariement cession ↔ souscription ─────────────────────
  //
  // Chaque cession est mise FACE A FACE avec l'emploi qu'elle finance, et le
  // couple n'est retenu que si la decote d'achat depasse celle de la cession
  // d'au moins ECART_DECOTE_MIN. C'est la traduction litterale de la regle :
  // on ne vend un titre que si l'on sait racheter avec une plus grosse decote.
  //
  // L'ancienne version comparait des MOYENNES : une cession vendue trop cher
  // passait pourvu qu'une autre ligne compense. La moyenne restait valide, et
  // pourtant l'operation detruisait de la valeur.
  //
  // Une cession sans contrepartie suffisante est conservee et MARQUEE. Le
  // module conseille, il ne decide pas : le comite verra l'ecart d'allocation
  // qu'il laisse ouvert, et tranchera.
  const souscriptions: SouscriptionAdjudication[] = [];
  const pairesObligations: PaireArbitrage[] = [];
  const emissions = emissionsPassees;

  // Seances ANNONCEES, par Etat. Viser une adjudication a venir plutot que
  // d'extrapoler une passee : le calendrier UMOA-Titres dit ou l'argent pourra
  // reellement etre place, et a quelle date.
  const seancesAVenir = [...loadUmoaEmissionsAVenir(), ...loadUmoaEmissionsPlanifiees()]
    .filter((e) => e.dateOperation && e.dateOperation >= dateRef)
    .sort((a, b) => a.dateOperation.localeCompare(b.dateOperation));

  const NOMINAL_ADJ = 10_000; // convention UMOA-Titres
  const JOUR_MS = 24 * 60 * 60 * 1000;

  // Seance visee par Etat : il en faut une AVANT de calculer le prix, puisque
  // c'est elle qui date l'emission et, quand elle l'annonce, en donne la
  // maturite.
  type Seance = (typeof seancesAVenir)[number];
  const seanceParEtat = new Map<string, Seance>();
  for (const s of seancesAVenir) {
    const nom = (s.countryName || "").trim();
    if (nom && !seanceParEtat.has(nom)) seanceParEtat.set(nom, s);
  }

  // Les deux calendriers ne portent pas les memes colonnes : le calendrier
  // annuel (EmissionUMOAPlanned) n'annonce ni dates de valeur ni maturite. On
  // lit donc ces champs en les traitant comme optionnels.
  const dateSeance = (s: Seance | null, champ: "dateValeur" | "echeance"): string =>
    s && champ in s ? String((s as Record<string, unknown>)[champ] ?? "").trim() : "";
  const maturiteSeance = (s: Seance | null): number =>
    s && "maturityMonths" in s ? num(s.maturityMonths) : 0;

  /** Mediane, sur une liste non vide. */
  const mediane = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  /**
   * Prix de reference d'un Etat : la DERNIERE adjudication de son tenor, a
   * defaut sa courbe de rendement.
   *
   * Ce choix est adosse a un backtest sur 392 adjudications OAT depuis
   * septembre 2025, rejouees LA VEILLE de chaque seance, sans fuite
   * d'information (erreur absolue mediane sur le prix marginal realise) :
   *
   *   derniere seance du meme tenor (<= 45 j)   28 F   couverture  89 %
   *   moyenne des 6 dernieres du tenor          44 F   couverture  91 %
   *   courbe corrigee du spread marginal/moyen  65 F   couverture  96 %
   *   courbe brute                              73 F   couverture  96 %
   *   ---- combinaison retenue ----             35 F   couverture  97 %
   *
   * Trois enseignements, contre-intuitifs mais nets :
   *
   *  1. MOYENNER NUIT. L'ancienne version moyennait les six dernieres seances
   *     du tenor ; ne garder que la plus recente divise l'erreur par 1,6. La
   *     moyenne fait entrer des niveaux de marche vieux de quatre a six
   *     semaines dans un prix cense valoir aujourd'hui.
   *  2. La colonne « maturite » porte le tenor D'ORIGINE de la souche, fige a
   *     sa creation : la souche togolaise TG0000003391 (echeance 07/04/2031)
   *     est reabondee le 07/04, le 20/04, le 04/05 puis le 13/07 2026 et
   *     affiche « 60 mois » les quatre fois, alors qu'il ne lui reste que 56,8
   *     mois a la derniere. Une observation unique et datee evacue le probleme
   *     que le melange de residuels posait.
   *  3. La courbe ne bat pas l'observation. Calibree sur le rendement MOYEN
   *     PONDERE, elle estime le prix moyen pondere (biais +4 F) et non le prix
   *     marginal, qu'elle surestime de +36 F : s'y fier ferait surpayer. Le
   *     spread marginal/moyen pondere du pays, mesure sur ses douze dernieres
   *     seances, annule ce biais. Reste que son interet est ailleurs : elle
   *     couvre les 8 % de cas ou aucune seance recente n'existe et ou le code
   *     tombait au prix plafond, chiffre sans contenu de marche.
   *
   * Un Etat qui repricie vite reste hors d'atteinte des deux methodes : sur le
   * Niger, l'erreur mediane est de 143 F quoi qu'on fasse.
   */
  const referenceEtat = (etat: string) => {
    const adjEtat = emissions
      .filter((e) => (e.countryName || "").trim() === etat)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (adjEtat.length === 0) return null;

    const seance = seanceParEtat.get(etat) ?? null;
    // OAT seulement : un BAT s'adjuge au TAUX, il n'a ni coupon ni prix pour
    // 10 000 F. Le laisser entrer ferait viser un tenor 12 mois sans prix, et
    // la courbe du pays est elle aussi calibree sur les seules OAT.
    const recentes = adjEtat.filter((e) => e.type === "OAT").slice(0, 6);
    if (recentes.length === 0) return null;

    // Tenor annonce : l'etiquette sous laquelle l'Etat ouvre ses souches.
    const parTenor = new Map<number, number>();
    for (const e of recentes) {
      parTenor.set(e.maturityMonths, (parTenor.get(e.maturityMonths) ?? 0) + 1);
    }
    const tenorDominant = [...parTenor.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const tenorAnnonce = maturiteSeance(seance);
    const maturiteMois = tenorAnnonce || tenorDominant;

    // Residuel effectivement vise.
    const duTenor = recentes.filter((e) => e.maturityMonths === maturiteMois);
    let residuelAns: number;
    const brutValeur = dateSeance(seance, "dateValeur");
    const brutEcheance = dateSeance(seance, "echeance");
    const dValeur = brutValeur ? new Date(brutValeur) : null;
    const dEcheance = brutEcheance ? new Date(brutEcheance) : null;
    if (
      dValeur && dEcheance &&
      !isNaN(dValeur.getTime()) && !isNaN(dEcheance.getTime()) &&
      dEcheance > dValeur
    ) {
      // La seance publie ses deux dates : le residuel est exact.
      residuelAns = (dEcheance.getTime() - dValeur.getTime()) / (365.25 * JOUR_MS);
    } else if (tenorAnnonce > 0) {
      // Elle n'annonce qu'un tenor : souche presumee neuve, residuel = tenor.
      residuelAns = tenorAnnonce / 12;
    } else {
      // Rien d'annonce : on retient le residuel que l'Etat sert vraiment dans
      // ce tenor, pondere par les montants.
      const assiette = duTenor.length > 0 ? duTenor : recentes;
      const poids = assiette.reduce((s, e) => s + Math.max(e.amount, 0), 0);
      residuelAns =
        poids > 0
          ? assiette.reduce((s, e) => s + e.maturity * Math.max(e.amount, 0), 0) / poids
          : assiette.reduce((s, e) => s + e.maturity, 0) / assiette.length;
    }

    const coupon =
      duTenor.find((e) => e.couponRate !== null)?.couponRate ??
      recentes.find((e) => e.couponRate !== null)?.couponRate ??
      null;

    // ── 1. L'OBSERVATION : derniere seance du meme tenor, si elle est fraiche.
    const AGE_MAX_JOURS = 45;
    const oatDuPays = adjEtat.filter(
      (e) => e.type === "OAT" && num(e.marginalPrice) > 0,
    );
    const derniere = oatDuPays.find((e) => e.maturityMonths === maturiteMois) ?? null;
    const ageJours = derniere
      ? (new Date(dateRef).getTime() - new Date(derniere.date).getTime()) / JOUR_MS
      : null;
    const observation =
      derniere && ageJours !== null && ageJours <= AGE_MAX_JOURS ? derniere : null;

    // ── 2. LE REPLI : la courbe du pays, interpolee au residuel vise.
    const codePays = (adjEtat.find((e) => e.country)?.country || "").trim();
    const calib =
      !observation && codePays && residuelAns > 0
        ? courbeRecente(codePays, new Date(dateRef), residuelAns, emissions)
        : null;

    // La courbe estime le prix MOYEN PONDERE. Le spread que l'Etat met entre
    // son prix moyen et son prix marginal le ramene sur la bonne cible.
    const ecarts = oatDuPays
      .filter((e) => num(e.weightedAvgPrice) > 0)
      .slice(0, 12)
      .map((e) => num(e.weightedAvgPrice) - num(e.marginalPrice));
    const spreadMarginal = ecarts.length >= 3 ? mediane(ecarts) : 0;

    // Souche synthetique : nominal 10 000, coupon annuel, emise a la date de la
    // seance visee. A l'emission le couru est nul, prix pied de coupon = prix
    // paye.
    let titre: Bond | null = null;
    if (coupon !== null && residuelAns > 0) {
      const d0 = new Date(
        dateSeance(seance, "dateValeur") || seance?.dateOperation || dateRef,
      );
      if (!isNaN(d0.getTime())) {
        const dEch = new Date(d0.getTime() + residuelAns * 365.25 * JOUR_MS);
        titre = {
          nominalValue: NOMINAL_ADJ,
          couponRate: coupon,
          frequency: 1,
          issueDate: formatDateISO(d0),
          maturityDate: formatDateISO(dEch),
        } as Bond;
      }
    }

    let prixCourbe: number | null = null;
    if (calib && titre) {
      try {
        const p = priceBondFromYield(titre, new Date(titre.issueDate), calib.ytm);
        const corrige = p.cleanPrice - spreadMarginal;
        // Garde-fou : une courbe degeneree ne doit pas produire un prix aberrant.
        if (corrige > 1_000 && corrige < 20_000) prixCourbe = corrige;
      } catch {
        prixCourbe = null;
      }
    }

    // L'observation prime, la courbe supplee. Le residuel affiche suit la
    // source retenue : celui de la souche observee, sinon celui qu'on a vise.
    const prixReference = observation ? num(observation.marginalPrice) : prixCourbe;
    const residuelRetenu = observation ? observation.maturity * 12 : residuelAns * 12;
    if (prixReference === null) return null;

    return {
      maturiteMois,
      residuelMois: residuelRetenu,
      nbAdjudications: recentes.length,
      prixMarginalObserve: prixReference,
      ytmCourbe: observation ? observation.weightedAvgYield : (calib?.ytm ?? null),
      pointsCourbe: observation ? 0 : (calib?.points ?? 0),
      ageCourbe: observation ? null : (calib?.ageJours ?? null),
      sourcePrix: (observation ? "observe" : "courbe") as "observe" | "courbe",
      dateObservation: observation?.date ?? null,
      ageObservation: observation && ageJours !== null ? Math.round(ageJours) : null,
      coupon: observation?.couponRate ?? coupon,
      titre,
      seance,
    };
  };

  const resteARenforcer = new Map(aRenforcer.map((x) => [x.poste, x.montant]));

  for (const cession of cessionsObligations) {
    // La contrepartie doit battre la decote de CETTE cession, pas la moyenne.
    const decoteAchatMin = cession.decoteCession + ECART_DECOTE_MIN;
    const prixPlafond = NOMINAL_ADJ * (1 - decoteAchatMin);

    // Produit encore a employer pour CETTE cession. Il se repartit sur
    // plusieurs Etats si le premier ne peut pas tout absorber.
    let produitRestant = cession.produitNet;
    let employeeAuMoinsUneFois = false;

    // Une cession peut alimenter plusieurs Etats : tant qu'il reste du produit
    // et un Etat capable d'en prendre, on continue.
    //
    // L'ancienne version versait TOUT le produit au seul Etat le moins cher.
    // `reste` ne servait qu'a le rendre eligible, jamais a borner le montant :
    // un Etat a qui il manquait 1 M recevait les 50 M de la cession, son besoin
    // passait a -49 M, et l'ecart d'allocation, loin de se refermer, changeait
    // de signe. Le montant est desormais plafonne par le besoin, et le reliquat
    // part vers l'Etat suivant au lieu d'etre perdu ou impose.
    for (;;) {
      if (produitRestant < 1) break;

      let meilleure: {
        etat: string;
        ref: NonNullable<ReturnType<typeof referenceEtat>>;
        prix: number;
        besoin: number;
      } | null = null;

      for (const [etat, reste] of resteARenforcer) {
        if (reste < 1) continue;
        const ref = referenceEtat(etat);
        if (!ref) continue;
        // Le prix soumis ne peut pas depasser le plafond : au-dela, l'arbitrage
        // n'a plus de raison d'etre. On ne surenchérit pas non plus au-dessus du
        // marginal observe, qui est le prix auquel l'Etat sert deja.
        const prix = Math.floor(Math.min(ref.prixMarginalObserve ?? prixPlafond, prixPlafond));
        if (!(prix > 0)) continue;
        // Il faut que l'Etat puisse absorber au moins un titre.
        if (reste < prix) continue;
        // A egalite de faisabilite, on prend la decote la plus forte.
        if (!meilleure || prix < meilleure.prix) {
          meilleure = { etat, ref, prix, besoin: reste };
        }
      }

      if (!meilleure || prixPlafond <= 0) {
        // Rien (de plus) a faire de ce produit : on le dit, une seule fois.
        if (!employeeAuMoinsUneFois) {
          pairesObligations.push({
            cession,
            souscription: null,
            margeDecote: null,
            impactNetBp: null,
            motifSansContrepartie:
              prixPlafond <= 0
                ? `Décote de cession déjà de ${(cession.decoteCession * 100).toFixed(2)} % : aucun prix d'achat ne peut faire mieux de ${(ECART_DECOTE_MIN * 100).toFixed(1)} pt.`
                : "Aucun État à renforcer n'offre une décote d'achat supérieure : la cession est proposée sans emploi, à arbitrer en comité.",
          });
        }
        break;
      }

      const { etat, ref, prix, besoin } = meilleure;
      // Le montant souscrit ne depasse ni le produit disponible, ni le besoin.
      const enveloppe = Math.min(produitRestant, besoin);
      const quantite = Math.floor(enveloppe / prix);
      if (quantite <= 0) break; // enveloppe inferieure au prix d'un titre
      const montant = quantite * prix;
      const decoteAchat = 1 - prix / NOMINAL_ADJ;
      const seance = ref.seance;

      resteARenforcer.set(etat, besoin - montant);
      produitRestant -= montant;
      employeeAuMoinsUneFois = true;

      // Rendement attendu : le YTM reellement obtenu au prix soumis, et non
      // plus le rendement facial coupon/prix. Le prix propose est plafonne puis
      // arrondi a l'unite inferieure ; le rendement doit suivre ce prix-la,
      // sans quoi le couple prix/rendement affiche est incoherent.
      let rendementAttendu: number | null = null;
      if (ref.titre && prix > 0) {
        try {
          const r = calculateYTMFromCleanPrice(ref.titre, new Date(ref.titre.issueDate), prix);
          if (!r.error && r.ytm > 0 && r.ytm < 0.5) rendementAttendu = r.ytm;
        } catch {
          rendementAttendu = null;
        }
      }
      if (rendementAttendu === null && ref.coupon !== null && prix > 0) {
        rendementAttendu = (ref.coupon * NOMINAL_ADJ) / prix;
      }

      const refArrondie = Math.round(ref.prixMarginalObserve ?? 0);
      const residuel = `${ref.residuelMois.toFixed(1)} mois résiduels`;
      const originePrix =
        ref.sourcePrix === "observe"
          ? `prix marginal ${refArrondie} F effectivement sorti le ${ref.dateObservation} sur le ${ref.maturiteMois} mois (${ref.ageObservation} j, ${residuel})`
          : `aucune adjudication du ${ref.maturiteMois} mois depuis plus de 45 jours : prix de référence ${refArrondie} F reconstruit sur la courbe ${etat} — ${NB_ADJUDICATIONS_COURBE} dernières adjudications, ${ref.pointsCourbe} point(s) de maturité, la plus ancienne remontant à ${ref.ageCourbe} jours, rendement interpolé ${((ref.ytmCourbe ?? 0) * 100).toFixed(2)} % à ${residuel}, corrigé de l'écart marginal/moyen pondéré`;

      const souscription: SouscriptionAdjudication = {
        etat,
        // Tenor annonce par l'Etat. La duree reellement achetee, elle, est le
        // residuel : une souche reabondee porte toujours son etiquette d'origine.
        maturiteMois: ref.maturiteMois,
        residuelMois: ref.residuelMois,
        prixMarginalObserve: ref.prixMarginalObserve,
        sourcePrixReference: ref.sourcePrix,
        ytmCourbe: ref.ytmCourbe,
        dateObservation: ref.dateObservation,
        ageObservation: ref.ageObservation,
        dateSeance: seance?.dateOperation ?? null,
        instrument: seance?.instrument || null,
        prixPropose: prix,
        decoteAchat,
        rendementAttendu,
        coupon: ref.coupon,
        montantDisponible: enveloppe,
        quantite,
        montant,
        impactRendementBp: impactBp(montant, rendementAttendu),
        methode: seance
          ? `Séance du ${seance.dateOperation} (${seance.instrument || "titre"}) : ${originePrix}, puis plafonné à ${prix} F pour conserver ${(ECART_DECOTE_MIN * 100).toFixed(1)} pt de décote de plus que la cession en regard.`
          : `Aucune séance annoncée pour ${etat} : ${originePrix}, plafonné à ${prix} F.`,
        reserve:
          besoin < produitRestant + montant
            ? `Souscription plafonnée au besoin de ${etat} (${Math.round(besoin).toLocaleString("fr-FR")} F) : le solde du produit part sur un autre État.`
            : seance
              ? null
              : "Aucune adjudication annoncée à ce jour : la souscription suppose une séance à venir.",
      };
      souscriptions.push(souscription);
      pairesObligations.push({
        cession,
        souscription,
        margeDecote: decoteAchat - cession.decoteCession,
        // Effet net de l'aller-retour. Une cession peut alimenter plusieurs
        // Etats : on n'impute a cette paire que la part de la cession
        // effectivement employee ici, sans quoi le meme desinvestissement
        // serait compte autant de fois qu'il y a de souscriptions.
        impactNetBp:
          (impactBp(-montant, cession.rendement) ?? 0) +
          (souscription.impactRendementBp ?? 0),
        motifSansContrepartie: null,
      });
    }
  }

  const montantSouscrit = souscriptions.reduce((s, x) => s + x.montant, 0);
  const decoteAchatMoyenne =
    montantSouscrit > 0
      ? souscriptions.reduce((s, x) => s + x.decoteAchat * x.montant, 0) / montantSouscrit
      : null;

  const arbitrageValide =
    decoteCessionMoyenne === null ||
    decoteAchatMoyenne === null ||
    decoteAchatMoyenne > decoteCessionMoyenne;

  if (!arbitrageValide) {
    avertissements.push(
      `Décote d'achat (${((decoteAchatMoyenne ?? 0) * 100).toFixed(2)} %) inférieure ou égale à la décote de cession (${((decoteCessionMoyenne ?? 0) * 100).toFixed(2)} %) : l'arbitrage vendrait bon marché pour racheter cher. Revoir les prix avant de soumettre.`,
    );
  }
  if (produitCessions > 0 && montantSouscrit < produitCessions * 0.9) {
    avertissements.push(
      `${Math.round(produitCessions - montantSouscrit).toLocaleString("fr-FR")} F de produit de cession non réemployés : aucun État à renforcer ne les absorbe.`,
    );
  }
  if (!actuel) {
    avertissements.push("Aucun inventaire : aucune opération ne peut être proposée.");
  }

  // ── RENDEMENT NATUREL APRES PLAN ─────────────────────────────────────────
  //
  // Recalcule EXACTEMENT, et non par somme des effets marginaux : on refait le
  // quotient avec la poche telle qu'elle sera. L'ecart entre ce delta et la
  // somme des colonnes est le terme du second ordre, et il est publie tel quel
  // plutot que masque.
  //
  // Une cession dont le rendement n'est pas calculable est ecartee des deux
  // termes, comme dans l'assiette de depart : sinon on retirerait de la valeur
  // sans retirer le portage correspondant, et le rendement apres serait faux.
  let numerateurApres =
    rendementPoche !== null ? rendementPoche * valeurPoche : 0;
  let valeurApres = valeurPoche;
  for (const c of cessionsObligations) {
    if (c.rendement === null) continue;
    numerateurApres -= c.produitNet * c.rendement;
    valeurApres -= c.produitNet;
  }
  for (const s of souscriptions) {
    if (s.rendementAttendu === null) continue;
    numerateurApres += s.montant * s.rendementAttendu;
    valeurApres += s.montant;
  }
  const rendementApres =
    rendementPoche !== null && valeurApres > 0 ? numerateurApres / valeurApres : null;

  const sommeImpactsBp =
    cessionsObligations.reduce((s, c) => s + (c.impactRendementBp ?? 0), 0) +
    souscriptions.reduce((s, x) => s + (x.impactRendementBp ?? 0), 0);
  const deltaBp =
    rendementPoche !== null && rendementApres !== null
      ? (rendementApres - rendementPoche) * 10_000
      : null;

  const rendementNaturel: RendementNaturelObligataire = {
    avant: rendementPoche,
    apres: rendementApres,
    deltaBp,
    valeurAvant: valeurPoche,
    valeurApres: valeurApres,
    lignesValorisees: pocheValorisee.length,
    lignesTotal: pocheObligataire.length,
    couverture: valeurPocheTotale > 0 ? valeurPoche / valeurPocheTotale : null,
    sommeImpactsBp,
    residuSecondOrdreBp: deltaBp !== null ? deltaBp - sommeImpactsBp : null,
  };

  if (
    rendementNaturel.couverture !== null &&
    rendementNaturel.couverture < 0.9 &&
    pocheObligataire.length > 0
  ) {
    avertissements.push(
      `Rendement naturel calculé sur ${(rendementNaturel.couverture * 100).toFixed(0)} % de la poche obligataire seulement ` +
        `(${rendementNaturel.lignesValorisees} ligne(s) sur ${rendementNaturel.lignesTotal}) : les impacts affichés sont indicatifs.`,
    );
  }
  if (deltaBp !== null && deltaBp < 0) {
    avertissements.push(
      `Le plan abaisse le rendement naturel de la poche obligataire de ${Math.abs(deltaBp).toFixed(0)} pb ` +
        `(${((rendementPoche ?? 0) * 100).toFixed(2)} % → ${((rendementApres ?? 0) * 100).toFixed(2)} %). L'arbitrage gagne en décote mais perd en portage.`,
    );
  }

  // ── BILAN DE CONVERGENCE ─────────────────────────────────────────────────
  //
  // Le plan proposait des operations sans jamais dire s'il refermait l'ecart
  // d'allocation. Or il ne le referme pas toujours : arrondis a l'entier
  // inferieur, ventes bornees par la quantite detenue, cessions sans
  // contrepartie acceptable, montants trop petits pour un titre. On confronte
  // donc, poste par poste, ce qui etait vise a ce qui est effectivement couvert.
  const couvertureActions = new Map<string, number>();
  for (const o of achatsActions) {
    couvertureActions.set(o.code, (couvertureActions.get(o.code) ?? 0) + o.montant);
  }
  for (const o of ventesActions) {
    couvertureActions.set(o.code, (couvertureActions.get(o.code) ?? 0) - o.montant);
  }
  const couvertureObligations = new Map<string, number>();
  for (const c of cessionsObligations) {
    couvertureObligations.set(c.poste, (couvertureObligations.get(c.poste) ?? 0) - c.produitNet);
  }
  for (const s of souscriptions) {
    couvertureObligations.set(s.etat, (couvertureObligations.get(s.etat) ?? 0) + s.montant);
  }

  const postesConvergence: EcartPoste[] = [];
  const ajouterEcarts = (
    lignes: typeof parTitre.lignes,
    axe: "action" | "obligation",
    couverture: Map<string, number>,
  ) => {
    for (const l of lignes) {
      if (l.montantARealiser === null || Math.abs(l.montantARealiser) < 1) continue;
      const vise = l.montantARealiser;
      const couvert = couverture.get(l.bucket) ?? 0;
      const residuel = vise - couvert;
      postesConvergence.push({
        poste: l.bucket,
        axe,
        vise,
        couvert,
        residuel,
        motif:
          Math.abs(residuel) < RESIDUEL_NEGLIGEABLE
            ? null
            : (lignesAbandonnees.get(l.bucket) ??
              (couvert === 0
                ? vise > 0
                  ? "Aucun emploi trouvé : aucune cession ne finance ce renforcement avec une décote suffisante."
                  : "Aucune cession proposée : ni prix exploitable, ni quantité détenue suffisante."
                : "Couverture partielle : arrondi à l'entier, quantité détenue ou besoin de l'État limitant.")),
      });
    }
  };
  ajouterEcarts(parTitre.lignes, "action", couvertureActions);
  ajouterEcarts(parEmetteur.lignes, "obligation", couvertureObligations);

  const besoinTotal = postesConvergence.reduce((s, p) => s + Math.abs(p.vise), 0);
  const couvertTotal = postesConvergence.reduce((s, p) => s + Math.abs(p.couvert), 0);
  const postesNonResolus = postesConvergence.filter(
    (p) => Math.abs(p.residuel) >= RESIDUEL_NEGLIGEABLE,
  ).length;
  const convergence: BilanConvergence = {
    postes: postesConvergence.sort((a, b) => Math.abs(b.residuel) - Math.abs(a.residuel)),
    besoinTotal,
    couvertTotal,
    tauxCouverture: besoinTotal > 0 ? couvertTotal / besoinTotal : null,
    postesNonResolus,
  };

  if (postesNonResolus > 0) {
    avertissements.push(
      `${postesNonResolus} poste(s) restent hors cible après application du plan : ` +
        `${Math.round(besoinTotal - couvertTotal).toLocaleString("fr-FR")} F d'écart d'allocation non refermé. Voir le bilan de convergence.`,
    );
  }

  return {
    achatsActions,
    ventesActions,
    cessionsObligations,
    souscriptions,
    pairesObligations,
    produitCessions,
    montantSouscrit,
    decoteCessionMoyenne,
    decoteAchatMoyenne,
    arbitrageValide,
    rendementNaturel,
    convergence,
    dateInventaire,
    avertissements,
  };
}

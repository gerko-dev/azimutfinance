import "server-only";

// === Opérations à réaliser — moteur de propositions ===
//
// Ce fichier ne fait que lire et proposer. Rien n'est exécuté : le gérant
// arbitre, le comité valide.

import {
  getLatestSikaQuote,
  loadListedBondPrices,
  loadListedBonds,
  loadUmoaEmissions,
} from "@/lib/dataLoader";
import { calculateYTMFromCleanPrice } from "@/lib/bondMath";
import type { ListedBond } from "@/lib/listedBondsTypes";

import { construireTableauAllocation } from "./allocation-data";
import { loadCustomSecurities, loadFundPortfolios } from "./portfolio-data";
import type { SavedPosition } from "./portfolio-types";
import {
  ECART_DECOTE_MIN,
  MARGE_PRIX_ACTION,
  type CessionObligation,
  type OperationAction,
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

/** Dernier cours coté d'une obligation, et sa date. */
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
function nominalCourant(b: ListedBond | undefined, fallback: number): number {
  const n = num(b?.nominalValue);
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
  // convertit directement. Le prix limite s'écarte du dernier cours d'un point
  // — vers le haut à l'achat, vers le bas à la vente — parce que le carnet
  // BRVM est peu profond et qu'un ordre au cours exact reste souvent non
  // exécuté.
  const positionsAction = new Map<string, SavedPosition>();
  for (const p of actuel?.positions ?? []) {
    if (p.section !== "action") continue;
    const cle = (p.matchId || p.rawCode || "").trim().toUpperCase();
    const custom = p.customSecurityId ? customParId.get(p.customSecurityId) : undefined;
    positionsAction.set(custom ? (custom.code || cle).toUpperCase() : cle, p);
  }

  const achatsActions: OperationAction[] = [];
  const ventesActions: OperationAction[] = [];

  for (const l of parTitre.lignes) {
    if (l.montantARealiser === null || Math.abs(l.montantARealiser) < 1) continue;
    const pos = positionsAction.get(l.bucket) ?? null;
    const coursInventaire = num(pos?.price);
    const cours = coursInventaire > 0 ? coursInventaire : num(getLatestSikaQuote(l.bucket)?.price);
    const quantiteDetenue = num(pos?.quantity);

    if (!(cours > 0)) {
      avertissements.push(`${l.bucket} : cours indisponible, opération non chiffrable.`);
      continue;
    }

    const achat = l.montantARealiser > 0;
    const prixOptimal = Math.round(
      achat ? cours * (1 + MARGE_PRIX_ACTION) : cours * (1 - MARGE_PRIX_ACTION),
    );
    // Arrondi à la baisse : on ne dépasse jamais la cible par arrondi.
    let quantite = Math.floor(Math.abs(l.montantARealiser) / prixOptimal);
    let reserve: string | null = null;

    if (!achat && quantite > quantiteDetenue) {
      quantite = Math.floor(quantiteDetenue);
      reserve = "Vente plafonnée à la quantité détenue.";
    }
    if (quantite === 0) {
      continue; // montant inférieur au prix d'un titre : rien à proposer
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

  // ── OBLIGATIONS : cessions ───────────────────────────────────────────────
  //
  // L'allocation obligataire est arrêtée par émetteur, pas par ligne. Le choix
  // des titres à céder est donc un arbitrage, et le critère est le RENDEMENT :
  // on sort d'abord ce qui rapporte le moins, en conservant les signatures
  // rémunératrices.
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

  for (const p of actuel?.positions ?? []) {
    if (p.section !== "obligation") continue;
    const valorisation = num(p.valuation);
    if (!(valorisation > 0)) continue;

    const custom = p.customSecurityId ? customParId.get(p.customSecurityId) : undefined;
    const cle = (custom?.isin || custom?.code || p.matchId || p.rawCode || "")
      .trim()
      .toUpperCase();
    const bond = bondParIsin.get(cle) ?? bondParCode.get(cle);

    // Poste d'allocation de cette ligne, pour savoir si elle doit être allégée.
    const poste =
      parEmetteur.lignes.find((l) =>
        l.positions.some((x) => x.code.toUpperCase() === (custom?.code || p.rawCode || "").toUpperCase()),
      )?.bucket ?? null;
    if (!poste || !aAlleger.has(poste)) continue;

    const quantiteDetenue = num(p.quantity);
    const nominal = nominalCourant(bond, num(p.pru));

    // Prix de cession : le dernier cours COTÉ d'abord — c'est le seul prix
    // réellement obtenable. À défaut, la valorisation de l'inventaire.
    const cote = bond?.isin ? dernierCoursObligation(bond.isin, dateRef) : null;
    const prixInventaire = quantiteDetenue > 0 ? valorisation / quantiteDetenue : 0;
    const prixCession = cote?.prix ?? (prixInventaire > 0 ? prixInventaire : nominal);
    const sourcePrix: CessionObligation["sourcePrix"] = cote
      ? "cote"
      : prixInventaire > 0
        ? "inventaire"
        : "theorique";

    // Rendement actuariel au prix de cession : le critère de tri.
    let rendement: number | null = null;
    if (bond && prixCession > 0) {
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
    if (rendement === null && bond) {
      // Repli : rendement courant coupon / prix, suffisant pour classer.
      rendement = prixCession > 0 ? (bond.couponRate * nominal) / prixCession : null;
    }

    candidates.push({
      isin: bond?.isin ?? cle,
      code: custom?.code || p.rawCode || cle,
      libelle: custom?.name || p.matchLabel || p.rawLabel || "",
      emetteur: bond?.issuer ?? "—",
      poste,
      quantiteDetenue,
      rendement,
      couponRate: bond?.couponRate ?? 0,
      maturiteResiduelle: bond ? anneesRestantes(bond.maturityDate, dateRef) : null,
      prixCession,
      decoteCession: nominal > 0 ? 1 - prixCession / nominal : 0,
      nominalCourant: nominal,
      quantite: 0,
      produitNet: 0,
      sourcePrix,
      reserve: null,
      montantPoste: aAlleger.get(poste) ?? 0,
    });
  }

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
      reserve:
        c.sourcePrix === "cote"
          ? null
          : c.sourcePrix === "inventaire"
            ? "Aucune cotation récente : prix repris de l'inventaire, à confirmer au carnet."
            : "Ni cotation ni valorisation : prix ramené au nominal.",
    });
  }

  const produitCessions = cessionsObligations.reduce((s, c) => s + c.produitNet, 0);
  const decoteCessionMoyenne =
    produitCessions > 0
      ? cessionsObligations.reduce((s, c) => s + c.decoteCession * c.produitNet, 0) /
        produitCessions
      : null;

  // ── OBLIGATIONS : emploi en adjudication ─────────────────────────────────
  //
  // Le produit des cessions finance les États à renforcer. Le prix proposé
  // part du prix marginal moyen des dernières adjudications de l'État, et doit
  // laisser une décote SUPÉRIEURE à celle des cessions : sinon on vend bon
  // marché pour racheter cher, ce qui détruit de la valeur à chaque rotation.
  const souscriptions: SouscriptionAdjudication[] = [];
  const emissions = loadUmoaEmissions().filter((e) => e.date && e.date <= dateRef);

  let disponible = produitCessions;
  for (const cible of aRenforcer) {
    if (disponible < 1) break;

    const adjEtat = emissions
      .filter((e) => (e.countryName || "").trim() === cible.poste)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6);

    if (adjEtat.length === 0) {
      souscriptions.push({
        etat: cible.poste,
        maturiteMois: 0,
        prixMarginalObserve: null,
        prixPropose: 0,
        decoteAchat: 0,
        rendementAttendu: null,
        montantDisponible: disponible,
        quantite: 0,
        montant: 0,
        methode: "—",
        reserve: `Aucune adjudication récente pour ${cible.poste} : prix non estimable.`,
      });
      continue;
    }

    // Maturité la plus fréquemment servie par cet État : la plus susceptible
    // de revenir à la prochaine adjudication.
    const parMaturite = new Map<number, number>();
    for (const e of adjEtat) {
      parMaturite.set(e.maturityMonths, (parMaturite.get(e.maturityMonths) ?? 0) + 1);
    }
    const maturiteMois = [...parMaturite.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const prixObserves = adjEtat
      .filter((e) => e.maturityMonths === maturiteMois && num(e.marginalPrice) > 0)
      .map((e) => num(e.marginalPrice));
    const prixMarginalObserve =
      prixObserves.length > 0
        ? prixObserves.reduce((s, x) => s + x, 0) / prixObserves.length
        : null;

    const nominalAdj = 10_000; // convention UMOA-Titres
    // Prix proposé : le marginal observé, plafonné pour garantir l'écart de
    // décote exigé. Soumettre au-dessus de ce plafond ferait perdre à
    // l'arbitrage sa raison d'être.
    const decoteCessionRef = decoteCessionMoyenne ?? 0;
    const decoteAchatMin = decoteCessionRef + ECART_DECOTE_MIN;
    const prixPlafond = nominalAdj * (1 - decoteAchatMin);
    const prixPropose = Math.round(
      Math.min(prixMarginalObserve ?? prixPlafond, prixPlafond),
    );
    const decoteAchat = 1 - prixPropose / nominalAdj;

    const quantite = Math.floor(disponible / prixPropose);
    const montant = quantite * prixPropose;
    disponible -= montant;

    const coupon = adjEtat.find((e) => e.maturityMonths === maturiteMois)?.couponRate ?? null;
    const rendementAttendu =
      coupon !== null && prixPropose > 0 ? (coupon * nominalAdj) / prixPropose : null;

    souscriptions.push({
      etat: cible.poste,
      maturiteMois,
      prixMarginalObserve,
      prixPropose,
      decoteAchat,
      rendementAttendu,
      montantDisponible: disponible + montant,
      quantite,
      montant,
      methode:
        prixMarginalObserve !== null && prixPropose < prixMarginalObserve
          ? `Prix marginal moyen ${Math.round(prixMarginalObserve)} F sur ${adjEtat.length} adjudication(s), abaissé à ${prixPropose} F pour conserver ${(ECART_DECOTE_MIN * 100).toFixed(1)} pt de décote de plus qu'à la cession.`
          : `Prix marginal moyen des ${adjEtat.length} dernière(s) adjudication(s) de ${cible.poste}, maturité ${maturiteMois} mois.`,
      reserve:
        quantite === 0
          ? "Produit de cession insuffisant pour un titre à ce prix."
          : null,
    });
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

  return {
    achatsActions,
    ventesActions,
    cessionsObligations,
    souscriptions,
    produitCessions,
    montantSouscrit,
    decoteCessionMoyenne,
    decoteAchatMoyenne,
    arbitrageValide,
    dateInventaire,
    avertissements,
  };
}

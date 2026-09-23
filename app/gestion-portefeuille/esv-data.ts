import "server-only";

// === ESV — construction du calendrier ===
//
// LE CALENDRIER NE SE STOCKE PAS, IL SE CALCULE. Il est la rencontre de deux
// choses que le site connaît déjà : ce que le fonds DÉTIENT — son inventaire —
// et ce que chaque titre DOIT PAYER — les échéanciers du référentiel.
//
// Les figer en base aurait créé une seconde vérité, qui aurait divergé du
// référentiel dès la première correction d'échéancier, et le gérant aurait eu
// deux calendriers sans savoir lequel croire.
//
// Seul le POINTAGE se stocke : qu'un flux ait été reçu, quand et pour combien.
// Aucun calcul ne peut le deviner.
//
// TROIS GISEMENTS, TROIS DEGRÉS DE CERTITUDE :
//
//   obligations cotées — échéancier complet du référentiel BRVM, coupons,
//                        amortissements et remboursement. C'est un contrat.
//   titres publics     — coupons et remboursement reconstruits par le calcul
//                        actuariel du site. Contrat aussi, mais reconstitué.
//   actions            — l'AVIS DU BOC, et lui seul : montant net par action,
//                        ex-dividende et date de paiement sur la même ligne,
//                        publiés par la Bourse. Sans avis, pas de ligne — une
//                        action détenue dont le dividende n'est pas annoncé
//                        est signalée à part plutôt que devinée.

import { cache } from "react";

import {
  loadAllActions,
  loadBocDividendes,
  loadBonds,
  loadListedBondEvents,
} from "@/lib/dataLoader";
import { getFutureCashFlows, parseDate } from "@/lib/bondMath";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { loadFundPortfolios } from "./portfolio-data";
import type { PortfolioSnapshot, SavedPosition } from "./portfolio-types";
import {
  cleEvenement,
  DEBUT_SUIVI,
  POSTE_DE_NATURE,
  type EvenementEsv,
  type NatureEsv,
  type Reception,
} from "./esv-types";

const cle = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/** Inventaire qui fait foi : le slot « fin », à défaut le plus récent. Même
 *  règle que le point de trésorerie et le contrôle de cession — trois écrans
 *  qui désigneraient trois inventaires différents seraient inexploitables. */
function snapshotDeReference(snapshots: PortfolioSnapshot[]): PortfolioSnapshot | null {
  return (
    snapshots.find((s) => s.slot === "fin") ??
    [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).pop() ??
    null
  );
}

/** Une ligne de l'inventaire vue comme un TITRE DÉTENU. */
type Detention = {
  quantite: number;
  code: string;
  isin: string;
  libelle: string;
  instrument: "actions" | "obligations" | "mtp";
};

/**
 * Titres détenus, agrégés par nature de rattachement.
 *
 * On s'appuie sur `matchKind`, qui dit à QUEL RÉFÉRENTIEL la ligne est
 * rattachée — pas sur la section de l'inventaire, qui dit seulement comment le
 * dépositaire l'a classée. Les deux divergent : un titre public figure souvent
 * en « obligation », et c'est pourtant le calendrier UMOA qui le paie.
 */
function detentions(snapshot: PortfolioSnapshot): {
  actions: Map<string, Detention>;
  obligations: Map<string, Detention>;
  souverains: Map<string, Detention>;
} {
  const actions = new Map<string, Detention>();
  const obligations = new Map<string, Detention>();
  const souverains = new Map<string, Detention>();

  const ajouter = (m: Map<string, Detention>, k: string, d: Detention) => {
    const deja = m.get(k);
    // Un même titre peut occuper plusieurs lignes — deux lots, deux prix de
    // revient. Les quantités s'additionnent : le coupon, lui, est unique.
    if (deja) deja.quantite += d.quantite;
    else m.set(k, d);
  };

  for (const p of snapshot.positions as SavedPosition[]) {
    const q = p.quantity ?? 0;
    if (q <= 0) continue;
    const libelle = p.matchLabel || p.rawLabel || p.rawCode || "—";
    const code = cle(p.matchCode || p.rawCode);
    const isin = cle(p.matchIsin);

    if (p.matchKind === "stock" && (code || p.matchId)) {
      const k = code || cle(p.matchId);
      ajouter(actions, k, { quantite: q, code: k, isin, libelle, instrument: "actions" });
    } else if (p.matchKind === "listed-bond") {
      // L'ISIN d'abord, le mnémonique ensuite : quatre lignes du référentiel
      // obligataire partagent l'ISIN « NC », et c'est alors le code qui les
      // sépare. Cf. le commentaire de `ListedBondEvent.code`.
      const k = isin && isin !== "NC" ? isin : code;
      if (k) {
        ajouter(obligations, k, {
          quantite: q,
          code,
          isin,
          libelle,
          instrument: "obligations",
        });
      }
    } else if (p.matchKind === "sovereign" && isin) {
      ajouter(souverains, isin, {
        quantite: q,
        code: code || isin,
        isin,
        libelle,
        instrument: "mtp",
      });
    }
  }

  return { actions, obligations, souverains };
}

/** Événements des OBLIGATIONS COTÉES détenues. */
function evenementsObligations(detenues: Map<string, Detention>): EvenementEsv[] {
  if (detenues.size === 0) return [];
  const out: EvenementEsv[] = [];

  for (const e of loadListedBondEvents()) {
    // Le référentiel indexe par ISIN ET par code : on cherche sous les deux,
    // parce que l'inventaire peut n'en porter qu'un.
    const d = detenues.get(cle(e.isin)) ?? detenues.get(cle(e.code));
    if (!d) continue;
    // Un « call » ou une « adjudication » ne produit pas de flux au porteur :
    // les compter ferait apparaître un encaissement qui n'existe pas.
    if (e.eventType !== "coupon" && e.eventType !== "amortissement" && e.eventType !== "remboursement")
      continue;
    if (!(e.amount > 0)) continue;

    const nature = e.eventType as NatureEsv;
    const titre = d.isin && d.isin !== "NC" ? d.isin : d.code;
    out.push({
      cle: cleEvenement(titre, e.date, nature),
      nature,
      date: e.date,
      code: d.code || e.code,
      libelle: d.libelle,
      isin: d.isin || e.isin,
      instrument: "obligations",
      quantite: d.quantite,
      montantParTitre: e.amount,
      montantAttendu: e.amount * d.quantite,
      source: "echeancier",
      reserve: null,
      reception: null,
    });
  }
  return out;
}

/**
 * Événements des TITRES PUBLICS détenus.
 *
 * Reconstruits par `getFutureCashFlows`, l'échéancier actuariel du site — le
 * même que le simulateur YTM. Un calcul maison ici aurait fini par diverger de
 * la fiche du titre, et le gérant aurait eu deux montants pour un coupon.
 *
 * LES BAT N'Y SONT PAS : `loadBonds` ne garde que les OAT. Un bon du Trésor
 * est escompté — un seul flux, à l'échéance — et il faudrait le reconstruire
 * autrement. On le signale plutôt que de le taire.
 */
function evenementsSouverains(detenues: Map<string, Detention>): {
  evenements: EvenementEsv[];
  sansEcheancier: string[];
} {
  const evenements: EvenementEsv[] = [];
  if (detenues.size === 0) return { evenements, sansEcheancier: [] };

  const parIsin = new Map(loadBonds().map((b) => [cle(b.isin), b]));
  const sansEcheancier: string[] = [];
  // Depuis la veille, pour ne pas perdre un coupon qui tombe aujourd'hui :
  // `getFutureCashFlows` ne garde que les dates STRICTEMENT postérieures.
  const depuis = parseDate(
    new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
  );

  for (const [isin, d] of detenues) {
    const bond = parIsin.get(isin);
    if (!bond) {
      sansEcheancier.push(`${d.libelle} (${isin})`);
      continue;
    }
    const flux = getFutureCashFlows(bond, depuis);
    for (const f of flux) {
      const date = f.date.toISOString().slice(0, 10);
      // Le dernier flux porte coupon ET nominal : on le nomme remboursement,
      // qui est ce que le trésorier attend de voir tomber.
      const nature: NatureEsv = f.isFinal ? "remboursement" : "coupon";
      evenements.push({
        cle: cleEvenement(isin, date, nature),
        nature,
        date,
        code: d.code,
        libelle: d.libelle,
        isin,
        instrument: "mtp",
        quantite: d.quantite,
        montantParTitre: f.amount,
        montantAttendu: f.amount * d.quantite,
        source: "echeancier",
        reserve: f.isFinal
          ? "Coupon final et nominal réunis, comme le porte l'échéancier."
          : null,
        reception: null,
      });
    }
  }
  return { evenements, sansEcheancier };
}

/**
 * Normalise une raison sociale pour l'apparier.
 *
 * Le BOC écrit « BOA CÔTE D'IVOIRE », le référentiel « BANK OF AFRICA CI » :
 * aucune normalisation ne rapprochera ces deux-là, et c'est assumé — l'avis
 * non apparié laisse simplement la ligne sur son estimation. Ce qu'on corrige
 * ici, ce sont les écarts de FORME : accents, apostrophes typographiques,
 * ponctuation, espaces multiples.
 */
function normaliserNom(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * DIVIDENDES des actions détenues — STRICTEMENT CEUX DU BOC.
 *
 * Le bulletin officiel porte, sur une même ligne, le montant net par action,
 * l'ex-dividende et la date de mise en paiement. C'est la publication de la
 * Bourse : rien à déduire, rien à estimer.
 *
 * SANS AVIS, PAS DE LIGNE. Une action dont le dividende n'est pas encore
 * annoncé ne produit aucun événement — et elle est remontée à part, pour que
 * son absence du calendrier se voie. Une ligne approximative se serait mêlée
 * aux montants contractuels et aurait fini par être lue comme une créance ;
 * une ligne absente, elle, se remarque.
 *
 * L'appariement se fait sur la RAISON SOCIALE, le BOC ne publiant pas de
 * mnémonique.
 */
function evenementsDividendes(
  detenues: Map<string, Detention>,
  aujourdhui: string,
): { evenements: EvenementEsv[]; sansAvis: string[] } {
  const evenements: EvenementEsv[] = [];
  const sansAvis: string[] = [];
  if (detenues.size === 0) return { evenements, sansAvis };

  const parCode = new Map(loadAllActions().map((a) => [cle(a.code), a]));

  // Les avis du BOC, indexés par raison sociale normalisée. Le plus RÉCENT
  // gagne : un avis rectificatif porte un numéro différent, et c'est la
  // dernière date de paiement publiée qui vaut.
  const avisParNom = new Map<string, ReturnType<typeof loadBocDividendes>[number]>();
  for (const d of loadBocDividendes()) {
    const k = normaliserNom(d.titre);
    const deja = avisParNom.get(k);
    if (!deja || d.datePaiement > deja.datePaiement) avisParNom.set(k, d);
  }

  for (const [k, d] of detenues) {
    const a = parCode.get(k);
    const nomMarche = a?.name ?? d.libelle;

    // Cherché sous le nom du référentiel PUIS sous celui de l'inventaire : le
    // dépositaire n'écrit pas toujours comme la Bourse.
    const avis =
      avisParNom.get(normaliserNom(nomMarche)) ??
      avisParNom.get(normaliserNom(d.libelle)) ??
      null;

    if (!avis) {
      sansAvis.push(`${k} — ${d.libelle || nomMarche}`);
      continue;
    }

    evenements.push({
      cle: cleEvenement(k, avis.datePaiement, "dividende"),
      nature: "dividende",
      date: avis.datePaiement,
      code: k,
      libelle: d.libelle || nomMarche,
      isin: d.isin || String(a?.isin ?? ""),
      instrument: "actions",
      quantite: d.quantite,
      montantParTitre: avis.montant,
      montantAttendu: avis.montant * d.quantite,
      source: "avis_boc",
      reserve:
        `Avis BOC n° ${avis.avis} du ${avis.datePublication} · ex-dividende le ` +
        `${avis.exDividende}` +
        (avis.exercice ? ` · exercice ${avis.exercice}` : "") +
        (avis.brut
          ? " · dividende BRUT : l'IRVM s'y applique — 10 % pour une personne " +
            "morale, l'encaissement sera donc inférieur si le fonds y est assujetti."
          : "") +
        // LA QUANTITÉ QUI COMPTE EST CELLE DU JOUR DU DÉTACHEMENT, pas celle
        // de l'inventaire. Tant que l'ex-dividende est devant, les deux
        // coïncideront sauf mouvement ; une fois passé, l'écart est possible
        // et il vaut mieux le dire que de le découvrir au pointage.
        (avis.exDividende < aujourdhui
          ? " · détachement passé : le montant suppose que la quantité n'a pas bougé depuis."
          : ""),
      reception: null,
    });
  }

  return { evenements, sansAvis };
}

type LigneReception = {
  cle: string;
  date_reception: string;
  montant_recu: number | string;
  compte: string | null;
  note: string | null;
};

/** Pointages enregistrés, indexés par clef d'événement. */
const loadReceptions = cache(
  async (fundId: string): Promise<Map<string, Reception>> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("fund_security_event_receipts")
      .select("cle, date_reception, montant_recu, compte, note")
      .eq("fund_id", fundId);

    if (error) {
      console.error("[gestion-portefeuille] loadReceptions:", error.message);
      return new Map();
    }
    const out = new Map<string, Reception>();
    for (const l of (data ?? []) as unknown as LigneReception[]) {
      out.set(l.cle, {
        dateReception: l.date_reception,
        montantRecu: Number(l.montant_recu) || 0,
        compte: l.compte ?? "",
        note: l.note ?? "",
      });
    }
    return out;
  },
);

export type CalendrierEsv = {
  /** Tous les flux connus, du plus proche au plus lointain. */
  evenements: EvenementEsv[];
  /** Date de l'inventaire d'où sortent les quantités. */
  dateInventaire: string | null;
  /** Titres détenus dont aucun échéancier n'a été trouvé. Listés plutôt que
   *  tus : leur absence du calendrier est une information. */
  sansEcheancier: string[];
  /** Actions détenues sans avis de dividende au BOC. Le module ne devine
   *  rien : leur dividende n'apparaîtra qu'une fois l'avis publié, et d'ici
   *  là c'est cette liste qui dit pourquoi le calendrier est muet. */
  actionsSansAvis: string[];
};

/**
 * Le calendrier d'un fonds.
 *
 * MÉMOÏSÉ PAR REQUÊTE : l'écran ESV et le point de trésorerie le construisent
 * tous deux pendant le même rendu.
 */
export const construireCalendrierEsv = cache(
  async (fundId: string): Promise<CalendrierEsv> => {
    const [snapshots, receptions] = await Promise.all([
      loadFundPortfolios(fundId),
      loadReceptions(fundId),
    ]);
    const actuel = snapshotDeReference(snapshots);
    if (!actuel) {
      return {
        evenements: [],
        dateInventaire: null,
        sansEcheancier: [],
        actionsSansAvis: [],
      };
    }

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const { actions, obligations, souverains } = detentions(actuel);
    const souv = evenementsSouverains(souverains);
    const div = evenementsDividendes(actions, aujourdhui);

    const evenements = [
      ...evenementsObligations(obligations),
      ...souv.evenements,
      ...div.evenements,
    ]
      // LE POINTAGE SE RACCROCHE ICI, par la clef. C'est la seule chose que la
      // base porte : tout le reste vient d'être recalculé.
      .map((e) => ({ ...e, reception: receptions.get(e.cle) ?? null }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.libelle.localeCompare(b.libelle));

    return {
      evenements,
      dateInventaire: actuel.asOfDate,
      sansEcheancier: souv.sansEcheancier,
      actionsSansAvis: div.sansAvis,
    };
  },
);

/**
 * Montants par POSTE puis par COMPTE, pour le point de trésorerie.
 *
 * Même forme que les autres apports du point. NE COMPTENT QUE LES FLUX NON
 * ENCORE REÇUS : un coupon encaissé est déjà dans le solde bancaire saisi, et
 * l'y laisser le compterait deux fois. C'est le même lettrage que partout
 * ailleurs dans le module.
 *
 * `compte` est la colonne où les revenus tombent — le compte dépositaire du
 * fonds, puisque c'est lui qui les reçoit. Un pointage peut désigner un autre
 * compte, mais un flux pointé ne compte plus : la question ne se pose que pour
 * les flux à venir.
 */
export function agregerEsv(
  evenements: EvenementEsv[],
  compte: string,
  dateArrete: string | null,
): Map<string, Map<string, number>> {
  const parPoste = new Map<string, Map<string, number>>();
  if (!compte) return parPoste;

  for (const e of evenements) {
    if (e.reception) continue;
    // AVANT LE DÉBUT DU SUIVI, le flux a été encaissé et comptabilisé hors de
    // ce module : le porter au point l'aurait compté une seconde fois, et
    // vingt coupons d'une vieille OAT auraient gonflé le cash à recevoir de
    // montants depuis longtemps sur le compte.
    if (e.date < DEBUT_SUIVI) continue;
    // Au-delà de l'horizon de l'arrêté, le flux n'aura pas encore eu lieu.
    if (dateArrete && e.date > dateArrete) continue;
    const poste = POSTE_DE_NATURE[e.nature];
    let parCompte = parPoste.get(poste);
    if (!parCompte) {
      parCompte = new Map<string, number>();
      parPoste.set(poste, parCompte);
    }
    parCompte.set(compte, (parCompte.get(compte) ?? 0) + e.montantAttendu);
  }
  return parPoste;
}

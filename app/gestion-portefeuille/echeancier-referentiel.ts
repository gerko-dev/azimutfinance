import "server-only";

// === Les échéanciers du référentiel, indépendamment de ce qu'on détient ====
//
// LE CALENDRIER ESV NE CONNAIT QUE LES TITRES ENCORE EN PORTEFEUILLE. Il est
// reconstruit sur l'inventaire de référence — celui de fin —, ce qui est la
// bonne règle pour un écran de trésorerie : on n'attend pas le coupon d'une
// obligation qu'on a vendue.
//
// POUR MESURER UNE PERFORMANCE, C'EST EXACTEMENT L'INVERSE. Une ligne vendue
// en cours de période a existé, a porté des coupons, et doit entrer dans le
// calcul. Elle n'est plus au calendrier, et le module la déclarait « sans
// échéancier » — donc non mesurable, donc écartée. Chez NSIA FONDS
// DIVERSIFIE, les trois quarts de la poche obligataire ont été vendus : OAT
// CI0000008041 (12,2 Md), CI0000008561 (7,0 Md), SN0000003732 (5,2 Md). Toutes
// ont un échéancier parfaitement connu — elles sont au gisement UMOA-Titres —
// et toutes étaient écartées.
//
// CE MODULE LIT DONC LES ECHEANCIERS LA OU ILS SONT, et non là où le
// portefeuille les appelle : le gisement souverain UMOA-Titres et la cote
// obligataire de la BRVM. Il ne sait rien des titres du référentiel du gérant
// — ceux-là n'ont d'échéancier que dans leur fiche, et c'est le calendrier du
// fonds qui les déroule.

import { loadBonds, loadListedBondEvents, loadListedBonds } from "@/lib/dataLoader";
import { getFutureCashFlows, parseDate } from "@/lib/bondMath";
import { generateBondLifecycleEvents } from "@/lib/listedBondsTypes";
import { ficheEnObligation } from "./esv-data";
import type { CustomSecurity } from "./portfolio-types";

/**
 * Un flux détaché, daté, exprimé PAR TITRE.
 *
 * `capital` distingue le remboursement du revenu, et il faut le savoir : un
 * amortissement SUR TITRE se lit dans la quantité, pas dans le prix, et le
 * compter en plus le compterait deux fois.
 */
export type RevenuTitre = { date: string; parTitre: number; capital: boolean };

const DEPUIS = parseDate("1990-01-01");

const normId = (s: string | null | undefined): string =>
  (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

type Gisement = {
  /** Tous les titres dont un échéancier existe, flux dans la fenêtre ou non. */
  connus: Set<string>;
  flux: Map<string, RevenuTitre[]>;
  /** Mode d'amortissement par identifiant : « T » (sur titre) ou « N ». */
  modes: Map<string, string>;
};

/**
 * MEMOÏSE PAR PROCESSUS, pas par requête : les deux gisements sont des CSV du
 * dépôt, identiques pour tous les fonds et pour tous les utilisateurs. Les
 * dérouler à chaque fonds d'un écran qui en affiche six coûtait six fois le
 * même travail.
 */
let cache: Gisement | null = null;

function construire(): Gisement {
  if (cache) return cache;

  const connus = new Set<string>();
  const flux = new Map<string, RevenuTitre[]>();
  const modes = new Map<string, string>();
  const poser = (cle: string, r: RevenuTitre) => {
    if (!cle) return;
    const l = flux.get(cle) ?? [];
    l.push(r);
    flux.set(cle, l);
  };

  // ── Le mode d'amortissement de chaque emprunt coté ──────────────────────
  for (const b of loadListedBonds()) {
    const mode = b.amortizationMode === "T" ? "T" : "N";
    if (b.isin) modes.set(normId(b.isin), mode);
    if (b.code) modes.set(normId(b.code), mode);
  }

  // ── La cote obligataire BRVM ────────────────────────────────────────────
  // `loadListedBondEvents` déroule la vie entière de chaque emprunt coté :
  // coupons, tranches d'amortissement, remboursement final, par titre.
  for (const e of loadListedBondEvents()) {
    const isin = normId(e.isin);
    const code = normId(e.code);
    if (isin) connus.add(isin);
    if (code) connus.add(code);
    const m = Number(e.amount);
    if (!Number.isFinite(m) || m === 0) continue;
    const r: RevenuTitre = {
      date: e.date,
      parTitre: m,
      capital: e.eventType === "amortissement" || e.eventType === "remboursement",
    };
    if (isin) poser(isin, r);
    if (code && code !== isin) poser(code, r);
  }

  // ── Le gisement souverain UMOA-Titres ───────────────────────────────────
  // Les OAT y sont modélisées IN FINE : coupons sur nominal constant, capital
  // au dernier flux. Pas d'amortissement intermédiaire, donc pas de question
  // de mode.
  for (const b of loadBonds()) {
    const isin = normId(b.isin);
    if (!isin) continue;
    connus.add(isin);
    // Un titre déjà servi par la cote n'est pas redéroulé : il y figure avec
    // son échéancier réel, qui fait foi.
    if (flux.has(isin)) continue;
    const cf = getFutureCashFlows(b, DEPUIS);
    for (const f of cf) {
      poser(isin, {
        date: f.date.toISOString().slice(0, 10),
        parTitre: f.amount,
        capital: f.isFinal,
      });
    }
  }

  cache = { connus, flux, modes };
  return cache;
}

/**
 * Les identifiants de tous les titres dont le référentiel sait dérouler les
 * flux — cote BRVM et gisement souverain. Un titre dont le coupon tombe en
 * novembre y figure : il est parfaitement connu, et l'écarter d'une mesure
 * arrêtée en septembre n'aurait aucun sens.
 */
export function titresAEcheancier(): Set<string> {
  return construire().connus;
}

/**
 * Les flux d'un titre dans une fenêtre, par titre, sous l'un quelconque de ses
 * identifiants. Vide si le référentiel ne le connaît pas.
 *
 * LES AMORTISSEMENTS SUR TITRE SONT ECARTES : des titres tirés au sort et
 * remboursés au pair se lisent dans la QUANTITE, et les compter en plus les
 * compterait deux fois.
 */
export function fluxDuReferentiel(
  alias: string[],
  debut: string,
  fin: string,
): RevenuTitre[] {
  const { flux, modes } = construire();
  for (const a of alias) {
    const tous = flux.get(a);
    if (!tous || tous.length === 0) continue;
    const surTitre = alias.some((x) => modes.get(x) === "T");
    return tous.filter(
      (r) => r.date >= debut && r.date <= fin && !(r.capital && surTitre),
    );
  }
  return [];
}

/**
 * L'échéancier d'un titre du REFERENTIEL DU GERANT, déroulé depuis sa fiche.
 *
 * UN NON COTE VENDU N'EST NULLE PART AILLEURS. Le gisement ne le connaît pas —
 * il n'est ni à la cote ni au guichet UMOA — et le calendrier du fonds ne le
 * déroule plus dès qu'il quitte l'inventaire. Sa fiche, elle, porte tout ce
 * qu'il faut : coupure, taux, échéance, profil et date de premier
 * amortissement. On la déroule donc avec le générateur du site, le même que
 * pour la cote, plutôt que d'écrire un second échéancier qui finirait par en
 * diverger.
 *
 * Rend une liste vide quand la fiche est trop incomplète pour dérouler quoi
 * que ce soit — sans échéance ni coupure, il n'y a pas de flux à déduire.
 */
export function fluxDeLaFiche(
  fiche: CustomSecurity,
  debut: string,
  fin: string,
): RevenuTitre[] {
  const bond = ficheEnObligation(fiche);
  if (!bond) return [];
  const surTitre = bond.amortizationMode === "T";
  const out: RevenuTitre[] = [];
  for (const e of generateBondLifecycleEvents(bond)) {
    if (e.date < debut || e.date > fin) continue;
    const m = Number(e.amount);
    if (!Number.isFinite(m) || m === 0) continue;
    const capital = e.eventType === "amortissement" || e.eventType === "remboursement";
    if (capital && surTitre) continue;
    out.push({ date: e.date, parTitre: m, capital });
  }
  return out;
}

/** Vrai quand la fiche porte de quoi dérouler un échéancier. */
export function ficheDeroulable(fiche: CustomSecurity | undefined): boolean {
  return !!fiche && ficheEnObligation(fiche) != null;
}

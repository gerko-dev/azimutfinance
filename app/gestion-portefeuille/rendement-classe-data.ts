import "server-only";

// === La performance de chaque classe d'actif, par la méthode qui lui convient ===
//
// IL N'Y A PAS UNE METHODE POUR TOUT. Une poche d'actions et un dépôt à terme
// ne se mesurent pas de la même façon : l'une n'est connue que par le cours de
// ses titres, l'autre porte son rendement dans son contrat. Appliquer partout
// le rapport des valorisations revient à mesurer au pied à coulisse ce qui se
// lit sur l'étiquette — et à compter l'argent que le gérant a APPORTE comme de
// la performance : un fonds dont la poche obligataire passe de 48 à 89
// milliards affichait + 85 %.
//
//   ACTIONS, OBLIGATIONS ..... LE COURS DES TITRES DETENUS, ligne à ligne,
//                              pondéré par la valorisation de début. Un titre
//                              dont la quantité n'a pas bougé, ou a bougé, le
//                              dit également : on compare son PRIX UNITAIRE
//                              aux deux bouts, et le prix unitaire ne sait rien
//                              des apports. S'y ajoutent les COUPONS ET
//                              DIVIDENDES détachés dans la période — un coupon
//                              sort de la poche, et sans le compter la poche
//                              semblait perdre son propre revenu.
//
//   OPCVM .................... La VL des fonds détenus. Un OPCVM publie sa
//                              performance ; la recalculer depuis nos
//                              valorisations serait moins exact et sensible à
//                              nos propres souscriptions.
//
//   DAT ...................... Le taux du contrat, au prorata des jours. Un
//                              dépôt à terme ne fluctue pas : il court.
//
//   LIQUIDITE ................ ZERO. Un compte courant ne produit rien, et lui
//                              prêter une performance revenait à lui attribuer
//                              les mouvements qui le traversent : les coupons
//                              qui y tombent, les ventes qui s'y dénouent. La
//                              poche est un passage, pas un placement.
//
// POURQUOI PAS LA DIETZ MODIFIEE, qui neutralise les apports ? Parce qu'elle
// exige de LES CONNAITRE TOUS. Le carnet d'ordres du module ne commence qu'en
// septembre 2026 : les quarante milliards entrés dans la poche obligataire
// depuis janvier n'y figurent pas, et Dietz les aurait comptés en performance
// comme le faisait le rapport des valorisations. Le prix d'un titre, lui, ne
// dépend d'aucune saisie.
//
// ON N'UTILISE PLUS LA BALANCE COMPTABLE. Un seul fonds sur six en avait une :
// cinq écrans affichaient donc un calcul que le sixième n'affichait pas, sur
// une fenêtre différente par-dessus le marché. Une méthode unique appliquée
// partout vaut mieux qu'une méthode exacte appliquée nulle part.
//
// CE QUE LA METHODE SUPPOSE, ET QU'ELLE DIT : les titres SORTIS en cours de
// période ont rendu autant que ceux restés. C'est l'hypothèse de toute moyenne
// pondérée, et elle devient lourde quand la moitié de la poche a tourné. La
// part réellement mesurée — la COUVERTURE — est donc rendue avec le chiffre,
// et l'écran la signale dès qu'elle descend.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadFunds } from "@/lib/fcp";
import { findObsOnOrBefore } from "@/lib/fcpMath";
import { construireCalendrierEsv } from "./esv-data";
import { loadCustomSecurities } from "./portfolio-data";
import type { CustomSecurity } from "./portfolio-types";
import { construirePointTresorerie } from "./tresorerie-data";

/** Comment la ligne a été calculée. L'écran l'affiche : un tableau qui mélange
 *  les méthodes sans le dire laisse croire que ses lignes se comparent. */
export type MethodeRendement =
  | "titres-detenus" // cours des titres + revenus détachés
  | "vl-detenus" // performance propre des OPCVM détenus
  | "taux-contractuel" // taux du dépôt au prorata des jours
  | "nulle" // par construction : la liquidité ne produit rien
  | "indisponible";

export const LIBELLE_METHODE: Record<MethodeRendement, string> = {
  "titres-detenus":
    "Variation du prix unitaire de chaque titre détenu, coupons et dividendes détachés compris, pondérée par la valorisation de début de période. Indépendante des achats et des ventes.",
  "vl-detenus":
    "Performance propre de chaque OPCVM détenu, lue sur sa VL publiée, pondérée par la valorisation des lignes.",
  "taux-contractuel":
    "Taux du contrat au prorata des jours courus dans la période, rapporté au capital moyen engagé.",
  nulle: "Nulle par construction : un compte courant ne produit pas de performance.",
  indisponible: "Non calculable sur cette période.",
};

export type RendementClasse = {
  performance: number | null; // %
  methode: MethodeRendement;
  /** Part de la poche de début que la méthode a réellement mesurée, de 0 à 1.
   *  Le reste — titres vendus, lignes non appariées — est supposé avoir rendu
   *  autant que la part mesurée. */
  couverture: number;
  /** Ce qui fragilise le chiffre, ou null. Affiché tel quel : un nombre dont
   *  on tait les réserves se prend pour une certitude. */
  reserve: string | null;
};

const SANS: RendementClasse = {
  performance: null,
  methode: "indisponible",
  couverture: 0,
  reserve: null,
};

const jours = (a: string, b: string): number =>
  (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000;

/** Au-delà, la date d'inventaire est une coquille, pas une période. Un fonds
 *  a un inventaire de début dans l'année ; « 0205-12-31 » n'en est pas un. */
const FENETRE_MAX_JOURS = 1900;

/** Nombre écrit « 6 », « 6,5 » ou « 6% ». Rend NaN si rien d'exploitable. */
function nombre(v: unknown): number {
  const s = String(v ?? "")
    .replace(/\s/g, "")
    .replace("%", "")
    .replace(",", ".");
  return s === "" ? NaN : Number(s);
}

/** Taux lu dans un libellé, faute de fiche : « DAT BNDE 500M 6.5% 2026 ». */
function tauxDuLibelle(libelle: string): number {
  const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(libelle ?? "");
  return m ? Number(m[1].replace(",", ".")) : NaN;
}

const DIACRITIQUES = /[̀-ͯ]/g;
function normNom(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(DIACRITIQUES, "")
    .toLowerCase()
    .replace(/\bfcp\b|\bsicav\b|\bfcpe\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MOTIF_ISIN = /\b([A-Z]{2}[0-9A-Z]{10})\b/;

/** Un identifiant de titre réduit à sa substance : « TPCI.O69 » et « TPCIO69 »
 *  désignent le même emprunt, et « ci0000004701 » le même ISIN que
 *  « CI0000004701 ». */
function normId(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

type Position = {
  raw_label: string;
  raw_code: string | null;
  quantity: number | null;
  valuation: number | null;
  match_id: string | null;
  match_kind: string | null;
  custom_security_id: string | null;
  section: string;
};

/**
 * L'IDENTITE D'UNE LIGNE D'UN INVENTAIRE A L'AUTRE.
 *
 * LE RATTACHEMENT AU REFERENTIEL FAIT FOI : il porte l'ISIN pour une
 * obligation, le mnémonique pour une action, et c'est le même identifiant que
 * celui sous lequel le calendrier ESV range les coupons et les dividendes. Un
 * libellé, lui, change d'un import à l'autre — « OAT CI0000008041 » devient
 * « OAT CI0000008041-6%-2031 » — et un mnémonique de dépositaire
 * (« TPCI.O69 ») n'est pas celui du référentiel.
 *
 * À défaut, l'ISIN lu dans le code ou le libellé, puis le code, puis le
 * libellé : dans cet ordre de fiabilité décroissante.
 */
function cleTitre(p: Position): string {
  if (p.match_id) return normId(p.match_id);
  const m = MOTIF_ISIN.exec(`${p.raw_code ?? ""} ${(p.raw_label ?? "").toUpperCase()}`);
  if (m) return normId(m[1]);
  if (p.custom_security_id) return `F${normId(p.custom_security_id)}`;
  if (p.raw_code) return normId(p.raw_code);
  return `L${normNom(p.raw_label).replace(/ /g, "")}`;
}

type LigneAgregee = { quantite: number; valorisation: number };

/** Les lignes d'une section, regroupées par titre : deux lots d'un même titre
 *  sont une seule position pour qui mesure un prix. */
function parTitre(positions: Position[], section: string): Map<string, LigneAgregee> {
  const m = new Map<string, LigneAgregee>();
  for (const p of positions) {
    if (p.section !== section) continue;
    const k = cleTitre(p);
    const e = m.get(k) ?? { quantite: 0, valorisation: 0 };
    e.quantite += Number(p.quantity) || 0;
    e.valorisation += Number(p.valuation) || 0;
    m.set(k, e);
  }
  return m;
}

// ── Les revenus détachés pendant la période, PAR TITRE ──────────────────────
//
// UN COUPON N'EST PAS UNE PERTE. La valorisation d'une obligation porte son
// couru ; le jour du détachement, le couru retombe à zéro et l'argent part en
// banque. Mesurée sur le seul prix, la poche obligataire perdait donc son
// propre coupon — d'où les − 4 % à − 11 % qu'affichaient des portefeuilles
// souverains dont aucun titre n'avait décroché.
//
// LE MONTANT EST PRIS PAR TITRE, et c'est ce qui rend l'estimation solide : le
// calendrier ESV reconstruit ses quantités sur l'inventaire d'aujourd'hui, mais
// le coupon unitaire d'une obligation ne dépend d'aucune quantité.
async function revenusParTitre(
  fundId: string,
  debut: string,
  fin: string,
): Promise<Map<string, number>> {
  const calendrier = await construireCalendrierEsv(fundId);
  const out = new Map<string, number>();
  const poser = (cle: string, montant: number) => {
    if (!cle) return;
    out.set(cle, (out.get(cle) ?? 0) + montant);
  };
  for (const e of calendrier.evenements) {
    if (e.date < debut || e.date > fin) continue;
    const m = Number(e.montantParTitre);
    if (!Number.isFinite(m) || m === 0) continue;
    // L'ISIN ET LE MNEMONIQUE, parce qu'une position peut n'en porter qu'un —
    // mais jamais deux fois le même, sans quoi un coupon compterait double.
    const isin = normId(e.isin);
    const code = normId(e.code);
    if (isin) poser(isin, m);
    if (code && code !== isin) poser(code, m);
  }
  return out;
}

// ── Actions et obligations : le cours des titres détenus ────────────────────
//
// Pour chaque titre présent aux DEUX inventaires, on compare son PRIX UNITAIRE
// — valorisation ÷ quantité — et on y ajoute ce qu'il a détaché entre-temps.
// Le prix unitaire est aveugle aux apports : qu'on ait doublé la ligne ou
// qu'on l'ait allégée, il dit la même chose, et c'est exactement ce qu'on
// cherche.
//
// La pondération est la VALORISATION DE DEBUT, c'est-à-dire le capital
// réellement exposé au départ.
function rendementTitres(
  avant: Map<string, LigneAgregee>,
  apres: Map<string, LigneAgregee>,
  revenus: Map<string, number>,
): RendementClasse {
  let base = 0;
  let baseTotale = 0;
  let gain = 0;
  let lignesSorties = 0;

  for (const [cle, d] of avant) {
    baseTotale += d.valorisation;
    const f = apres.get(cle);
    if (!f || !(d.quantite > 0) || !(f.quantite > 0) || !(d.valorisation > 0)) {
      lignesSorties += 1;
      continue;
    }
    const p0 = d.valorisation / d.quantite;
    const p1 = f.valorisation / f.quantite;
    if (!(p0 > 0)) continue;
    const revenu = revenus.get(cle) ?? 0;
    base += d.valorisation;
    gain += d.valorisation * ((p1 + revenu - p0) / p0);
  }

  if (!(base > 0)) return SANS;
  const couverture = baseTotale > 0 ? base / baseTotale : 0;
  return {
    performance: (gain / base) * 100,
    methode: "titres-detenus",
    couverture,
    reserve:
      couverture < 0.75
        ? `Seuls ${Math.round(couverture * 100)} % de la poche de début sont encore détenus à la fin — ${lignesSorties} ligne(s) sortie(s). Le reste est supposé avoir rendu autant.`
        : null,
  };
}

// ── OPCVM : la performance des fonds détenus ────────────────────────────────
//
// Un OPCVM publie une VL. Sa performance sur la fenêtre se lit entre deux
// observations, et elle est INDEPENDANTE de ce que nous y avons souscrit ou
// racheté — là où nos propres valorisations mélangent les deux.
function rendementOpcvm(lignes: Position[], debut: string, fin: string): RendementClasse {
  const fonds = loadFunds();
  const parId = new Map(fonds.map((f) => [f.id, f]));
  const parNom = new Map(fonds.map((f) => [normNom(f.nom), f]));

  const perf = (p: Position): number | null => {
    let f = p.match_kind === "fund" && p.match_id ? parId.get(p.match_id) : undefined;
    if (!f) {
      const nn = normNom(p.raw_label ?? "");
      f = parNom.get(nn) ?? fonds.find((x) => nn !== "" && normNom(x.nom).includes(nn));
    }
    if (!f) return null;
    const a = findObsOnOrBefore(f.observations, debut);
    const b = findObsOnOrBefore(f.observations, fin);
    if (!a || !b || a.vl == null || b.vl == null || a.vl <= 0) return null;
    // Deux fois la même observation : le fonds n'a pas publié de VL dans la
    // fenêtre, et afficher 0 % laisserait croire qu'il a fait du surplace.
    if (a.date === b.date) return null;
    return (b.vl / a.vl - 1) * 100;
  };

  let num = 0;
  let poids = 0;
  let total = 0;
  for (const p of lignes) {
    const v = p.valuation ?? 0;
    if (v <= 0) continue;
    total += v;
    const r = perf(p);
    if (r == null) continue;
    num += v * r;
    poids += v;
  }
  if (poids <= 0) return SANS;
  const couverture = total > 0 ? poids / total : 0;
  return {
    performance: num / poids,
    methode: "vl-detenus",
    couverture,
    reserve:
      couverture < 0.75
        ? `${Math.round((1 - couverture) * 100)} % de la poche n'ont pas pu être rattachés à un OPCVM dont la VL est publiée.`
        : null,
  };
}

// ── DAT : le taux du contrat, au prorata des jours ──────────────────────────
//
// Un dépôt à terme ne fluctue pas. Son rendement est écrit dans son contrat, et
// la seule question est COMBIEN DE JOURS il a couru dans la fenêtre.
//
// Le capital au dénominateur est le capital MOYEN de la poche sur la période,
// et non le capital de fin : un dépôt ouvert le 8 septembre dans une fenêtre de
// neuf mois n'a travaillé que vingt jours, et porter ses cinq cents millions au
// dénominateur aurait écrasé la performance des autres.
//
// LES DEUX INVENTAIRES SONT LUS. Un dépôt arrivé à échéance en cours de période
// a disparu de l'inventaire de fin, et ses intérêts avec lui.
//
// LA RECONDUCTION NE FAIT PAS DEUX DEPOTS. Un dépôt reconduit reçoit une
// nouvelle fiche, avec une nouvelle date de valeur ; les deux fiches décrivent
// pourtant le même argent, chez la même contrepartie, au même taux. On les
// rapproche là-dessus, et c'est la plus longue présence qui l'emporte.
function rendementDat(
  lignes: { position: Position; auDebut: boolean }[],
  fiches: Map<string, CustomSecurity>,
  debut: string,
  fin: string,
): RendementClasse {
  const dureeFenetre = jours(debut, fin);
  if (!(dureeFenetre > 0)) return SANS;

  type Depot = { taux: number; nominal: number; debut: string; fin: string };
  const depots = new Map<string, Depot>();
  let total = 0;
  let mesure = 0;

  for (const { position: p, auDebut } of lignes) {
    const a = p.custom_security_id ? fiches.get(p.custom_security_id)?.attributes : null;
    const tauxFiche = nombre(a?.tauxInteret);
    const taux = Number.isFinite(tauxFiche) ? tauxFiche : tauxDuLibelle(p.raw_label);
    const nominalFiche = nombre(a?.montantNominal);
    const nominal = Number.isFinite(nominalFiche) ? nominalFiche : (p.valuation ?? 0);
    total += p.valuation ?? nominal;
    if (!Number.isFinite(taux) || !(nominal > 0)) continue;

    // Un dépôt DEJA LA au premier inventaire courait depuis le début de la
    // période, quelle que soit la date de valeur de sa fiche — qui ne porte
    // que la dernière reconduction. Sans cette règle, un dépôt vieux de neuf
    // mois ne comptait que pour les vingt jours de sa dernière prorogation.
    const dv = (a?.dateValeur ?? "").trim();
    const de = (a?.dateEcheance ?? "").trim();
    const d1 = auDebut || !dv || dv < debut ? debut : dv;
    const d2 = de && de < fin ? de : fin;
    if (!(jours(d1, d2) > 0)) continue;

    const cle = `${normNom(String(a?.contrepartie ?? p.raw_label))}|${nominal}|${taux}`;
    const deja = depots.get(cle);
    if (deja) {
      // Même argent, même contrepartie, même taux : on garde l'enveloppe la
      // plus large plutôt que de compter le capital deux fois.
      if (d1 < deja.debut) deja.debut = d1;
      if (d2 > deja.fin) deja.fin = d2;
    } else {
      depots.set(cle, { taux, nominal, debut: d1, fin: d2 });
      mesure += p.valuation ?? nominal;
    }
  }

  let interets = 0;
  let capitalMoyen = 0;
  for (const d of depots.values()) {
    const n = jours(d.debut, d.fin);
    interets += d.nominal * (d.taux / 100) * (n / 365);
    capitalMoyen += d.nominal * (n / dureeFenetre);
  }
  if (!(capitalMoyen > 0)) return SANS;

  const couverture = total > 0 ? Math.min(1, mesure / total) : 1;
  return {
    performance: (interets / capitalMoyen) * 100,
    methode: "taux-contractuel",
    couverture,
    reserve:
      couverture < 0.75
        ? `${Math.round((1 - couverture) * 100)} % de la poche sont des dépôts dont le taux n'est pas renseigné au référentiel.`
        : null,
  };
}

// ── Le solde théorique, qui fait le poids de la liquidité ───────────────────
//
// L'INVENTAIRE NE DIT PAS CE QU'IL Y A EN CAISSE. Il porte les soldes des
// comptes à la date d'arrêté, sans rien savoir des engagements déjà pris :
// souscriptions annoncées, rachats à payer, titres achetés non encore réglés.
// Le point de trésorerie, lui, les porte tous — c'est sa raison d'être — et son
// solde théorique est le seul chiffre qui réponde à « de quoi dispose le
// fonds ». C'est donc lui qui fait le poids de la poche.
export async function soldeTheorique(fundId: string, dateArrete: string): Promise<number | null> {
  try {
    const point = await construirePointTresorerie(fundId, "", dateArrete);
    const l = point?.lignes.find((x) => x.libelle === "SOLDETHEORIQUE");
    return typeof l?.total === "number" ? l.total : null;
  } catch {
    return null;
  }
}

/**
 * Le rendement de chaque classe, par sa méthode propre.
 */
export async function rendementsDeClasse(params: {
  fundId: string;
  snapshotDebut: string | null;
  snapshotFin: string;
  debut: string | null;
  fin: string;
}): Promise<Record<string, RendementClasse>> {
  const { fundId, snapshotDebut, snapshotFin, debut, fin } = params;
  const out: Record<string, RendementClasse> = {};

  // LA LIQUIDITE NE PRODUIT RIEN, et c'est vrai sans aucune donnée.
  out.tresorerie = { performance: 0, methode: "nulle", couverture: 1, reserve: null };
  if (!debut || !snapshotDebut) return out;

  const duree = jours(debut, fin);
  if (!(duree > 0)) return out;
  // Une fenêtre de plusieurs siècles est une date d'inventaire mal saisie. Le
  // prix des titres, lui, reste comparable : on mesure, mais sans les revenus,
  // qu'on ramasserait sur des années entières, et on le dit.
  const fenetreDouteuse = duree > FENETRE_MAX_JOURS;

  const supabase = await createSupabaseServerClient();
  const CHAMPS =
    "raw_label, raw_code, quantity, valuation, match_id, match_kind, custom_security_id, section";
  const positions = async (snapshotId: string): Promise<Position[]> => {
    const { data } = await supabase
      .from("fund_portfolio_positions")
      .select(CHAMPS)
      .eq("snapshot_id", snapshotId);
    return (data ?? []) as Position[];
  };

  const [posDebut, posFin, revenus, fichesRef] = await Promise.all([
    positions(snapshotDebut),
    positions(snapshotFin),
    fenetreDouteuse
      ? Promise.resolve(new Map<string, number>())
      : revenusParTitre(fundId, debut, fin),
    loadCustomSecurities(),
  ]);

  // ── Actions, obligations, autres : le cours des titres détenus ────────────
  for (const section of ["action", "obligation", "autre"]) {
    const avant = parTitre(posDebut, section);
    const apres = parTitre(posFin, section);
    if (avant.size === 0 && apres.size === 0) continue;
    const r = rendementTitres(avant, apres, revenus);
    out[section] = fenetreDouteuse
      ? {
          ...r,
          reserve: [
            `La date de l'inventaire de début (${debut}) est invraisemblable : les coupons et dividendes de la période n'ont pas été comptés.`,
            r.reserve,
          ]
            .filter(Boolean)
            .join(" "),
        }
      : r;
  }

  // ── OPCVM ─────────────────────────────────────────────────────────────────
  const opcvm = posFin.filter((p) => p.section === "opcvm");
  if (opcvm.length > 0 && !fenetreDouteuse) out.opcvm = rendementOpcvm(opcvm, debut, fin);

  // ── DAT ───────────────────────────────────────────────────────────────────
  const fiches = new Map(fichesRef.map((c) => [c.id, c]));
  const depots = [
    ...posDebut.filter((p) => p.section === "dat").map((position) => ({ position, auDebut: true })),
    ...posFin.filter((p) => p.section === "dat").map((position) => ({ position, auDebut: false })),
  ];
  if (depots.length > 0 && !fenetreDouteuse) out.dat = rendementDat(depots, fiches, debut, fin);

  return out;
}

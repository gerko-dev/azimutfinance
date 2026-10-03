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
//   ACTIONS, OBLIGATIONS ..... DIETZ MODIFIEE SUR LA POCHE, mouvements
//                              reconstruits. Achats et ventes sont neutralisés
//                              au prorata du temps : pris au carnet d'ordres
//                              quand il les porte, déduits de l'écart de
//                              quantité entre les deux inventaires sinon, et
//                              datés au milieu de la période. Coupons courus,
//                              décote et surcote y figurent d'eux-mêmes ; les
//                              amortissements de capital sont des flux de
//                              sortie, donc ne rapportent rien. Le détail est
//                              dans `rendement-titres`.
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
// LE CARNET D'ORDRES NE SUFFIT PAS, ET C'EST POURQUOI ON RECONSTRUIT. Il ne
// commence qu'en septembre 2026 : les quarante milliards entrés dans la poche
// obligataire depuis janvier n'y figurent pas. Mais les QUANTITES des deux
// inventaires, elles, les portent — un titre dont la quantité a doublé a été
// acheté, qu'un ordre ait été saisi ou non. On en déduit le mouvement, daté au
// milieu de la période faute de mieux, et le carnet l'emporte partout où il
// parle.
//
// ON N'UTILISE PLUS LA BALANCE COMPTABLE. Un seul fonds sur six en avait une :
// cinq écrans affichaient donc un calcul que le sixième n'affichait pas, sur
// une fenêtre différente par-dessus le marché. Une méthode unique appliquée
// partout vaut mieux qu'une méthode exacte appliquée nulle part.
//
// CE QUE LA METHODE SUPPOSE, ET QU'ELLE DIT. Un mouvement non tracé est réputé
// avoir eu lieu AU MILIEU DE LA PERIODE ; une cession s'être faite à la valeur
// d'inventaire de début, faute de prix de cession ; une acquisition à son prix
// de revient. Les titres dont le module ne sait dérouler aucun flux sont
// ECARTES plutôt que comptés en perte, et la part réellement mesurée — la
// COUVERTURE — est rendue avec le chiffre.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadListedBonds } from "@/lib/dataLoader";
import { loadFunds } from "@/lib/fcp";
import { findObsOnOrBefore } from "@/lib/fcpMath";
import {
  ficheDeroulable,
  fluxDeLaFiche,
  fluxDuReferentiel,
  titresAEcheancier,
} from "./echeancier-referentiel";
import { construireCalendrierEsv } from "./esv-data";
import { loadCustomSecurities } from "./portfolio-data";
import type { CustomSecurity } from "./portfolio-types";
import {
  dietzModifie,
  jours,
  milieuDe,
  mouvementsDuCarnet,
  type Flux,
  type MouvementOrdre,
} from "./rendement-titres";
import { construirePointTresorerie } from "./tresorerie-data";

/** Comment la ligne a été calculée. L'écran l'affiche : un tableau qui mélange
 *  les méthodes sans le dire laisse croire que ses lignes se comparent. */
export type MethodeRendement =
  | "titres-detenus" // Dietz modifiée, mouvements reconstruits
  | "vl-detenus" // performance propre des OPCVM détenus
  | "taux-contractuel" // taux du dépôt au prorata des jours
  | "nulle" // par construction : la liquidité ne produit rien
  | "indisponible";

export const LIBELLE_METHODE: Record<MethodeRendement, string> = {
  "titres-detenus":
    "Dietz modifiée sur la poche entière : achats et ventes neutralisés au prorata du temps, pris au carnet d'ordres quand il les porte, déduits des quantités au milieu de la période sinon. Comprend les coupons courus, la décote et la surcote constatées à l'entrée ; les amortissements de capital sont des flux de sortie, donc ne rapportent rien.",
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
  /** Prix de revient unitaire. C'est lui qui porte la DECOTE ou la SURCOTE :
   *  un titre entré sous le pair est payé moins que son nominal, et l'écart se
   *  constate quand la valorisation le rejoint. */
  pru: number | null;
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

/**
 * TOUS LES NOMS SOUS LESQUELS UNE LIGNE PEUT ETRE APPELEE.
 *
 * L'inventaire désigne un titre du référentiel du gérant par l'IDENTIFIANT DE
 * SA FICHE — un UUID. Le calendrier ESV, lui, range ses flux sous l'ISIN ou le
 * code de cette même fiche. Les deux ne se rencontraient jamais, et cinq
 * emprunts privés — CNO ETAT RCI CNPS MANSA BANK, BEFI-ALIOS FINANCE, APRIL
 * OIL, SDMA, ADDOHA — ne recevaient aucun coupon ni aucun amortissement : leur
 * capital remboursé se lisait comme une chute de cours. - 50 % pour ALIOS,
 * - 15,6 % pour MANSA, et huit points de perte imaginaire sur la poche
 * obligataire d'AURORE OBLIGATIONS SOUVERAINES.
 */
function aliasDe(p: Position, fiches: Map<string, CustomSecurity>): string[] {
  const out: string[] = [];
  const poser = (s: string | null | undefined) => {
    const k = normId(s);
    if (k && !out.includes(k)) out.push(k);
  };
  poser(p.match_id);
  const c = p.custom_security_id ? fiches.get(p.custom_security_id) : undefined;
  if (c) {
    poser(c.isin);
    poser(c.code);
    poser(c.id);
  }
  const m = MOTIF_ISIN.exec(`${p.raw_code ?? ""} ${(p.raw_label ?? "").toUpperCase()}`);
  if (m) poser(m[1]);
  poser(p.raw_code);
  return out;
}

type LigneAgregee = {
  quantite: number;
  valorisation: number;
  /** La fiche du référentiel du gérant, quand la ligne y est rattachée. Elle
   *  seule porte l'échéancier d'un emprunt non coté. */
  fiche?: CustomSecurity;
  /** Prix de revient TOTAL de la ligne : pru × quantité, sommé sur les lots. */
  revient: number;
  alias: string[];
  /** Pour nommer la ligne dans une réserve : « corrige la fiche de X » est une
   *  consigne, « une ligne est incohérente » n'en est pas une. */
  libelle: string;
};

/** Les lignes d'une section, regroupées par titre : deux lots d'un même titre
 *  sont une seule position pour qui mesure un prix. */
function parTitre(
  positions: Position[],
  section: string,
  fiches: Map<string, CustomSecurity>,
): Map<string, LigneAgregee> {
  const m = new Map<string, LigneAgregee>();
  for (const p of positions) {
    if (p.section !== section) continue;
    const k = cleTitre(p);
    const e = m.get(k) ?? {
      quantite: 0,
      valorisation: 0,
      revient: 0,
      alias: [],
      libelle: p.raw_label ?? k,
    };
    if (!e.fiche && p.custom_security_id) {
      const c = fiches.get(p.custom_security_id);
      if (c) e.fiche = c;
    }
    const q = Number(p.quantity) || 0;
    e.quantite += q;
    e.valorisation += Number(p.valuation) || 0;
    e.revient += (Number(p.pru) || 0) * q;
    for (const a of aliasDe(p, fiches)) if (!e.alias.includes(a)) e.alias.push(a);
    m.set(k, e);
  }
  return m;
}

/**
 * LE MODE D'AMORTISSEMENT DE CHAQUE TITRE, « T » ou « N ».
 *
 * « SUR NOMINAL » (N) : la valeur nominale du titre décroît, la quantité ne
 * bouge pas. Le prix unitaire baisse d'autant, et le capital remboursé doit
 * être recompté — sans quoi la ligne afficherait une perte qui n'en est pas
 * une.
 *
 * « SUR TITRE » (T) : le nominal ne bouge pas, ce sont des TITRES qui sont
 * tirés au sort et remboursés. La quantité baisse, le prix unitaire reste le
 * même, et le capital remboursé l'est AU PAIR : il n'y a ni gain ni perte à
 * constater. Le recompter serait un doublon — et pas un petit : une ligne
 * TPCI.O80 à 9 975 F le titre créditée de 10 000 F d'amortissement affichait
 * + 100 %, et portait à elle seule 8,7 points sur la poche obligataire de
 * NSIA FONDS DIVERSIFIE.
 */
function modesAmortissement(fiches: CustomSecurity[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const b of loadListedBonds()) {
    const mode = b.amortizationMode === "T" ? "T" : "N";
    if (b.isin) m.set(normId(b.isin), mode);
    if (b.code) m.set(normId(b.code), mode);
  }
  // Les titres du référentiel du gérant portent le mode dans leur fiche.
  for (const c of fiches) {
    const mode = c.attributes?.amortizationMode === "T" ? "T" : null;
    if (!mode) continue;
    if (c.isin) m.set(normId(c.isin), mode);
    if (c.code) m.set(normId(c.code), mode);
    m.set(`F${normId(c.id)}`, mode);
  }
  return m;
}

// ── Les revenus détachés pendant la période, PAR TITRE ──────────────────────
//
// UN COUPON N'EST PAS UNE PERTE. La valorisation d'une obligation porte son
// couru ; le jour du détachement, le couru retombe à zéro et l'argent part en
// banque. C'est une SORTIE DE CAPITAL de la poche, et la Dietz modifiée la
// retranche du gain — donc la restitue. Sans cela, un portefeuille souverain
// dont aucun titre n'avait décroché affichait − 4 % à − 11 %.
//
// LE MONTANT EST PRIS PAR TITRE, et c'est ce qui rend l'estimation solide : le
// calendrier ESV reconstruit ses quantités sur l'inventaire d'aujourd'hui, mais
// le coupon unitaire d'une obligation ne dépend d'aucune quantité.

/** Un flux détaché, daté, exprimé PAR TITRE — même forme que le gisement, pour
 *  que les deux sources se remplacent sans conversion. */
type RevenuTitre = { date: string; parTitre: number; capital?: boolean };

async function revenusParTitre(
  fundId: string,
  debut: string,
  fin: string,
  modes: Map<string, string>,
): Promise<{ revenus: Map<string, RevenuTitre[]>; connus: Set<string> }> {
  const calendrier = await construireCalendrierEsv(fundId);
  const out = new Map<string, RevenuTitre[]>();
  // LES TITRES DONT LE MODULE SAIT DEROULER LES FLUX, sur toute leur vie —
  // pas seulement dans la fenêtre. Un titre dont on ne connaît AUCUN flux ne
  // se mesure pas : son capital remboursé passerait pour une perte.
  const connus = new Set<string>();
  const poser = (cle: string, r: RevenuTitre) => {
    if (!cle) return;
    const l = out.get(cle) ?? [];
    l.push(r);
    out.set(cle, l);
  };
  for (const e of calendrier.evenements) {
    const m = Number(e.montantParTitre);
    if (!Number.isFinite(m)) continue;
    const isin = normId(e.isin);
    const code = normId(e.code);
    if (isin) connus.add(isin);
    if (code) connus.add(code);
    if (e.date < debut || e.date > fin) continue;
    // UN AMORTISSEMENT SUR TITRE NE SE LIT PAS ICI : ce sont des titres qui
    // sont tirés et remboursés au pair, et la QUANTITE le dit déjà. Le compter
    // en plus le compterait deux fois.
    if (e.nature === "amortissement" || e.nature === "remboursement") {
      if ((modes.get(isin) ?? modes.get(code)) === "T") continue;
    }
    if (m === 0) continue;
    const r: RevenuTitre = {
      date: e.date,
      parTitre: m,
      capital: e.nature === "amortissement" || e.nature === "remboursement",
    };
    if (isin) poser(isin, r);
    if (code && code !== isin) poser(code, r);
  }
  // LE GISEMENT COMPLETE LE CALENDRIER DU FONDS. Le calendrier ne connaît que
  // les titres ENCORE DETENUS — c'est la bonne règle pour la trésorerie, on
  // n'attend pas le coupon d'une obligation vendue. Pour une performance,
  // c'est l'inverse : une ligne cédée en cours de période a existé et doit se
  // mesurer. OAT CI0000008041, CI0000008561, SN0000003732 — vingt-cinq
  // milliards vendus chez NSIA FONDS DIVERSIFIE — étaient déclarées « sans
  // échéancier » alors qu'elles sont au gisement UMOA-Titres.
  for (const c of titresAEcheancier()) connus.add(c);

  return { revenus: out, connus };
}

// ── Actions et obligations : la poche, mouvements reconstruits ─────────────
//
// On applique la Dietz modifiée à la poche entière, avec des mouvements tirés
// du carnet d'ordres quand il en porte la trace, et DEDUITS DE L'ECART DE
// QUANTITE entre les deux inventaires sinon — datés au milieu de la période.
//
// CE QUE CETTE FORME CONTIENT SANS QU'IL FAILLE L'AJOUTER :
//
//   LES COUPONS COURUS. La valorisation porte le couru, donc V₁ − V₀ contient
//   l'intérêt couru de la période ; le coupon DETACHE, qui sort de la poche,
//   revient au numérateur comme flux. La somme des deux est exactement le
//   coupon couru — c'est une identité : couru₁ − couru₀ + coupons détachés =
//   taux × VN × jours/365.
//
//   LA DECOTE ET LA SURCOTE. Un titre entré en cours de période entre au
//   dénominateur pour son PRIX DE REVIENT et ressort au numérateur pour sa
//   valeur d'inventaire : l'écart au nominal se constate de lui-même, dans un
//   sens pour la décote, dans l'autre pour la surcote. Un titre détenu depuis
//   le début n'en produit aucune, puisque sa décote a été constatée avant la
//   période — exactement la règle du gérant.
//
//   LES AMORTISSEMENTS N'Y SONT PAS, et c'est voulu. Un remboursement de
//   capital est un flux de SORTIE, pas un produit : il est retranché du gain,
//   donc ne rapporte rien, et quitte le dénominateur au prorata du temps
//   restant — ce capital-là ne travaille plus.
//
// ET LES LIGNES VENDUES NE SONT PLUS JETEES. C'était le défaut de la mesure
// précédente : chez NSIA FONDS DIVERSIFIE, les trois quarts de la poche
// obligataire ont tourné, on mesurait 23 % et on extrapolait le reste. Une
// cession est désormais un flux, pas un trou.
function rendementPoche(
  avant: Map<string, LigneAgregee>,
  apres: Map<string, LigneAgregee>,
  revenus: Map<string, RevenuTitre[]>,
  /** Titres dont le module sait dérouler les flux. `null` quand la question ne
   *  se pose pas — une action n'a pas d'échéancier, et son cours suffit. */
  connus: Set<string> | null,
  ordres: Map<string, MouvementOrdre[]>,
  debut: string,
  fin: string,
  /** Vrai pour les obligations : on va alors chercher au gisement ce que le
   *  calendrier du fonds ignore, faute de détenir encore le titre. */
  avecGisement: boolean,
): RendementClasse {
  const pivot = milieuDe(debut, fin);
  const flux: Flux[] = [];
  let v0 = 0;
  let v1 = 0;
  let baseTotale = 0;
  let brut = 0;
  const lignesMuettes: string[] = [];
  const lignesIncoherentes: string[] = [];

  for (const cle of new Set([...avant.keys(), ...apres.keys()])) {
    const d = avant.get(cle);
    const f = apres.get(cle);
    const q0 = d?.quantite ?? 0;
    const q1 = f?.quantite ?? 0;
    const val0 = d?.valorisation ?? 0;
    const val1 = f?.valorisation ?? 0;
    const alias = (d?.alias ?? []).concat(f?.alias ?? []);
    const libelle = d?.libelle ?? f?.libelle ?? cle;
    baseTotale += val0;

    const p0 = q0 > 0 ? val0 / q0 : 0;
    const p1 = q1 > 0 ? val1 / q1 : 0;
    const reference = p0 > 0 ? p0 : p1;

    // UN TITRE DONT ON NE CONNAIT AUCUN FLUX NE SE MESURE PAS. Son nominal
    // s'amortit sans qu'on sache de combien, et la baisse de son prix unitaire
    // se lirait comme une perte. Mieux vaut l'écarter et le DIRE que publier
    // − 50 % sur un emprunt qui rembourse normalement.
    const fiche = d?.fiche ?? f?.fiche;
    if (connus && !alias.some((a) => connus.has(a)) && !ficheDeroulable(fiche)) {
      lignesMuettes.push(libelle);
      continue;
    }

    // Le calendrier du fonds d'abord — il porte les titres du référentiel du
    // gérant et les dividendes, que le gisement ignore. Le gisement ensuite,
    // pour tout ce que le fonds ne détient plus.
    const detaches = (() => {
      const duFonds = alias.map((a) => revenus.get(a)).find((v) => v && v.length > 0);
      if (duFonds && duFonds.length > 0) return duFonds;
      if (!avecGisement) return [];
      const duGisement = fluxDuReferentiel(alias, debut, fin);
      if (duGisement.length > 0) return duGisement;
      // DERNIER REPLI : LA FICHE. Un emprunt non coté vendu en cours de
      // période n'est nulle part ailleurs — ni à la cote, ni au guichet UMOA,
      // et le calendrier du fonds ne le déroule plus dès qu'il quitte
      // l'inventaire. Sa fiche, elle, porte coupure, taux, échéance et profil.
      return fiche ? fluxDeLaFiche(fiche, debut, fin) : [];
    })();
    const revenuTotal = detaches.reduce((s, r) => s + r.parTitre, 0);

    // UN REVENU HORS DE PROPORTION AVEC LE TITRE DENONCE LA FICHE, PAS LE
    // MARCHE. La fiche de BEFI-ALIOS FINANCE porte un nominal de
    // 50 000 000 000 F — la taille de l'émission entière saisie dans la case
    // du titre —, et la poche de FCP AURORE SECURITE II affichait + 5 075 %.
    //
    // LE SEUIL N'EST PAS LE MEME SELON QU'ON DETIENT ENCORE LE TITRE :
    //
    //   ENCORE DETENU A LA FIN : il n'a pas pu rendre plus que son propre
    //   prix. Ses tranches d'amortissement sont des FRACTIONS du capital, son
    //   coupon quelques points.
    //
    //   PARTI AVANT LA FIN : il a pu être REMBOURSE, et un remboursement vaut
    //   le pair plus un coupon — donc davantage qu'un prix acheté sous le
    //   pair. GW0000000707, OAT bissau-guinéenne échue le 20 juin 2026, valait
    //   10 332 F au 31 décembre dont 332 F de couru ; elle a rendu 10 625 F,
    //   soit 10 000 F de nominal et 625 F de coupon. Un rapport de 1,03, que
    //   le seuil précédent refusait à tort. On laisse passer jusqu'à une fois
    //   et demie : au-delà, aucun remboursement ne l'explique.
    const plafond = q0 > 0 && q1 > 0 ? 1 : 1.5;
    if (reference > 0 && revenuTotal > reference * plafond) {
      lignesIncoherentes.push(libelle);
      continue;
    }

    v0 += val0;
    v1 += val1;

    // ── CE QUE LE CARNET D'ORDRES SAIT ────────────────────────────────────
    // Date et montant RÉELS, frais et courus compris. On ne compte que les
    // exécutions DENOUEES : un ordre non servi n'a déplacé aucun capital.
    const traces =
      ordres.get(cle) ?? alias.map((a) => ordres.get(a)).find((v) => v && v.length > 0) ?? [];
    let qteTracee = 0;
    for (const m of traces) {
      flux.push({ date: m.date, montant: m.montant });
      brut += Math.abs(m.montant);
      qteTracee += m.quantite;
    }

    // ── CE QU'IL NE SAIT PAS, DEDUIT DES QUANTITES ────────────────────────
    // Au milieu de la période : à défaut de savoir, le milieu ne penche
    // d'aucun côté. Une entrée est valorisée à son PRIX DE REVIENT — c'est
    // par là que la décote et la surcote entrent dans le calcul. Une sortie,
    // faute de prix de cession, à sa valeur d'inventaire de début.
    const delta = q1 - q0 - qteTracee;
    if (Math.abs(delta) > 1e-9) {
      const revientFin = f && f.quantite > 0 && f.revient > 0 ? f.revient / f.quantite : 0;
      const prix = delta > 0 ? revientFin || p1 || p0 : p0 || p1;
      if (prix > 0) {
        flux.push({ date: pivot, montant: delta * prix });
        brut += Math.abs(delta * prix);
      }
    }

    // ── LES REVENUS DETACHES SORTENT DE LA POCHE ──────────────────────────
    const porte = q0 > 0 && q1 > 0 ? Math.min(q0, q1) : q0 || q1;
    if (porte > 0) {
      for (const r of detaches) {
        flux.push({ date: r.date, montant: -r.parTitre * porte });
        brut += Math.abs(r.parTitre * porte);
      }
    }
  }

  const performance = dietzModifie(v0, v1, flux, debut, fin);
  if (performance == null) return SANS;

  const couverture = baseTotale > 0 ? v0 / baseTotale : 1;
  const motifs: string[] = [];
  if (lignesMuettes.length > 0)
    motifs.push(
      `${lignesMuettes.length} ligne(s) sans échéancier au référentiel : ${lignesMuettes.slice(0, 3).join(", ")}`,
    );
  if (lignesIncoherentes.length > 0)
    motifs.push(
      `fiche à corriger, le nominal ne correspond pas à la coupure valorisée : ${lignesIncoherentes.slice(0, 3).join(", ")}`,
    );
  // DES MOUVEMENTS PLUS GROS QUE LA POCHE : la Dietz modifiée suppose les
  // apports petits devant le capital, ou bien répartis. Au-delà, le chiffre
  // reste le meilleur disponible mais cesse d'être une performance au sens
  // strict, et l'écran doit pouvoir le dire.
  const tension = v0 > 0 ? brut / v0 : 0;
  if (tension > 1.5)
    motifs.push(
      `les mouvements de la période pèsent ${Math.round(tension * 100)} % du capital de début`,
    );

  return {
    performance,
    methode: "titres-detenus",
    couverture,
    reserve: motifs.length > 0 ? `${motifs.join(" ; ")}.` : null,
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

  type Depot = { taux: number; nominal: number; debut: string; fin: string; valo: number };
  const depots = new Map<string, Depot>();
  // Les dépôts qu'on ne sait pas mesurer, DEDOUBLONNES EUX AUSSI : la
  // couverture compare deux populations, elle doit les compter de la même
  // façon. Un dépôt vu aux deux inventaires comptait auparavant une fois au
  // numérateur et deux au dénominateur, et la ligne portait un avertissement
  // alors qu'elle était entièrement mesurée.
  const sansTaux = new Map<string, number>();

  for (const { position: p, auDebut } of lignes) {
    const a = p.custom_security_id ? fiches.get(p.custom_security_id)?.attributes : null;
    const tauxFiche = nombre(a?.tauxInteret);
    const taux = Number.isFinite(tauxFiche) ? tauxFiche : tauxDuLibelle(p.raw_label);
    const nominalFiche = nombre(a?.montantNominal);
    const nominal = Number.isFinite(nominalFiche) ? nominalFiche : (p.valuation ?? 0);
    const valo = p.valuation ?? nominal;

    // Un dépôt DEJA LA au premier inventaire courait depuis le début de la
    // période, quelle que soit la date de valeur de sa fiche — qui ne porte
    // que la dernière reconduction. Sans cette règle, un dépôt vieux de neuf
    // mois ne comptait que pour les vingt jours de sa dernière prorogation.
    const dv = (a?.dateValeur ?? "").trim();
    const de = (a?.dateEcheance ?? "").trim();
    const d1 = auDebut || !dv || dv < debut ? debut : dv;
    const d2 = de && de < fin ? de : fin;

    if (!Number.isFinite(taux) || !(nominal > 0) || !(jours(d1, d2) > 0)) {
      const k = normNom(p.raw_label);
      sansTaux.set(k, Math.max(sansTaux.get(k) ?? 0, valo));
      continue;
    }

    const cle = `${normNom(String(a?.contrepartie ?? p.raw_label))}|${nominal}|${taux}`;
    const deja = depots.get(cle);
    if (deja) {
      // Même argent, même contrepartie, même taux : on garde l'enveloppe la
      // plus large plutôt que de compter le capital deux fois.
      if (d1 < deja.debut) deja.debut = d1;
      if (d2 > deja.fin) deja.fin = d2;
      if (valo > deja.valo) deja.valo = valo;
    } else {
      depots.set(cle, { taux, nominal, debut: d1, fin: d2, valo });
    }
  }

  let interets = 0;
  let capitalMoyen = 0;
  let mesure = 0;
  for (const d of depots.values()) {
    const n = jours(d.debut, d.fin);
    interets += d.nominal * (d.taux / 100) * (n / 365);
    capitalMoyen += d.nominal * (n / dureeFenetre);
    mesure += d.valo;
  }
  if (!(capitalMoyen > 0)) return SANS;

  const total = mesure + [...sansTaux.values()].reduce((s, v) => s + v, 0);
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
    "raw_label, raw_code, quantity, valuation, pru, match_id, match_kind, custom_security_id, section";
  const positions = async (snapshotId: string): Promise<Position[]> => {
    const { data } = await supabase
      .from("fund_portfolio_positions")
      .select(CHAMPS)
      .eq("snapshot_id", snapshotId);
    return (data ?? []) as Position[];
  };

  const fichesRef = await loadCustomSecurities();
  const fiches = new Map(fichesRef.map((c) => [c.id, c]));
  const [posDebut, posFin, esv, ordres] = await Promise.all([
    positions(snapshotDebut),
    positions(snapshotFin),
    revenusParTitre(fundId, debut, fin, modesAmortissement(fichesRef)),
    // LE CARNET D'ORDRES PASSE AVANT LA CONVENTION : quand il porte la trace
    // d'une exécution, on en prend la date et le montant réels. La déduction
    // par les quantités ne sert qu'à ce qu'il ignore.
    mouvementsDuCarnet(fundId, debut, fin, ["actions", "obligations", "mtp"], normId),
  ]);
  // Fenêtre invraisemblable : le prix des titres reste comparable, les revenus
  // non — on les ramasserait sur des siècles.
  const revenus = fenetreDouteuse ? new Map<string, RevenuTitre[]>() : esv.revenus;

  // ── Actions, obligations, autres : la poche, mouvements reconstruits ──────
  for (const section of ["action", "obligation", "autre"]) {
    const avant = parTitre(posDebut, section, fiches);
    const apres = parTitre(posFin, section, fiches);
    if (avant.size === 0 && apres.size === 0) continue;
    // L'EXIGENCE D'ECHEANCIER NE VAUT QUE POUR LES OBLIGATIONS : une action n'a
    // pas d'échéancier, son cours suffit, et un titre sans avis de dividende
    // reste parfaitement mesurable.
    const r = rendementPoche(
      avant,
      apres,
      revenus,
      section === "obligation" ? esv.connus : null,
      ordres,
      debut,
      fin,
      section === "obligation" && !fenetreDouteuse,
    );
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
  const depots = [
    ...posDebut.filter((p) => p.section === "dat").map((position) => ({ position, auDebut: true })),
    ...posFin.filter((p) => p.section === "dat").map((position) => ({ position, auDebut: false })),
  ];
  if (depots.length > 0 && !fenetreDouteuse) out.dat = rendementDat(depots, fiches, debut, fin);

  return out;
}

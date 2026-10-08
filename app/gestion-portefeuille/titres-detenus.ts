import "server-only";

// === Tous les titres obligataires détenus, tous fonds confondus ===========
//
// LA QUESTION QU'ON NE POUVAIT PAS POSER. « Combien d'OAT du Sénégal reste-t-il
// disponible, et dans quels fonds ? » demandait d'ouvrir quinze inventaires,
// d'y retrouver les lignes souveraines, puis de retrancher de tête les titres
// prêtés et ceux pris en réméré. Une demi-journée, et une erreur par
// distraction à chaque fois.
//
// UNE SEULE LISTE, PLATE, QUI SE TRIE. Chaque ligne est un titre dans un
// fonds, avec sa nature, son émetteur, son échéance, et surtout CE QUI EN
// RESTE RÉELLEMENT CESSIBLE.
//
// LA QUANTITÉ QUI COMPTE N'EST PAS CELLE DE L'INVENTAIRE. Quatre choses s'en
// retranchent, et c'est le contrôle de cession qui les tient — le même que
// celui qui refuse une vente : les titres PRÊTÉS sont dehors, ceux PRIS EN
// RÉMÉRÉ doivent retourner à la contrepartie, la part non servie des ventes
// déjà passées est promise, et les mouvements postérieurs à l'arrêté s'y
// ajoutent. En écrire une seconde version ici aurait garanti que les deux
// divergent — et c'est la version de l'écran qui aurait eu tort.
//
// LE MODULE NE FILTRE RIEN, IL DÉCRIT. Les filtres sont à l'écran, parce que
// c'est là qu'on cherche, et qu'une liste rendue déjà réduite ne se recompose
// pas sans un aller-retour au serveur.
//
// UNE LIGNE PAR TITRE, ET NON PAR LIGNE D'INVENTAIRE. Un même emprunt se
// porte souvent en deux ou trois lots — acquis à des dates différentes, à des
// prix différents. L'inventaire les garde séparés, et c'est sa fonction ; cet
// écran, lui, répond à « combien en ai-je », et la réponse est une somme. Les
// afficher séparément donnait des doublons apparents, chacun portant la MÊME
// quantité disponible — celle du fonds entier.
//
// UN TITRE SE RECONNAÎT PAR N'IMPORTE LAQUELLE DE SES DÉSIGNATIONS. Une
// position porte jusqu'à six identifiants : l'ISIN et le code résolus au
// rapprochement, ceux de la fiche du gérant, le code brut du dépositaire,
// l'identifiant de fiche. Chercher sous un seul — et c'était `matchId`, qui
// est un UUID pour les fiches du gérant — laissait sans caractéristiques des
// titres parfaitement connus du référentiel.
//
// UN FONDS A LA FOIS, ET C'EST DÉLIBÉRÉ. Lire les quinze portefeuilles dans un
// seul appel demandait une minute pendant laquelle l'écran ne montrait rien —
// et, passé la limite d'une action serveur, ne montrait jamais rien. L'écran
// appelle donc fonds par fonds et remplit sa liste à mesure : le premier
// portefeuille s'affiche en une seconde, et l'attente devient un compteur au
// lieu d'un écran blanc.

import { loadBonds, loadListedBonds } from "@/lib/dataLoader";
import { countryNames, type Bond, type BondCountry } from "@/lib/bondsUEMOA";
import type { ListedBond } from "@/lib/listedBondsTypes";

import { loadCustomSecurities } from "./portfolio-data";
import {
  disponibilitesDuFonds,
  positionsDeReference,
} from "./operations-marche-disponibilite";
import type { CustomSecurity } from "./portfolio-types";
import type {
  NatureTitre,
  TitreDetenu,
  TitresDunFonds,
} from "./titres-detenus-types";

const num = (v: unknown, d = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : d;
  }
  return d;
};

// LE VOCABULAIRE VIT A PART, dans `titres-detenus-types` : l'ecran en a
// besoin, et il est client. Importer une VALEUR d'ici l'aurait fait tirer la
// base, les CSV et le client Supabase dans le bundle du navigateur.
export type {
  NatureTitre,
  TitreDetenu,
  TitresDunFonds,
} from "./titres-detenus-types";

const normId = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase();

/**
 * Les titres obligataires détenus par UN fonds, et ce qui en reste cessible.
 *
 * CALCUL À LA DEMANDE, jamais au rendu de la page : il lit l'inventaire ET le
 * carnet d'ordres du fonds. Le faire à chaque affichage du module
 * d'importation le ferait payer à qui vient simplement charger un fichier.
 */
export async function construireTitresDunFonds(
  fondsId: string,
  fondsNom: string,
): Promise<TitresDunFonds> {
  const [snapshot, customs] = await Promise.all([
    positionsDeReference(fondsId),
    loadCustomSecurities(),
  ]);
  if (!snapshot) return { fondsId, fondsNom, dateInventaire: null, titres: [] };

  const customParId = new Map(customs.map((c) => [c.id, c]));
  const souverainParIsin = new Map<string, Bond>();
  for (const b of loadBonds()) {
    if (b.isin) souverainParIsin.set(normId(b.isin), b);
  }
  const coteParCle = new Map<string, ListedBond>();
  for (const b of loadListedBonds()) {
    if (b.isin) coteParCle.set(normId(b.isin), b);
    if (b.code) coteParCle.set(normId(b.code), b);
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);

  // ── Première passe : décrire les lignes, et les regrouper ─────────────
  type Brouillon = Omit<
    TitreDetenu,
    "pretee" | "remeree" | "engagee" | "mouvements" | "disponible"
  > & { designations: string[] };
  const parTitre = new Map<string, Brouillon>();

  for (const p of snapshot.positions) {
    if (p.section !== "obligation") continue;
    const custom = p.customSecurityId ? customParId.get(p.customSecurityId) : undefined;

    // TOUTES LES DÉSIGNATIONS, dans l'ordre où elles méritent confiance :
    // l'ISIN et le code résolus au rapprochement d'abord — ils viennent du
    // référentiel —, puis ceux de la fiche, puis le brut du dépositaire.
    // `matchId` vient en dernier : c'est un UUID pour une fiche du gérant, et
    // il ne désigne rien au gisement.
    const designations = [
      p.matchIsin,
      p.matchCode,
      custom?.isin,
      custom?.code,
      p.rawCode,
      p.matchId,
    ]
      .map(normId)
      .filter(Boolean);
    if (designations.length === 0) continue;

    const souverain = designations.map((d) => souverainParIsin.get(d)).find(Boolean);
    const cote = designations.map((d) => coteParCle.get(d)).find(Boolean);

    // L'IDENTITÉ DE REGROUPEMENT : l'ISIN du référentiel quand on l'a — c'est
    // lui qui fait foi et qui est stable —, la première désignation sinon.
    const identite = normId(
      souverain?.isin || cote?.isin || cote?.code || custom?.isin || custom?.code ||
        designations[0],
    );

    const quantite = num(p.quantity);
    const valorisation = num(p.valuation);

    const deja = parTitre.get(identite);
    if (deja) {
      // DEUX LOTS DU MÊME EMPRUNT : on additionne, et l'on garde la trace du
      // nombre de lignes d'inventaire pour que la somme s'explique.
      deja.quantiteInventaire += quantite;
      deja.valorisation += valorisation;
      deja.lots += 1;
      deja.prixInventaire =
        deja.quantiteInventaire > 0 ? deja.valorisation / deja.quantiteInventaire : 0;
      for (const d of designations) {
        if (!deja.designations.includes(d)) deja.designations.push(d);
      }
      continue;
    }

    const libelle =
      souverain?.nameShort || cote?.name || custom?.name || p.matchLabel || p.rawLabel ||
      identite;
    const echeance =
      souverain?.maturityDate || cote?.maturityDate || echeanceDeLaFiche(custom) || "";

    parTitre.set(identite, {
      cle: `${fondsId}|${identite}`,
      fondsId,
      fondsNom,
      isin: souverain?.isin || cote?.isin || custom?.isin || p.matchIsin || identite,
      code: cote?.code || custom?.code || p.matchCode || p.rawCode || "",
      libelle,
      nature: natureDe(souverain, cote, custom),
      emetteur: souverain?.issuer || cote?.issuer || emetteurDeLaFiche(custom) || "—",
      pays: (souverain?.country ?? "") as BondCountry | "",
      etat: souverain
        ? (countryNames[souverain.country] ?? souverain.country)
        : paysLisible(cote?.country) || emetteurDeLaFiche(custom) || "—",
      facial: souverain?.couponRate ?? cote?.couponRate ?? tauxDeLaFiche(custom),
      echeance,
      dureeResiduelle: anneesJusqua(aujourdhui, echeance),
      nominal:
        num(souverain?.nominalValue) ||
        num(cote?.nominalOrigine) ||
        num(cote?.nominalValue) ||
        num(custom?.attributes?.nominalValue) ||
        0,
      emission: souverain?.issueDate || cote?.issueDate || "",
      frequence: souverain?.frequency ?? cote?.couponFrequency ?? 0,
      amortissement: profilAmortissement(souverain, cote, custom),
      secteur: cote?.sector || cote?.issuerType || (souverain ? "Souverain" : "—"),
      // RÉSOLU veut dire : le gisement OU la fiche du gérant connaît ce titre.
      // Rien des trois, et la ligne n'a que son code brut.
      resolu: !!(souverain || cote || custom),
      lots: 1,
      quantiteInventaire: quantite,
      valorisation,
      prixInventaire: quantite > 0 ? valorisation / quantite : 0,
      dateInventaire: snapshot.asOfDate,
      designations,
    });
  }

  const brouillons = [...parTitre.values()];

  // ── Seconde passe : ce qui reste cessible, en UNE lecture du carnet ────
  const dispos = await disponibilitesDuFonds(
    fondsId,
    // LE CONTRÔLE DE CESSION INDEXE L'INVENTAIRE SOUS TOUTES SES DÉSIGNATIONS :
    // on lui donne les nôtres, et il trouve sous la première qui lui parle.
    brouillons.map((b) => ({
      cle: b.cle,
      designations: b.designations,
      libelle: b.libelle,
    })),
  );

  // Les désignations ont servi à chercher : elles ne sortent pas du module.
  const titres = brouillons.map((brouillon) => {
    const { designations, ...b } = brouillon;
    void designations;
    const d = dispos.get(b.cle);
    return {
      ...b,
      pretee: d?.pretee ?? 0,
      remeree: d?.remeree ?? 0,
      engagee: d?.engagee ?? 0,
      mouvements: d?.mouvements ?? 0,
      disponible: Math.max(0, d?.disponible ?? b.quantiteInventaire),
    };
  });

  // Les plus grosses lignes d'abord : c'est ce qu'on cherche quand on ouvre la
  // liste sans savoir encore ce qu'on y cherche.
  titres.sort((a, b) => b.valorisation - a.valorisation);

  return { fondsId, fondsNom, dateInventaire: snapshot.asOfDate, titres };
}

/**
 * LA NATURE SE LIT AU RÉFÉRENTIEL, pas à la forme de l'ISIN. Un code pays
 * suivi de chiffres désigne aussi bien une OAT qu'un BAT qu'un emprunt coté :
 * deviner d'après la chaîne aurait mélangé les trois.
 */
function natureDe(
  souverain: Bond | undefined,
  cote: ListedBond | undefined,
  custom: CustomSecurity | undefined,
): NatureTitre {
  if (souverain) {
    if (souverain.type === "OAT" || souverain.type === "BAT" || souverain.type === "OTAR")
      return souverain.type;
    return "Non cotée";
  }
  if (cote) return "Cotée";
  // Une fiche du gérant qui se dit cotée l'est : elle porte alors l'attribut,
  // même si la cote ne la connaît pas encore sous ce code.
  const source = (custom?.attributes?.source ?? "").trim();
  if (source === "listed-bond") return "Cotée";
  if (source === "sovereign") return "OAT";
  return "Non cotée";
}

/**
 * LE PROFIL D'AMORTISSEMENT, en clair.
 *
 * Le gisement souverain modélise ses OAT IN FINE — coupons sur nominal
 * constant, capital au dernier flux —, et c'est ce que déroule l'échéancier du
 * site. La cote, elle, porte son profil et son MODE : « sur nominal » fait
 * baisser la valeur du titre, « sur titre » en fait disparaître des unités, et
 * les deux ne se lisent pas au même endroit du portefeuille.
 */
function profilAmortissement(
  souverain: Bond | undefined,
  cote: ListedBond | undefined,
  custom: CustomSecurity | undefined,
): string {
  if (cote) {
    const type = (cote.amortizationType || "IF").toUpperCase();
    if (type === "IF") return "In fine";
    const mode = cote.amortizationMode === "T" ? "sur titre" : "sur nominal";
    return `${type === "AC" ? "Constant" : type === "ACD" ? "Constant différé" : type} — ${mode}`;
  }
  if (souverain) return "In fine";
  const profil = (custom?.attributes?.amortizationProfile ?? "").trim();
  return profil || "—";
}

/** La cote nomme son pays tantôt par son code, tantôt en toutes lettres. */
function paysLisible(pays: string | undefined): string {
  const p = (pays ?? "").trim();
  if (p.length !== 2) return p;
  return countryNames[p.toUpperCase() as BondCountry] ?? p;
}

function tauxDeLaFiche(c: CustomSecurity | undefined): number {
  const t = num(c?.attributes?.couponRate);
  // Le référentiel du gérant saisit le taux en POUR CENT ; le gisement du site
  // le porte en décimal. On ramène à la convention du site.
  return t > 1 ? t / 100 : t;
}

function echeanceDeLaFiche(c: CustomSecurity | undefined): string {
  return (c?.attributes?.maturityDate ?? "").trim();
}

function emetteurDeLaFiche(c: CustomSecurity | undefined): string {
  return (c?.attributes?.issuer ?? "").trim();
}

/** Années entre deux dates, zéro si l'échéance est passée ou inconnue. */
function anneesJusqua(debut: string, echeance: string): number {
  if (!echeance) return 0;
  const ms =
    new Date(`${echeance}T00:00:00Z`).getTime() - new Date(`${debut}T00:00:00Z`).getTime();
  return Number.isFinite(ms) ? Math.max(0, ms / (365.25 * 86_400_000)) : 0;
}

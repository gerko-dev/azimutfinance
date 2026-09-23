// === Frais de gestion ===
//
// LA FORMULE, retrouvée par recoupement sur l'historique importé :
//
//     frais du mois = moyenne mensuelle de l'actif net × taux annuel ÷ 12
//
// La moyenne porte sur les actifs nets de TOUTES les dates de valorisation du
// mois — une par jour de cotation. Ce n'est pas l'actif net de fin de mois :
// un fonds qui encaisse une grosse souscription le 28 paierait alors des frais
// sur un encours qu'il n'a porté que trois jours.
//
// Vérifiée sur août 2026 : 57 123 639 F pour Aurore Opportunité et
// 55 845 745 F pour le Diversifié. L'écart résiduel — moins de 1 % — tient aux
// jours de cotation absents de l'historique importé, pas à la formule.
//
// QUEL MOIS AFFICHER. Les frais d'un mois se prélèvent au début du suivant.
// Le point de trésorerie porte donc les frais du mois M jusqu'au 5 de M+1,
// puis bascule sur ceux de M+1. Jusqu'au 5, le trésorier voit encore ce qu'il
// doit décaisser ; après, ce qu'il provisionne.
//
// Ce fichier NE LIT RIEN — ni base, ni fichier. Il prend un historique et rend
// un calcul, ce qui le rend utilisable des deux côtés de la frontière
// client/serveur et testable à la main.

import type { NavPoint } from "./nav-types";

/** Mois d'une date ISO, au format AAAA-MM. */
export const moisDe = (dateISO: string): string => dateISO.slice(0, 7);

/** Mois précédent, au format AAAA-MM. */
export function moisPrecedent(mois: string): string {
  const an = Number(mois.slice(0, 4));
  const m = Number(mois.slice(5, 7));
  return m <= 1
    ? `${an - 1}-12`
    : `${an}-${String(m - 1).padStart(2, "0")}`;
}

/** Jour du mois au-delà duquel on bascule sur le mois suivant. */
export const JOUR_BASCULE = 5;

/**
 * Mois dont les frais s'affichent à une date donnée.
 *
 * Du 1ᵉʳ au 5, ce sont encore ceux du mois écoulé : ils n'ont pas encore été
 * prélevés, et les faire disparaître du point le 1ᵉʳ ferait croire au trésorier
 * qu'il n'a plus rien à sortir.
 */
export function moisDesFrais(dateISO: string): string {
  const jour = Number(dateISO.slice(8, 10));
  const mois = moisDe(dateISO);
  return jour <= JOUR_BASCULE ? moisPrecedent(mois) : mois;
}

export type FraisGestion = {
  /** Mois calculé, AAAA-MM. */
  mois: string;
  /** Taux annuel retenu, en décimal. */
  taux: number;
  /** Moyenne des actifs nets du mois. */
  actifNetMoyen: number;
  /** Nombre de valorisations entrées dans la moyenne. */
  points: number;
  /** Première et dernière date retenues — pour que le chiffre se recoupe. */
  du: string;
  au: string;
  /** Le montant : moyenne × taux ÷ 12. */
  montant: number;
  /**
   * Le mois n'est pas terminé à la date de référence.
   *
   * La moyenne ne porte alors que sur les jours écoulés : c'est une
   * PROVISION, pas une facture. L'afficher sans le dire laisserait croire à un
   * montant définitif qui bougera encore.
   */
  provisoire: boolean;
  /** Ce qui empêche le calcul, ou null. */
  indisponible: string | null;
};

/**
 * Frais de gestion d'un fonds à une date de référence.
 *
 * `taux` est le taux ANNUEL en décimal (0,015 = 1,5 %), tel que la fiche du
 * fonds le porte. Un taux nul ou absent ne produit pas zéro : il produit une
 * indisponibilité, parce que zéro et « pas renseigné » ne veulent pas dire la
 * même chose au trésorier.
 */
export function fraisGestionDuMois(
  historique: NavPoint[],
  taux: number,
  dateReference: string,
): FraisGestion {
  const mois = moisDesFrais(dateReference);
  const vide = (indisponible: string): FraisGestion => ({
    mois,
    taux,
    actifNetMoyen: 0,
    points: 0,
    du: "",
    au: "",
    montant: 0,
    provisoire: false,
    indisponible,
  });

  if (!(taux > 0)) {
    return vide("Aucun taux de frais de gestion n'est renseigné sur la fiche du fonds.");
  }

  // Les valorisations du mois. Un point sans actif net ne compte pas : le
  // faire entrer comme zéro écraserait la moyenne au lieu de l'ignorer.
  const dansLeMois = historique
    .filter((p) => moisDe(p.date) === mois && p.actifNet != null && p.actifNet > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (dansLeMois.length === 0) {
    return vide(
      `Aucune valeur liquidative importée pour ${mois} : la moyenne d'actif net ne peut pas se calculer.`,
    );
  }

  const somme = dansLeMois.reduce((s, p) => s + (p.actifNet ?? 0), 0);
  const actifNetMoyen = somme / dansLeMois.length;

  return {
    mois,
    taux,
    actifNetMoyen,
    points: dansLeMois.length,
    du: dansLeMois[0].date,
    au: dansLeMois[dansLeMois.length - 1].date,
    montant: (actifNetMoyen * taux) / 12,
    // Le mois de référence est celui de la date : on est encore dedans.
    provisoire: mois === moisDe(dateReference),
    indisponible: null,
  };
}

/** Intitulé du mois en toutes lettres — « août 2026 ». */
export function libelleMois(mois: string): string {
  const d = new Date(`${mois}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return mois;
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

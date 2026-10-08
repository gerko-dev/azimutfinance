// === Sélection de titres — le vocabulaire, sans le serveur ================
//
// L'ÉCRAN A BESOIN DES TYPES, PAS DU MOTEUR. `titres-detenus.ts` lit la base,
// les CSV et le carnet d'ordres : il est marqué « server-only », et à raison.
// Mais le tableau qui l'affiche est un composant client, et il lui faut la
// forme des lignes — plus la liste des natures, qui peuple un menu déroulant.
//
// IMPORTER UNE VALEUR D'UN MODULE SERVEUR TIRE TOUT LE MODULE AVEC ELLE. Un
// `import type` s'efface à la compilation ; une constante, non. Le bundle
// client s'est mis à réclamer `fs`, `next/headers` et le client Supabase, et
// le build a échoué sur quatorze erreurs qui n'en faisaient qu'une.
//
// D'où ce fichier : le vocabulaire partagé, et rien d'autre.

import type { BondCountry } from "@/lib/bondsUEMOA";

/**
 * NATURE DU TITRE, et c'est le premier tri qu'on demande à cette liste.
 *
 * Les trois premières viennent du guichet UMOA-Titres et sont celles de son
 * référentiel ; « Cotée » désigne la cote obligataire BRVM ; « Non cotée »,
 * tout ce qui ne se négocie que de gré à gré et n'existe que dans les fiches
 * du gérant.
 */
export type NatureTitre = "OAT" | "BAT" | "OTAR" | "Cotée" | "Non cotée";

export const NATURES: NatureTitre[] = ["OAT", "BAT", "OTAR", "Cotée", "Non cotée"];

/** Un titre obligataire détenu par un fonds, et ce qui en reste cessible. */
export type TitreDetenu = {
  /** Clef de ligne : un même titre peut être détenu par plusieurs fonds. */
  cle: string;
  fondsId: string;
  fondsNom: string;
  isin: string;
  code: string;
  libelle: string;
  nature: NatureTitre;
  /** Émetteur tel que le référentiel le nomme. */
  emetteur: string;
  /** Code pays de l'État émetteur, vide pour un titre non souverain. */
  pays: BondCountry | "";
  /** Le pays en toutes lettres, ou l'émetteur à défaut : c'est la colonne. */
  etat: string;
  facial: number;
  echeance: string;
  /** Durée résiduelle en années, à la date du jour. */
  dureeResiduelle: number;

  // ── Les caractéristiques de l'emprunt ───────────────────────────────────
  //
  // TOUTES PRÉSENTES, TOUTES TRIABLES. On cherche parfois « les emprunts en
  // différé », parfois « les coupures autres que 10 000 », parfois « ce qui
  // paie trimestriellement » — et rien ne permet de deviner d'avance laquelle
  // de ces questions se posera.
  /** Valeur nominale par titre — 10 000 F pour un souverain, tout autre
   *  chose pour un emprunt de gré à gré placé en grosses coupures. */
  nominal: number;
  /** Date d'émission, ISO. */
  emission: string;
  /** Coupons par an : 1, 2 ou 4. Zéro quand le référentiel ne le dit pas. */
  frequence: number;
  /** Profil d'amortissement, en clair. */
  amortissement: string;
  /** Secteur ou nature de l'émetteur, tel que le référentiel le classe. */
  secteur: string;
  /**
   * LE TITRE A-T-IL ÉTÉ RETROUVÉ AU RÉFÉRENTIEL ?
   *
   * Faux, la ligne n'a ni facial, ni échéance, ni nature : elle n'est
   * rapprochée de rien. Le dire vaut mieux que d'afficher des tirets qu'on
   * prend pour des données manquantes au référentiel alors que c'est le
   * RAPPROCHEMENT qui a échoué — et que la correction est à l'import.
   */
  resolu: boolean;
  /** Nombre de lignes d'inventaire regroupées sous ce titre. */
  lots: number;

  // ── Les quantités, et tout ce qui les grève ─────────────────────────────
  quantiteInventaire: number;
  pretee: number;
  remeree: number;
  engagee: number;
  mouvements: number;
  /** CE QUI RESTE RÉELLEMENT CESSIBLE. C'est la colonne qu'on trie. */
  disponible: number;

  valorisation: number;
  /** Valorisation d'inventaire par titre. */
  prixInventaire: number;
  dateInventaire: string | null;
};

/**
 * Ce qu'un fonds rend : ses lignes, et la date de l'arrêté qui les porte.
 *
 * UN FONDS A LA FOIS. Les quinze portefeuilles se lisaient dans un seul appel,
 * qui demandait une minute pendant laquelle l'écran ne montrait rien — et,
 * passé la limite d'une action serveur, ne montrait jamais rien. L'écran les
 * demande donc un par un et remplit sa liste à mesure.
 */
export type TitresDunFonds = {
  fondsId: string;
  fondsNom: string;
  dateInventaire: string | null;
  titres: TitreDetenu[];
};

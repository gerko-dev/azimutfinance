// === Comptes de trésorerie : lecture du référentiel ===
//
// Le référentiel du module décrit DÉJÀ chaque compte : canal (banque ou mobile
// money), pays, établissement, nature (compte espèce ou compte dépositaire),
// type (courant, rémunéré, encaissement, décaissement) et taux éventuel. Ils
// sont saisis dans TreasuryFields, au moment où le compte entre au référentiel.
//
// Le point de trésorerie s'appuie donc sur ces attributs, et sur rien d'autre.
// Une table d'alias qui rabattrait « ORANGE CI ENCAISSEMENT » sur « OM CI » à
// coups de chaînes de caractères ferait double emploi avec ce que le gérant a
// déjà renseigné, et divergerait au premier compte ajouté sans elle.

import { normName } from "./portfolio-match";
import { lireAlias } from "./portfolio-security-schema";
import type { CustomSecurity } from "./portfolio-types";

/** Canal déclaré au référentiel. */
export type Canal = "banque" | "mobile_money";

/** Sens d'un compte de monnaie électronique.
 *
 *  « a_preciser » n'est pas « autre » : le premier dit que la fiche n'a jamais
 *  répondu à la question, le second que le gérant y a répondu « ni l'un ni
 *  l'autre ». Les confondre masquait seize comptes d'encaissement derrière un
 *  libellé qui laissait croire à un choix délibéré. */
export type Sens = "encaissement" | "decaissement" | "autre" | "a_preciser";

const LIBELLE_SENS: Record<Sens, string> = {
  encaissement: "encaissement",
  decaissement: "décaissement",
  autre: "autre",
  a_preciser: "à préciser",
};

/** Un établissement, tel qu'il ressort du référentiel. */
export type Etablissement = {
  /** Clef d'agrégation et intitulé de colonne : « UBA · Bénin ». */
  cle: string;
  /** Nom de l'établissement, seul. */
  nom: string;
  pays: string;
  canal: Canal;
  /** Vrai dès qu'un des comptes de l'établissement est un compte dépositaire. */
  depositaire: boolean;
  /** Sens du compte, POUR LE MOBILE MONEY UNIQUEMENT. Null pour une banque.
   *  Chez un opérateur, le compte d'encaissement et celui de décaissement sont
   *  deux poches distinctes : l'argent collecté auprès des porteurs n'est pas
   *  celui qui sert à les rembourser, et les confondre masquerait un compte de
   *  décaissement à sec derrière un encaissement bien garni. */
  sens: Sens | null;
};

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Établissement d'un compte du référentiel, ou null si le compte n'est pas
 * renseigné.
 *
 * Un compte de trésorerie sans établissement n'est pas rattachable : plutôt que
 * de le ranger sous un libellé inventé, on le remonte à part pour que le gérant
 * complète sa fiche au référentiel — c'est là que la correction doit se faire,
 * pas dans une table parallèle.
 */
export function etablissementDuCompte(titre: CustomSecurity | undefined): Etablissement | null {
  if (!titre) return null;
  const a = titre.attributes ?? {};
  const nom = txt(a.banque);
  if (!nom) return null;

  const pays = txt(a.pays);
  const canal: Canal = txt(a.canal) === "mobile_money" ? "mobile_money" : "banque";
  const brut = txt(a.typeCompte);
  const sens: Sens | null =
    canal === "mobile_money"
      ? brut === "encaissement" || brut === "decaissement" || brut === "autre"
        ? brut
        : "a_preciser"
      : null;

  // Le pays entre dans la clef : « UBA » en Côte d'Ivoire et « UBA » au Bénin
  // sont deux établissements, deux comptes, deux soldes. Les confondre
  // mélangerait la trésorerie de deux pays sur une seule colonne. Le SENS entre
  // aussi dans la clef, mais pour le seul mobile money : chez une banque, les
  // comptes d'encaissement et de décaissement puisent dans la même trésorerie.
  const base = pays ? `${nom} · ${pays}` : nom;
  return {
    cle: sens ? `${base} · ${sens}` : base,
    nom,
    pays,
    canal,
    depositaire: txt(a.natureCompte) === "depositaire",
    sens,
  };
}

/**
 * Ordonne les établissements : DÉPOSITAIRES d'abord, puis les comptes espèce
 * bancaires, puis le mobile money — chaque groupe trié par pays puis par nom.
 *
 * C'est l'ordre de lecture du trésorier : la liquidité mobilisable pour régler
 * une opération de marché est chez le dépositaire ; les comptes d'encaissement
 * et le mobile money servent la collecte auprès des porteurs.
 */
export function ordonnerEtablissements(liste: Etablissement[]): Etablissement[] {
  const rang = (e: Etablissement): number =>
    e.depositaire ? 0 : e.canal === "banque" ? 1 : 2;
  // Encaissement avant décaissement : c'est l'ordre du flux, l'argent entre
  // avant de sortir.
  const rangSens = (e: Etablissement): number =>
    e.sens === "encaissement" ? 0 : e.sens === "decaissement" ? 1 : e.sens === "autre" ? 2 : 3;
  return [...liste].sort(
    (a, b) =>
      rang(a) - rang(b) ||
      a.pays.localeCompare(b.pays, "fr") ||
      a.nom.localeCompare(b.nom, "fr") ||
      rangSens(a) - rangSens(b),
  );
}

/** Sens affiché sous le nom de l'établissement, ou chaîne vide pour une banque. */
export function libelleSens(e: Etablissement): string {
  return e.sens ? LIBELLE_SENS[e.sens] : "";
}

/** Libellé du groupe, pour la ligne de regroupement en tête de tableau. */
export function groupeEtablissement(e: Etablissement): string {
  if (e.depositaire) return "Comptes dépositaires";
  return e.canal === "banque" ? "Comptes espèce" : "Mobile Money";
}

/**
 * Index des fiches du référentiel par NOM EXACT normalisé.
 *
 * L'appariement par nom existe déjà à l'import (portfolio-match), mais son
 * résultat est FIGÉ dans la position : une ligne importée avant que la fiche
 * n'existe garde `customSecurityId` à null, et ce null ne se répare pas de
 * lui-même — c'est ce qui laissait six comptes « non rattachés » dans l'arrêté
 * de fin alors qu'ils étaient correctement liés dans l'arrêté intermédiaire.
 *
 * On refait donc la reconnaissance À LA LECTURE, avec la même clef et la même
 * normalisation. Rien d'approximatif : le nom doit correspondre exactement, aux
 * accents et à la ponctuation près.
 */
export function indexerParNom(fiches: CustomSecurity[]): Map<string, CustomSecurity> {
  const index = new Map<string, CustomSecurity>();
  for (const c of fiches) {
    for (const clef of [normName(c.name), normName(c.code), ...lireAlias(c.attributes)]) {
      // Le seuil de quatre caractères est celui de l'import : en deçà, un nom
      // est trop court pour désigner un compte sans ambiguïté.
      if (clef.length >= 4 && !index.has(clef)) index.set(clef, c);
    }
  }
  return index;
}

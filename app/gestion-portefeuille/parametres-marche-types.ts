// === Paramètres des opérations de marché ===
//
// Le délai de dénouement et les commissions de place sont des règles de
// MARCHÉ, pas des constantes de programme : elles changent par décision de la
// BRVM ou du DC/BR, et le gérant l'apprend avant nous. Les sortir du code lui
// rend la main sans attendre un déploiement.

import type { Instrument } from "./operations-marche-types";

/** Sur quoi se comptent les jours de dénouement. */
export type BaseJours = "ouvres" | "calendaires";

export const LIBELLES_BASE: Record<BaseJours, string> = {
  ouvres: "jours ouvrés",
  calendaires: "jours calendaires",
};

export type ConventionDenouement = {
  jours: number;
  base: BaseJours;
};

export type ParametresMarche = {
  /** Marché financier régional : actions et obligations cotées. */
  mfr: ConventionDenouement;
  /** Marché des titres publics. */
  mtp: ConventionDenouement;
  /** Commission perçue par la Bourse, en décimal (0,003 = 0,3 %). */
  tauxBrvm: number;
  /** Commission perçue par le dépositaire central, en décimal. Séparée de la
   *  précédente parce que les deux institutions révisent leurs tarifs
   *  indépendamment ; les additionner dans un seul champ interdisait de
   *  corriger l'une sans toucher l'autre. */
  tauxDcbr: number;
};

/**
 * Conventions de place en vigueur, qui servent tant que rien n'est configuré.
 *
 * J+2 ouvrés sur le marché financier, dénouement le jour même sur le marché
 * des titres publics : c'est ce que fait le classeur de gestion, et c'est
 * vérifié contre ses propres dates.
 */
export const PARAMETRES_DEFAUT: ParametresMarche = {
  mfr: { jours: 2, base: "ouvres" },
  mtp: { jours: 0, base: "calendaires" },
  tauxBrvm: 0.003,
  tauxDcbr: 0,
};

/** Ligne telle que Supabase la renvoie — `numeric` en chaîne. */
export type LigneParametresMarche = {
  denouement_mfr_jours: number | string;
  denouement_mfr_base: string;
  denouement_mtp_jours: number | string;
  denouement_mtp_base: string;
  taux_brvm: number | string;
  taux_dcbr: number | string;
};

const nb = (v: number | string | null | undefined, defaut: number): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : defaut;
};

const base = (v: string | null | undefined, defaut: BaseJours): BaseJours =>
  v === "ouvres" || v === "calendaires" ? v : defaut;

export function versParametres(l: LigneParametresMarche | null): ParametresMarche {
  if (!l) return PARAMETRES_DEFAUT;
  return {
    mfr: {
      jours: nb(l.denouement_mfr_jours, PARAMETRES_DEFAUT.mfr.jours),
      base: base(l.denouement_mfr_base, PARAMETRES_DEFAUT.mfr.base),
    },
    mtp: {
      jours: nb(l.denouement_mtp_jours, PARAMETRES_DEFAUT.mtp.jours),
      base: base(l.denouement_mtp_base, PARAMETRES_DEFAUT.mtp.base),
    },
    tauxBrvm: nb(l.taux_brvm, PARAMETRES_DEFAUT.tauxBrvm),
    tauxDcbr: nb(l.taux_dcbr, PARAMETRES_DEFAUT.tauxDcbr),
  };
}

/**
 * Convention applicable à un instrument.
 *
 * Les actions ET les obligations cotées se traitent sur le marché financier
 * régional : elles partagent donc le même délai. Seuls les titres publics
 * relèvent de l'autre convention.
 */
export function conventionDe(
  p: ParametresMarche,
  instrument: Instrument,
): ConventionDenouement {
  return instrument === "mtp" ? p.mtp : p.mfr;
}

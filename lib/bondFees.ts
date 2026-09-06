/**
 * Commissions de marche sur une negociation BRVM.
 *
 * Source du bareme : "Calculs commissions BRVM - DCBR.xlsx", a la racine du
 * depot. Les taux sont reglementes — ils ne se negocient pas, contrairement au
 * courtage de la SGI.
 *
 * Le bareme est MARGINAL et non a palier unique : la fraction de l'operation
 * situee sous le seuil d'un milliard est commissionnee au premier taux, le
 * seul excedent au second. Appliquer le taux de la tranche haute a la totalite
 * d'une operation de 1,5 Md sous-estimerait les frais de pres de 40 %.
 *
 * L'assiette est le MONTANT NEGOCIE, coupon couru inclus.
 */

export const COMMISSION_SEUIL = 1_000_000_000;

/** Taux BRVM, exprimes en fraction (0.0005 = 0,05 %). */
export const TAUX_BRVM = { sousSeuil: 0.0005, auDela: 0.000375 };

/** Taux DC/BR (depositaire central / banque de reglement). */
export const TAUX_DCBR = { sousSeuil: 0.001, auDela: 0.0005 };

export type CommissionsMarche = {
  /** Fraction de l'operation sous le seuil. */
  t1: number;
  /** Fraction au-dela du seuil. */
  t2: number;
  brvmT1: number;
  brvmT2: number;
  brvm: number;
  dcbrT1: number;
  dcbrT2: number;
  dcbr: number;
  total: number;
};

export function commissionsMarche(montantNegocie: number): CommissionsMarche {
  const m = Number.isFinite(montantNegocie) ? Math.max(0, montantNegocie) : 0;
  const t1 = Math.min(m, COMMISSION_SEUIL);
  const t2 = Math.max(0, m - COMMISSION_SEUIL);

  const brvmT1 = t1 * TAUX_BRVM.sousSeuil;
  const brvmT2 = t2 * TAUX_BRVM.auDela;
  const dcbrT1 = t1 * TAUX_DCBR.sousSeuil;
  const dcbrT2 = t2 * TAUX_DCBR.auDela;

  return {
    t1,
    t2,
    brvmT1,
    brvmT2,
    brvm: brvmT1 + brvmT2,
    dcbrT1,
    dcbrT2,
    dcbr: dcbrT1 + dcbrT2,
    total: brvmT1 + brvmT2 + dcbrT1 + dcbrT2,
  };
}

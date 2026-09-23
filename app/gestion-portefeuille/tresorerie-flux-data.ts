import "server-only";

// === Flux saisis et spots : lecture et agrégation ===
//
// Deux lectures, une agrégation, et la même forme de sortie que
// `agregerParPoste` — poste, puis compte — pour que le point de trésorerie les
// verse dans son tableau sans rien savoir de leur origine.

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  montantDenouementSpot,
  posteDenouementSpot,
  POSTE_NIVELLEMENT_CREDIT,
  POSTE_NIVELLEMENT_DEBIT,
  POSTES_FLUX_VALIDES,
  type FluxManuel,
  type Nivellement,
  type PosteFlux,
  type SensSpot,
  type Spot,
} from "./tresorerie-flux-types";

const nb = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type LigneFlux = {
  id: string;
  poste: string;
  compte: string;
  date_flux: string;
  montant: number | string;
  libelle: string | null;
};

type LigneSpot = {
  id: string;
  sens: string;
  contrepartie: string | null;
  compte: string;
  montant: number | string;
  taux: number | string;
  date_valeur: string;
  date_echeance: string;
  date_denouement: string | null;
  note: string | null;
};

/** Flux saisis d'un fonds, du plus récent au plus ancien. */
export const loadFluxManuels = cache(async (fundId: string): Promise<FluxManuel[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("fund_treasury_flows")
    .select("id, poste, compte, date_flux, montant, libelle")
    .eq("fund_id", fundId)
    .order("date_flux", { ascending: false });

  // Une erreur rendue comme liste vide se lirait « aucun flux », ce qui est
  // indiscernable d'un fonds sans flux. On trace.
  if (error) {
    console.error("[gestion-portefeuille] loadFluxManuels:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as LigneFlux[])
    // Un poste inconnu du gabarit n'a aucune ligne où tomber : il viendrait
    // d'un renommage, et l'ignorer vaut mieux que de le verser au hasard.
    .filter((l) => POSTES_FLUX_VALIDES.has(l.poste))
    .map((l) => ({
      id: l.id,
      poste: l.poste as PosteFlux,
      compte: l.compte,
      dateFlux: l.date_flux,
      montant: nb(l.montant),
      libelle: l.libelle ?? "",
    }));
});

/** Spots d'un fonds, échéance la plus proche d'abord. */
export const loadSpots = cache(async (fundId: string): Promise<Spot[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("fund_treasury_spots")
    .select(
      "id, sens, contrepartie, compte, montant, taux, date_valeur, date_echeance, date_denouement, note",
    )
    .eq("fund_id", fundId)
    .order("date_echeance", { ascending: true });

  if (error) {
    console.error("[gestion-portefeuille] loadSpots:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as LigneSpot[]).map((l) => ({
    id: l.id,
    sens: (l.sens === "emprunt" ? "emprunt" : "placement") as SensSpot,
    contrepartie: l.contrepartie ?? "",
    compte: l.compte,
    montant: nb(l.montant),
    taux: nb(l.taux),
    dateValeur: l.date_valeur,
    dateEcheance: l.date_echeance,
    dateDenouement: l.date_denouement,
    note: l.note ?? "",
  }));
});

/**
 * Montants par POSTE puis par COMPTE, à une date d'arrêté.
 *
 * Même forme que `agregerParPoste` : le point les verse dans son tableau sans
 * avoir à distinguer ce qui vient d'un ordre de bourse de ce qui vient d'une
 * saisie.
 *
 * LA DATE DÉCIDE. Un flux daté après l'arrêté n'a pas encore eu lieu — le
 * trésorier demande de quoi il disposera À TELLE DATE, pas un jour plus tard.
 */
export function agregerFluxSaisis(
  flux: FluxManuel[],
  spots: Spot[],
  dateArrete: string | null,
): Map<string, Map<string, number>> {
  const parPoste = new Map<string, Map<string, number>>();

  const ajouter = (poste: string, compte: string, montant: number) => {
    if (!poste || !compte || montant === 0) return;
    let parCompte = parPoste.get(poste);
    if (!parCompte) {
      parCompte = new Map<string, number>();
      parPoste.set(poste, parCompte);
    }
    parCompte.set(compte, (parCompte.get(compte) ?? 0) + montant);
  };

  for (const f of flux) {
    if (dateArrete && f.dateFlux > dateArrete) continue;
    ajouter(f.poste, f.compte, f.montant);
  }

  for (const s of spots) {
    // DÉNOUÉ AVANT L'ARRÊTÉ : le cash est revenu, le solde bancaire saisi le
    // contient déjà. L'y laisser le compterait deux fois.
    if (s.dateDenouement && (!dateArrete || s.dateDenouement <= dateArrete)) continue;
    // Pas encore mis en place : rien n'a bougé, et rien ne reviendra.
    if (dateArrete && s.dateValeur > dateArrete) continue;
    // Échéance au-delà de l'horizon : le flux viendra, mais pas d'ici là.
    if (dateArrete && s.dateEcheance > dateArrete) continue;
    ajouter(posteDenouementSpot(s.sens), s.compte, montantDenouementSpot(s));
  }

  return parPoste;
}

/**
 * Spots dont l'échéance tombe APRÈS l'arrêté : ils ne comptent pas encore,
 * mais ils sont certains. Le point les affiche à part, comme il le fait des
 * rémérés à venir — un flux à sept chiffres ne doit pas surgir le jour où il
 * devient exigible.
 */
export function spotsAVenir(
  spots: Spot[],
  dateArrete: string | null,
): { libelle: string; dateEcheance: string; montant: number; sens: SensSpot }[] {
  return spots
    .filter((s) => !s.dateDenouement)
    .filter((s) => dateArrete !== null && s.dateEcheance > dateArrete)
    .map((s) => ({
      libelle: `${s.sens === "placement" ? "Placement" : "Emprunt"} ${
        s.contrepartie || "sans contrepartie"
      } · ${s.compte}`,
      dateEcheance: s.dateEcheance,
      montant: montantDenouementSpot(s),
      sens: s.sens,
    }))
    .sort((a, b) => a.dateEcheance.localeCompare(b.dateEcheance));
}

type LigneNivellement = {
  id: string;
  compte_source: string;
  compte_destination: string;
  montant: number | string;
  date_nivellement: string;
  rapproche_debit: string | null;
  rapproche_credit: string | null;
  libelle: string | null;
};

/** Nivellements d'un fonds, du plus récent au plus ancien. */
export const loadNivellements = cache(async (fundId: string): Promise<Nivellement[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("fund_treasury_transfers")
    .select(
      "id, compte_source, compte_destination, montant, date_nivellement, rapproche_debit, rapproche_credit, libelle",
    )
    .eq("fund_id", fundId)
    .order("date_nivellement", { ascending: false });

  if (error) {
    console.error("[gestion-portefeuille] loadNivellements:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as LigneNivellement[]).map((l) => ({
    id: l.id,
    compteSource: l.compte_source,
    compteDestination: l.compte_destination,
    montant: nb(l.montant),
    dateNivellement: l.date_nivellement,
    rapprocheDebit: l.rapproche_debit,
    rapprocheCredit: l.rapproche_credit,
    libelle: l.libelle ?? "",
  }));
});

/**
 * Les DEUX JAMBES d'un nivellement, versées dans les postes « autres ».
 *
 * Chacune sort du point dès que le relevé de SA banque la porte — un
 * rapprochement est un lettrage, pas une annulation : le solde bancaire saisi
 * contient déjà le mouvement, et l'y laisser le compterait deux fois.
 *
 * Tant que les deux jambes sont là, elles se compensent exactement au total :
 * le nivellement ne déplace pas d'argent hors du fonds. Quand une seule reste,
 * le total n'est plus neutre — et c'est juste : l'argent est en transit, sorti
 * d'un compte sans être arrivé dans l'autre.
 */
export function agregerNivellements(
  nivellements: Nivellement[],
  dateArrete: string | null,
): Map<string, Map<string, number>> {
  const parPoste = new Map<string, Map<string, number>>();

  const ajouter = (poste: string, compte: string, montant: number) => {
    if (!poste || !compte || montant === 0) return;
    let parCompte = parPoste.get(poste);
    if (!parCompte) {
      parCompte = new Map<string, number>();
      parPoste.set(poste, parCompte);
    }
    parCompte.set(compte, (parCompte.get(compte) ?? 0) + montant);
  };

  /** Rapproché à la date d'arrêté ? Un rapprochement POSTÉRIEUR ne compte pas :
   *  à cette date-là, le relevé ne le portait pas encore. */
  const lettre = (d: string | null) => d !== null && (!dateArrete || d <= dateArrete);

  for (const n of nivellements) {
    // Pas encore ordonné à cette date : rien à annoncer.
    if (dateArrete && n.dateNivellement > dateArrete) continue;
    if (!lettre(n.rapprocheDebit)) {
      ajouter(POSTE_NIVELLEMENT_DEBIT, n.compteSource, n.montant);
    }
    if (!lettre(n.rapprocheCredit)) {
      ajouter(POSTE_NIVELLEMENT_CREDIT, n.compteDestination, n.montant);
    }
  }

  return parPoste;
}

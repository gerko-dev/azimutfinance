"use server";

// === Flux saisis et spots — écritures ===
//
// Même garde que les autres écritures du module : session, niveau 1, propriété
// du fonds. Elle vit dans `operations-marche-garde` depuis qu'un second
// fichier d'actions en a eu besoin — deux copies d'un contrôle de sécurité
// divergent toujours.

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/admin/types";

import { autoriser } from "./operations-marche-garde";
import {
  POSTES_FLUX_VALIDES,
  type JambeNivellement,
  type SaisieFluxManuel,
  type SaisieNivellement,
  type SaisieSpot,
} from "./tresorerie-flux-types";

const EST_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Les deux écrans du module qui affichent le point. */
function rafraichir(fundId: string) {
  revalidatePath("/gestion-portefeuille/tresorerie");
  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
}

// ── Flux saisis ────────────────────────────────────────────────────────────

function validerFlux(f: SaisieFluxManuel): string | null {
  if (!POSTES_FLUX_VALIDES.has(f.poste)) return "Choisis la ligne à alimenter.";
  if (!f.compte.trim())
    return "Choisis le compte : sans lui, le montant n'entre dans aucune colonne du point.";
  if (!EST_DATE.test(f.dateFlux)) return "Renseigne la date du flux.";
  // LE MONTANT RESTE POSITIF : c'est le poste qui porte le sens. Un montant
  // négatif permettrait d'écrire un encaissement dans la ligne des
  // décaissements, et le tableau aurait raison contre le bon sens.
  if (!(f.montant > 0)) return "Le montant doit être strictement positif.";
  return null;
}

export async function enregistrerFluxManuelAction(
  fundId: string,
  /** Null pour une création, l'identifiant pour une correction. */
  fluxId: string | null,
  saisie: SaisieFluxManuel,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const invalide = validerFlux(saisie);
  if (invalide) return { ok: false, error: invalide };

  const ligne = {
    poste: saisie.poste,
    compte: saisie.compte.trim(),
    date_flux: saisie.dateFlux,
    montant: saisie.montant,
    libelle: saisie.libelle.trim(),
  };

  if (fluxId) {
    const { error } = await supabase
      .from("fund_treasury_flows")
      .update(ligne)
      .eq("id", fluxId)
      .eq("fund_id", fundId)
      .eq("owner_id", userId);
    if (error) return { ok: false, error: error.message };
    rafraichir(fundId);
    return { ok: true, data: { id: fluxId } };
  }

  const { data, error } = await supabase
    .from("fund_treasury_flows")
    .insert({ owner_id: userId, fund_id: fundId, ...ligne })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function supprimerFluxManuelAction(
  fundId: string,
  fluxId: string,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const { error } = await supabase
    .from("fund_treasury_flows")
    .delete()
    .eq("id", fluxId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { id: fluxId } };
}

// ── Spots ──────────────────────────────────────────────────────────────────

function validerSpot(s: SaisieSpot): string | null {
  if (s.sens !== "placement" && s.sens !== "emprunt")
    return "Choisis le sens : placement ou emprunt.";
  if (!s.compte.trim())
    return "Choisis le compte : c'est par lui que le flux entre dans le tableau.";
  if (!(s.montant > 0)) return "Le montant doit être strictement positif.";
  if (s.taux < 0 || s.taux > 1)
    return "Le taux se saisit en pourcentage, entre 0 et 100.";
  if (!EST_DATE.test(s.dateValeur)) return "Renseigne la date de valeur.";
  if (!EST_DATE.test(s.dateEcheance)) return "Renseigne la date d'échéance.";
  // Un spot qui s'achève avant de commencer produirait un intérêt négatif, et
  // donc un remboursement inférieur au principal.
  if (s.dateEcheance < s.dateValeur)
    return "L'échéance ne peut pas précéder la date de valeur.";
  return null;
}

export async function enregistrerSpotAction(
  fundId: string,
  spotId: string | null,
  saisie: SaisieSpot,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const invalide = validerSpot(saisie);
  if (invalide) return { ok: false, error: invalide };

  const ligne = {
    sens: saisie.sens,
    contrepartie: saisie.contrepartie.trim(),
    compte: saisie.compte.trim(),
    montant: saisie.montant,
    taux: saisie.taux,
    date_valeur: saisie.dateValeur,
    date_echeance: saisie.dateEcheance,
    note: saisie.note.trim(),
  };

  if (spotId) {
    const { error } = await supabase
      .from("fund_treasury_spots")
      .update(ligne)
      .eq("id", spotId)
      .eq("fund_id", fundId)
      .eq("owner_id", userId);
    if (error) return { ok: false, error: error.message };
    rafraichir(fundId);
    return { ok: true, data: { id: spotId } };
  }

  const { data, error } = await supabase
    .from("fund_treasury_spots")
    .insert({ owner_id: userId, fund_id: fundId, ...ligne })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { id: (data as { id: string }).id } };
}

/**
 * DÉNOUE un spot : le cash est revenu, ou il est sorti.
 *
 * La date ne se saisit pas au formulaire — elle n'y serait qu'une promesse.
 * Elle se pose d'un bouton sur la ligne, le jour où le dénouement a lieu, et
 * c'est elle qui fait basculer le statut : un spot est dénoué parce qu'il a
 * une date de dénouement, jamais l'inverse. Même règle que la reprise d'un
 * prêt de titres.
 *
 * `null` annule le dénouement, pour corriger une fausse manœuvre.
 */
export async function denouerSpotAction(
  fundId: string,
  spotId: string,
  dateDenouement: string | null,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  if (dateDenouement !== null && !EST_DATE.test(dateDenouement))
    return { ok: false, error: "Renseigne la date de dénouement." };

  const { error } = await supabase
    .from("fund_treasury_spots")
    .update({ date_denouement: dateDenouement })
    .eq("id", spotId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { id: spotId } };
}

export async function supprimerSpotAction(
  fundId: string,
  spotId: string,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const { error } = await supabase
    .from("fund_treasury_spots")
    .delete()
    .eq("id", spotId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { id: spotId } };
}

// ── Nivellements ───────────────────────────────────────────────────────────

function validerNivellement(n: SaisieNivellement): string | null {
  if (!n.compteSource.trim()) return "Choisis le compte qui envoie.";
  if (!n.compteDestination.trim()) return "Choisis le compte qui reçoit.";
  // Un nivellement d'un compte vers lui-même ne déplace rien, et ses deux
  // jambes s'annuleraient sur la même colonne : la ligne existerait sans que
  // le tableau ne bouge, ce qui est le pire des deux mondes.
  if (n.compteSource.trim() === n.compteDestination.trim())
    return "Le compte qui envoie et celui qui reçoit doivent être différents.";
  if (!(n.montant > 0)) return "Le montant doit être strictement positif.";
  if (!EST_DATE.test(n.dateNivellement)) return "Renseigne la date du nivellement.";
  return null;
}

export async function enregistrerNivellementAction(
  fundId: string,
  nivellementId: string | null,
  saisie: SaisieNivellement,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const invalide = validerNivellement(saisie);
  if (invalide) return { ok: false, error: invalide };

  const ligne = {
    compte_source: saisie.compteSource.trim(),
    compte_destination: saisie.compteDestination.trim(),
    montant: saisie.montant,
    date_nivellement: saisie.dateNivellement,
    libelle: saisie.libelle.trim(),
  };

  if (nivellementId) {
    const { error } = await supabase
      .from("fund_treasury_transfers")
      .update(ligne)
      .eq("id", nivellementId)
      .eq("fund_id", fundId)
      .eq("owner_id", userId);
    if (error) return { ok: false, error: error.message };
    rafraichir(fundId);
    return { ok: true, data: { id: nivellementId } };
  }

  const { data, error } = await supabase
    .from("fund_treasury_transfers")
    .insert({ owner_id: userId, fund_id: fundId, ...ligne })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { id: (data as { id: string }).id } };
}

/**
 * RAPPROCHE UNE JAMBE d'un nivellement : le relevé de cette banque-là porte
 * désormais le mouvement.
 *
 * Une jambe à la fois, parce que le débit et le crédit ne tombent pas le même
 * jour. Rapprocher les deux d'un coup aurait obligé à attendre l'arrivée pour
 * constater le départ, et le point aurait montré de l'argent encore présent
 * sur un compte qu'il avait quitté.
 *
 * C'est un LETTRAGE, pas une annulation : le solde bancaire saisi contient
 * déjà le mouvement, et l'y laisser le compterait deux fois. `null` défait le
 * rapprochement, pour corriger une fausse manœuvre.
 */
export async function rapprocherNivellementAction(
  fundId: string,
  nivellementId: string,
  jambe: JambeNivellement,
  date: string | null,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  if (jambe !== "debit" && jambe !== "credit")
    return { ok: false, error: "Jambe inconnue." };
  if (date !== null && !EST_DATE.test(date))
    return { ok: false, error: "Renseigne la date du rapprochement." };

  const colonne = jambe === "debit" ? "rapproche_debit" : "rapproche_credit";
  const { error } = await supabase
    .from("fund_treasury_transfers")
    .update({ [colonne]: date })
    .eq("id", nivellementId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { id: nivellementId } };
}

export async function supprimerNivellementAction(
  fundId: string,
  nivellementId: string,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const { error } = await supabase
    .from("fund_treasury_transfers")
    .delete()
    .eq("id", nivellementId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { id: nivellementId } };
}

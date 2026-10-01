"use server";

// === Souscriptions et rachats de parts : ecritures ===
//
// Meme garde que les autres ecritures du module : session, niveau 1,
// propriete du fonds.

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import { loadDernieresVl } from "./nav-data";
import { construirePointTresorerie } from "./tresorerie-data";
import { cibleAttendue, type SaisieFluxPart } from "./parts-types";
import {
  comptePrincipal,
  nettoyerVentilation,
  validerVentilation,
} from "./ventilation-reglement";

const EST_DATE = /^\d{4}-\d{2}-\d{2}$/;

type ClientServeur = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type Acces = { erreur: string } | { supabase: ClientServeur; userId: string };

async function autoriser(fundId: string): Promise<Acces> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: "Tu dois être connecté." };
  if (!(await estNiveau1())) return { erreur: MSG_NIVEAU1 };

  const { data: fund } = await supabase
    .from("managed_funds")
    .select("id")
    .eq("id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!fund) return { erreur: "Fonds introuvable." };
  return { supabase, userId: user.id };
}

/**
 * Comptes de reglement d'un fonds — les COLONNES de son point de tresorerie.
 *
 * On passe par `construirePointTresorerie` plutot que de refaire le calcul :
 * les clefs doivent etre IDENTIQUES des deux cotes, sinon le flux se regle sur
 * un compte qui n'existe pas dans le tableau et le montant disparait.
 */
export async function comptesPartsAction(
  fundId: string,
): Promise<ActionResult<{ cle: string; nom: string }[]>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };

  const point = await construirePointTresorerie(fundId, "");
  if (!point)
    return {
      ok: false,
      error: "Ce fonds n'a pas encore d'inventaire : ses comptes sont inconnus.",
    };
  return {
    ok: true,
    data: point.etablissements.map((e) => ({ cle: e.cle, nom: e.nom })),
  };
}

/**
 * VL PUBLIEES du fonds, la plus recente d'abord.
 *
 * La VL de souscription se CHOISIT parmi elles, jamais ne se tape : une date
 * sans VL ne convertit aucun montant en parts, et une VL retapee a la main
 * finit par diverger de celle de l'historique — donc du reporting.
 *
 * On plafonne a deux cents : un fonds valorise quotidiennement en accumule
 * plusieurs milliers, et une liste deroulante de plusieurs milliers d'entrees
 * ne se parcourt pas. Une souscription se rattache a une valorisation recente.
 */
export async function vlDisponiblesAction(
  fundId: string,
): Promise<ActionResult<{ date: string; vl: number }[]>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };

  // Deux cents valeurs, la plus recente d'abord, en UN aller-retour : c'est
  // exactement ce que la liste deroulante propose. L'historique complet
  // rapatriait deux mille points pour en afficher deux cents.
  const points = await loadDernieresVl(fundId, 200);
  const vls = points
    .flatMap((p) => (p.vl != null && p.vl > 0 ? [{ date: p.date, vl: p.vl }] : []));
  return { ok: true, data: vls };
}

/** Controles PARTAGES par la creation et la modification. */
function valider(saisie: SaisieFluxPart): string | null {
  if (!EST_DATE.test(saisie.dateOperation)) return "Renseigne la date de l'ordre.";
  if (!(saisie.montant > 0)) return "Le montant doit être strictement positif.";
  // Les frais sont des DÉCIMAUX. Un 2 saisi pour 2 % multiplierait le droit
  // d'entrée par cinquante : on refuse plutôt que d'avaler.
  if (!(saisie.tauxFrais >= 0 && saisie.tauxFrais <= 1))
    return "Les frais se saisissent en pourcentage, entre 0 et 100.";
  if (!saisie.investisseur.trim()) return "Renseigne le client.";
  // La VL vient de l'historique : les deux champs vont ensemble, ou aucun.
  // Une date sans VL ne convertirait aucun montant en parts.
  if ((saisie.dateVl === null) !== (saisie.vl === null))
    return "La VL de souscription et sa date vont ensemble.";
  // UNE SOUSCRIPTION DE CLIENT SENSIBLE PORTE UN ENGAGEMENT. Le laisser vide,
  // c'est ne plus savoir six mois plus tard ce qui avait ete promis a qui.
  if (saisie.dateFin !== null && !EST_DATE.test(saisie.dateFin))
    return "La date de fin est mal formée.";
  if (cibleAttendue(saisie)) {
    if (saisie.performanceCible === null)
      return "Renseigne la performance cible promise à ce client sensible.";
    if (!(saisie.performanceCible >= 0 && saisie.performanceCible <= 1))
      return "La performance cible se saisit en pourcentage, entre 0 et 100.";
  }
  // LA VENTILATION FAIT FOI, le compte principal s'en déduit. La somme doit
  // tomber juste : le montant du flux est connu d'avance, et une répartition
  // qui ne fait pas le compte est une faute de frappe — l'accepter laisserait
  // disparaître la différence sans que rien ne la signale.
  const invalideVentilation = validerVentilation(
    nettoyerVentilation(saisie.comptes),
    saisie.montant,
  );
  if (invalideVentilation) return invalideVentilation;
  // Le bureau ne concerne QUE les souscriptions : le classeur ne ventile pas
  // les rachats, et un rachat ne se collecte pas.
  if (saisie.sens === "souscription" && !saisie.bureau)
    return "Choisis le bureau qui a collecté la souscription.";
  return null;
}

function valeurs(saisie: SaisieFluxPart) {
  return {
    date_operation: saisie.dateOperation,
    sens: saisie.sens,
    bureau: saisie.sens === "souscription" ? saisie.bureau : null,
    certitude: saisie.certitude,
    type_client: saisie.typeClient,
    investisseur: saisie.investisseur.trim(),
    montant: saisie.montant,
    taux_frais: saisie.tauxFrais,
    date_vl: saisie.dateVl,
    vl: saisie.vl,
    // La cible ne survit pas a un changement de sens ou de type de client :
    // un rachat ne promet rien, un autre client n'a pas de cible negociee.
    performance_cible: cibleAttendue(saisie) ? saisie.performanceCible : null,
    // FACULTATIVE, mais liee au meme cas : une echeance ne se convient qu'avec
    // un client sensible, et elle ne survit pas a un changement de sens.
    date_fin: cibleAttendue(saisie) ? saisie.dateFin : null,
    // LE COMPTE PRINCIPAL SE DEDUIT, il ne se saisit plus : c'est celui de la
    // première ligne de la ventilation. Le laisser saisir à part aurait permis
    // qu'il désigne une banque absente de la répartition.
    compte_reglement: comptePrincipal(nettoyerVentilation(saisie.comptes)),
    note: saisie.note.trim(),
  };
}

/**
 * Réécrit la ventilation d'un flux, en entier.
 *
 * EN ENTIER, ET PAS LIGNE A LIGNE. Une ventilation est un tout : deux lignes
 * qui deviennent trois, un compte remplacé par un autre, un montant déplacé de
 * l'un vers l'autre — rapprocher l'ancienne de la nouvelle pour n'écrire que
 * la différence aurait demandé un rang stable que rien ne garantit, pour
 * économiser trois lignes d'écriture.
 *
 * Une ventilation à UN SEUL compte n'est pas enregistrée : la table mère porte
 * déjà ce compte, et stocker une ligne qui n'ajoute rien obligerait à la tenir
 * d'accord avec elle.
 */
async function enregistrerVentilation(
  supabase: ClientServeur,
  userId: string,
  fluxId: string,
  saisie: SaisieFluxPart,
): Promise<string | null> {
  const lignes = nettoyerVentilation(saisie.comptes);

  const { error: erreurPurge } = await supabase
    .from("fund_unit_flow_accounts")
    .delete()
    .eq("flow_id", fluxId)
    .eq("owner_id", userId);
  if (erreurPurge) return erreurPurge.message;

  if (lignes.length < 2) return null;

  const { error } = await supabase.from("fund_unit_flow_accounts").insert(
    lignes.map((l, i) => ({
      flow_id: fluxId,
      owner_id: userId,
      rang: i,
      compte: l.compte,
      montant: l.montant,
    })),
  );
  return error ? error.message : null;
}

function rafraichir(fundId: string) {
  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  revalidatePath("/gestion-portefeuille/souscriptions-rachats");
  revalidatePath("/gestion-portefeuille/tresorerie");
}

export async function enregistrerFluxPartAction(
  fundId: string,
  saisie: SaisieFluxPart,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const invalide = valider(saisie);
  if (invalide) return { ok: false, error: invalide };

  const { data, error } = await supabase
    .from("fund_unit_flows")
    .insert({ owner_id: userId, fund_id: fundId, ...valeurs(saisie) })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const id = (data as { id: string }).id;
  const erreurVentilation = await enregistrerVentilation(supabase, userId, id, saisie);
  if (erreurVentilation) {
    // ON DEFAIT LE FLUX PLUTOT QUE DE LE LAISSER A MOITIE NE. Un rachat
    // enregistré sans sa répartition poserait tout son montant sur une seule
    // colonne — exactement ce que le gérant cherchait à éviter en la saisissant.
    const { error: erreurRetrait } = await supabase
      .from("fund_unit_flows")
      .delete()
      .eq("id", id)
      .eq("owner_id", userId);
    if (erreurRetrait) {
      return {
        ok: false,
        error: `${erreurVentilation} — et le flux n'a pas pu être retiré (${erreurRetrait.message}). Corrige sa répartition à la main.`,
      };
    }
    return { ok: false, error: erreurVentilation };
  }

  rafraichir(fundId);
  return { ok: true, data: { id } };
}

export async function modifierFluxPartAction(
  fundId: string,
  fluxId: string,
  saisie: SaisieFluxPart,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const invalide = valider(saisie);
  if (invalide) return { ok: false, error: invalide };

  const { error } = await supabase
    .from("fund_unit_flows")
    .update(valeurs(saisie))
    .eq("id", fluxId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  const erreurVentilation = await enregistrerVentilation(supabase, userId, fluxId, saisie);
  if (erreurVentilation) return { ok: false, error: erreurVentilation };

  rafraichir(fundId);
  return { ok: true, data: { id: fluxId } };
}

/**
 * REGLE un flux, a une date qu'on renseigne.
 *
 * La date de reglement ne se promet pas a la saisie : un ordre recu n'a pas
 * encore de date de reglement, elle s'apprend quand le mouvement passe. La
 * saisir d'avance, c'etait faire sortir le flux du point a un jour choisi
 * arbitrairement.
 *
 * Une fois posee, le solde bancaire saisi contient le mouvement et le flux
 * sort du point : lettrage, pas annulation — la ligne reste. `null` le defait.
 */
export async function reglerFluxPartAction(
  fundId: string,
  fluxId: string,
  dateReglement: string | null,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  if (dateReglement !== null && !EST_DATE.test(dateReglement))
    return { ok: false, error: "Renseigne la date de règlement." };

  const { error } = await supabase
    .from("fund_unit_flows")
    .update({ date_reglement: dateReglement })
    .eq("id", fluxId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { id: fluxId } };
}

export async function supprimerFluxPartAction(
  fundId: string,
  fluxId: string,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const { error } = await supabase
    .from("fund_unit_flows")
    .delete()
    .eq("id", fluxId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { id: fluxId } };
}

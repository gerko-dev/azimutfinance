"use server";

// === Opérations de marché — saisie ===
//
// Même garde que les autres écritures du module : session, niveau 1, propriété
// du fonds. Une opération est une ligne de plus, jamais un remplacement : on
// n'empile pas deux fois la même négociation, mais on n'en fusionne pas deux
// non plus — deux achats du même titre le même jour à deux prix différents
// sont deux opérations, et le classeur les tient comme telles.

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import { construirePointTresorerie } from "./tresorerie-data";
import {
  caracteristiques,
  etatsMtp,
  titresMfr,
  titresMtp,
  type CaracteristiquesTitre,
  type OptionTitre,
} from "./operations-marche-titres";
import {
  DESCRIPTIONS,
  dateDenouement,
  type DescriptionOperation,
  type Instrument,
  type SaisieOperation,
} from "./operations-marche-types";

const EST_DATE = /^\d{4}-\d{2}-\d{2}$/;

const DESCRIPTIONS_VALIDES = new Set<string>(DESCRIPTIONS.map((d) => d.valeur));
const INSTRUMENTS_VALIDES = new Set<string>(["actions", "obligations", "mtp"]);

type ClientServeur = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// Union DISCRIMINEE, et type ecrit a la main : laisse a l'inference, le type
// de retour fusionnait les deux branches et `acces.erreur` ressortait
// `string | undefined` apres le test `in`.
type Acces =
  | { erreur: string }
  | { supabase: ClientServeur; userId: string };

/** Vérifie la session, le niveau et la propriété du fonds. */
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
 * Comptes de règlement d'un fonds — les COLONNES de son point de trésorerie.
 *
 * Chargé à la demande, quand le gérant choisit le fonds : l'écran est
 * interfonds, et précharger les comptes de tous les fonds ferait autant de
 * lectures d'inventaire pour n'en servir qu'une.
 *
 * On passe par `construirePointTresorerie` plutôt que de refaire le calcul des
 * colonnes : les clefs doivent être IDENTIQUES des deux côtés, sinon
 * l'opération se règle sur un compte qui n'existe pas dans le tableau. Mieux
 * vaut une lecture plus lourde qu'une duplication qui divergera.
 */
export async function comptesReglementAction(
  fundId: string,
): Promise<ActionResult<{ cle: string; nom: string; pays: string; sens: string }[]>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };

  const point = await construirePointTresorerie(fundId, "");
  if (!point)
    return {
      ok: false,
      error:
        "Ce fonds n'a pas encore d'inventaire : ses comptes de trésorerie sont inconnus.",
    };
  return {
    ok: true,
    data: point.etablissements.map((e) => ({
      cle: e.cle,
      nom: e.nom,
      pays: e.pays,
      sens: e.sens,
    })),
  };
}

/**
 * Titres proposables, selon le marche.
 *
 * MFR : actions et obligations COTEES du referentiel BRVM. MTP : titres
 * publics de l'Etat choisi. Ces listes se lisent dans les CSV du site, donc au
 * serveur ; elles ne sont pas assez volumineuses pour justifier une recherche
 * paginee, et une liste complete se filtre au clavier dans le navigateur.
 *
 * Pas de garde sur un fonds ici : ce sont des donnees de marche, publiques sur
 * le portail. Le niveau 1 du layout suffit.
 */
export async function listerTitresAction(
  marche: "mfr" | "mtp",
  pays: string,
): Promise<
  ActionResult<{ etats: { code: string; nom: string }[]; titres: OptionTitre[] }>
> {
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };
  if (marche === "mfr") return { ok: true, data: { etats: [], titres: titresMfr() } };
  const etats = etatsMtp();
  const choisi = pays || etats[0]?.code || "";
  return { ok: true, data: { etats, titres: choisi ? titresMtp(choisi) : [] } };
}

/**
 * Caracteristiques d'un titre a une date : ISIN, nominal, taux facial,
 * echeance et INTERETS COURUS PAR TITRE.
 *
 * Les courus sont la raison d'etre de cette action. Les ressaisir a la main
 * etait la porte ouverte a un zero oublie sur un montant a neuf chiffres,
 * alors que le site connait le taux facial et les dates de detachement.
 */
export async function caracteristiquesTitreAction(
  marche: "mfr" | "mtp",
  cle: string,
  pays: string,
  dateOperation: string,
): Promise<ActionResult<CaracteristiquesTitre>> {
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };
  const c = caracteristiques(marche, cle, pays, dateOperation);
  if (!c) return { ok: false, error: "Titre introuvable dans le référentiel." };
  return { ok: true, data: c };
}

export async function enregistrerOperationMarcheAction(
  fundId: string,
  saisie: SaisieOperation,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  // ── Contrôles. Ils portent sur ce qui rendrait la ligne INEXPLOITABLE ────
  //
  // Le montant se déduit de la quantité et du prix : sans eux, l'opération ne
  // peut alimenter aucun poste. Le compte de règlement décide de la COLONNE :
  // sans lui, le montant n'a nulle part où tomber et disparaîtrait en silence.
  if (!EST_DATE.test(saisie.dateOperation))
    return { ok: false, error: "Renseigne la date de l'opération." };
  if (!DESCRIPTIONS_VALIDES.has(saisie.description))
    return { ok: false, error: "Choisis le type d'opération." };
  if (!INSTRUMENTS_VALIDES.has(saisie.instrument))
    return { ok: false, error: "Choisis la nature de l'instrument." };
  if (!(saisie.quantite > 0))
    return { ok: false, error: "La quantité doit être strictement positive." };
  if (!(saisie.prix > 0))
    return { ok: false, error: "Le prix doit être strictement positif." };
  if (!saisie.compteReglement.trim())
    return {
      ok: false,
      error:
        "Choisis le compte de règlement : sans lui, le montant n'entre dans aucune colonne du point de trésorerie.",
    };

  const denouement = EST_DATE.test(saisie.dateDenouement)
    ? saisie.dateDenouement
    : dateDenouement(saisie.dateOperation, saisie.instrument as Instrument);

  const { data, error } = await supabase
    .from("fund_market_operations")
    .insert({
      owner_id: userId,
      fund_id: fundId,
      date_operation: saisie.dateOperation,
      date_denouement: denouement,
      description: saisie.description as DescriptionOperation,
      instrument: saisie.instrument,
      code: saisie.code.trim(),
      libelle: saisie.libelle.trim(),
      quantite: saisie.quantite,
      prix: saisie.prix,
      sgi: saisie.sgi.trim(),
      taux_courtage: saisie.tauxCourtage,
      taux_tps: saisie.tauxTps,
      taux_brvm: saisie.tauxBrvm,
      interets_courus: saisie.interetsCourus,
      compte_reglement: saisie.compteReglement.trim(),
      statut: saisie.statut,
      note: saisie.note.trim(),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function supprimerOperationMarcheAction(
  fundId: string,
  operationId: string,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const { error } = await supabase
    .from("fund_market_operations")
    .delete()
    .eq("id", operationId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  return { ok: true, data: { id: operationId } };
}

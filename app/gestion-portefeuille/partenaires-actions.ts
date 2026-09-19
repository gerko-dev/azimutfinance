"use server";

// === Partenaires de marché — lecture et écriture ===
//
// Même garde que le reste du module : session, niveau 1, propriété par
// `owner_id`. Les partenaires appartiennent à la société de gestion, pas à un
// fonds : une SGI traite pour plusieurs portefeuilles.

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import {
  REFERENTS_MAX,
  referentRenseigne,
  versPartenaire,
  type LignePartenaire,
  type NaturePartenaire,
  type Partenaire,
  type SaisiePartenaire,
} from "./partenaires-types";

const COLS =
  "id, kind, nom, agrement, pays, email, telephone, adresse, " +
  "taux_courtage, taux_tps, taux_brvm, referents, actif, note";

export async function listerPartenairesAction(
  kind?: NaturePartenaire,
): Promise<ActionResult<Partenaire[]>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  let requete = supabase.from("market_partners").select(COLS).order("nom");
  if (kind) requete = requete.eq("kind", kind);
  const { data, error } = await requete;
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: ((data ?? []) as unknown as LignePartenaire[]).map(versPartenaire),
  };
}

/** Normalise et valide ce qui rendrait la fiche inexploitable. */
function preparer(saisie: SaisiePartenaire): { erreur: string } | { valeurs: Record<string, unknown> } {
  const nom = saisie.nom.trim();
  if (!nom) return { erreur: "Le nom du partenaire est obligatoire." };

  // Les taux sont des DÉCIMAUX. Un 0,4 saisi pour 0,4 % multiplierait le
  // courtage par cent sur toutes les opérations qui reprennent ce partenaire :
  // on refuse plutôt que d'avaler.
  for (const [libelle, v] of [
    ["courtage", saisie.tauxCourtage],
    ["TPS", saisie.tauxTps],
    ["BRVM / DC-BR", saisie.tauxBrvm],
  ] as const) {
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      return {
        erreur:
          `Le taux de ${libelle} doit être un décimal entre 0 et 1 ` +
          `(0,004 pour 0,4 %). Reçu : ${v}.`,
      };
    }
  }

  const referents = saisie.referents.filter(referentRenseigne).slice(0, REFERENTS_MAX);

  return {
    valeurs: {
      kind: saisie.kind,
      nom,
      agrement: saisie.agrement.trim(),
      pays: saisie.pays.trim(),
      email: saisie.email.trim(),
      telephone: saisie.telephone.trim(),
      adresse: saisie.adresse.trim(),
      taux_courtage: saisie.tauxCourtage,
      taux_tps: saisie.tauxTps,
      taux_brvm: saisie.tauxBrvm,
      referents: referents.map((r) => ({
        nom: r.nom.trim(),
        fonction: r.fonction.trim(),
        email: r.email.trim(),
        telephone: r.telephone.trim(),
      })),
      actif: saisie.actif,
      note: saisie.note.trim(),
    },
  };
}

export async function enregistrerPartenaireAction(
  id: string | null,
  saisie: SaisiePartenaire,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const prepare = preparer(saisie);
  if ("erreur" in prepare) return { ok: false, error: prepare.erreur };

  const reponse = id
    ? await supabase
        .from("market_partners")
        .update(prepare.valeurs)
        .eq("id", id)
        .eq("owner_id", user.id)
        .select("id")
        .single()
    : await supabase
        .from("market_partners")
        .insert({ ...prepare.valeurs, owner_id: user.id })
        .select("id")
        .single();

  if (reponse.error) {
    // L'unicite porte sur (owner_id, kind, nom) : le message brut de Postgres
    // ne le dit pas au gerant.
    const msg = reponse.error.message.includes("market_partners_owner_id_kind_nom_key")
      ? `Un partenaire de cette nature porte déjà le nom « ${saisie.nom.trim()} ».`
      : reponse.error.message;
    return { ok: false, error: msg };
  }

  revalidatePath("/gestion-portefeuille/parametres");
  revalidatePath("/gestion-portefeuille/operations-marche");
  return { ok: true, data: { id: (reponse.data as { id: string }).id } };
}

export async function supprimerPartenaireAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const { error } = await supabase
    .from("market_partners")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/gestion-portefeuille/parametres");
  revalidatePath("/gestion-portefeuille/operations-marche");
  return { ok: true, data: { id } };
}

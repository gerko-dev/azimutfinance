import "server-only";

// === Opérations de marché : garde d'accès ===
//
// Session, niveau 1, propriété du fonds — les trois conditions pour écrire une
// ligne dans le portefeuille de quelqu'un.
//
// ELLE VIT À PART DES ACTIONS, et non dans le fichier « use server » qui
// l'utilisait seul : un second fichier d'actions — celui de l'import — en a
// besoin, et deux copies d'un contrôle de sécurité divergent toujours. Ici,
// la corriger les corrige tous.
//
// Ce module ne peut PAS porter « use server » : un tel fichier n'exporte que
// des fonctions appelables depuis le navigateur, et rendre `autoriser`
// appelable de l'extérieur offrirait un client Supabase authentifié à qui le
// demande.

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";

export type ClientServeur = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// Union DISCRIMINÉE, et type écrit à la main : laissé à l'inférence, le type
// de retour fusionnait les deux branches et `acces.erreur` ressortait
// `string | undefined` après le test `in`.
export type Acces =
  | { erreur: string }
  | { supabase: ClientServeur; userId: string };

/** Vérifie la session, le niveau et la propriété du fonds. */
export async function autoriser(fundId: string): Promise<Acces> {
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

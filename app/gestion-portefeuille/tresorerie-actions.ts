"use server";

// === Point de trésorerie — enregistrement des soldes saisis ===
//
// Même garde que les autres écritures du module : session, niveau 1, propriété
// du fonds. Upsert par (fonds, date) : ressaisir une même date remplace le jeu
// de soldes, ce qui est le geste attendu — on corrige un point de trésorerie,
// on n'en empile pas deux pour le même jour.

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import { loadCustomSecurities } from "./portfolio-data";
import { etablissementDuCompte } from "./tresorerie-comptes";

export async function enregistrerSoldesTresorerieAction(
  fundId: string,
  dateArrete: string,
  soldes: Record<string, number>,
): Promise<ActionResult<{ as_of_date: string }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté pour enregistrer." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArrete))
    return { ok: false, error: "Renseigne la date du point de trésorerie." };

  const { data: fund } = await supabase
    .from("managed_funds")
    .select("id")
    .eq("id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!fund) return { ok: false, error: "Fonds introuvable." };

  // On n'enregistre que des etablissements REELLEMENT presents au referentiel :
  // une clef inconnue viendrait d'un formulaire altere, et creerait une colonne
  // fantome que plus rien ne rattacherait a un compte.
  const connues = new Set(
    (await loadCustomSecurities())
      .map((c) => etablissementDuCompte(c)?.cle)
      .filter((c): c is string => Boolean(c)),
  );
  const propre: Record<string, number> = {};
  for (const [banque, montant] of Object.entries(soldes)) {
    if (!connues.has(banque)) continue;
    if (typeof montant !== "number" || !Number.isFinite(montant)) continue;
    propre[banque] = montant;
  }

  const { error } = await supabase.from("fund_treasury_balances").upsert(
    {
      owner_id: user.id,
      fund_id: fundId,
      as_of_date: dateArrete,
      soldes: propre,
    },
    { onConflict: "fund_id,as_of_date" },
  );
  if (error) return { ok: false, error: `Enregistrement impossible : ${error.message}` };

  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  revalidatePath("/gestion-portefeuille/tresorerie");
  return { ok: true, data: { as_of_date: dateArrete } };
}

/**
 * Enregistre les soldes de PLUSIEURS fonds à une même date.
 *
 * C'est le geste réel du trésorier : il ouvre le relevé d'une banque, y trouve
 * les comptes de tous les fonds, et les saisit d'un coup. Une action par fonds
 * l'aurait obligé à valider autant de fois qu'il a de portefeuilles, avec le
 * risque d'en oublier un en route et de laisser un point à demi corrigé.
 *
 * Les fonds sont traités EN SÉRIE et non en parallèle : chacun est un upsert
 * indépendant, et une erreur sur l'un ne doit ni empêcher les suivants ni
 * passer inaperçue. On rend la liste de ceux qui ont échoué plutôt qu'un
 * unique « ça n'a pas marché ».
 */
export async function enregistrerSoldesMultiFondsAction(
  dateArrete: string,
  parFonds: Record<string, Record<string, number>>,
): Promise<ActionResult<{ as_of_date: string; enregistres: number; echecs: string[] }>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArrete))
    return { ok: false, error: "Renseigne la date du point de trésorerie." };

  const echecs: string[] = [];
  let enregistres = 0;
  for (const [fundId, soldes] of Object.entries(parFonds)) {
    const res = await enregistrerSoldesTresorerieAction(fundId, dateArrete, soldes);
    if (res.ok) enregistres++;
    else echecs.push(`${fundId} : ${res.error}`);
  }

  if (enregistres === 0 && echecs.length > 0)
    return { ok: false, error: echecs.join(" · ") };

  revalidatePath("/gestion-portefeuille/tresorerie");
  return { ok: true, data: { as_of_date: dateArrete, enregistres, echecs } };
}

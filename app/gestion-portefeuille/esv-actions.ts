"use server";

// === ESV — pointage des flux reçus ===
//
// LA SEULE CHOSE QU'ON ÉCRIT. Le calendrier se recalcule à chaque affichage à
// partir des titres détenus et des échéanciers ; ce qu'aucun calcul ne peut
// deviner, c'est qu'un flux est TOMBÉ — à quelle date et pour quel montant.
//
// Le montant reçu se saisit, et il se saisit SÉPARÉMENT de l'attendu : les
// deux diffèrent presque toujours. Retenue à la source sur un dividende,
// arrondi du dépositaire, quantité détenue au détachement différente de celle
// de l'inventaire. C'est l'écart entre les deux qui apprend quelque chose, et
// écraser l'attendu par le reçu l'aurait effacé.

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/admin/types";

import { autoriser } from "./operations-marche-garde";

const EST_DATE = /^\d{4}-\d{2}-\d{2}$/;

function rafraichir(fundId: string) {
  revalidatePath("/gestion-portefeuille/esv");
  revalidatePath("/gestion-portefeuille/tresorerie");
  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
}

export type SaisieReception = {
  dateReception: string;
  montantRecu: number;
  compte: string;
  note: string;
};

/**
 * POINTE un flux : il est arrivé.
 *
 * `upsert` sur (fonds, clef) : repointer le même flux corrige la ligne au lieu
 * d'en empiler deux. Un événement ne tombe qu'une fois.
 */
export async function pointerEvenementAction(
  fundId: string,
  cle: string,
  saisie: SaisieReception,
): Promise<ActionResult<{ cle: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  if (!cle.trim()) return { ok: false, error: "Événement introuvable." };
  if (!EST_DATE.test(saisie.dateReception))
    return { ok: false, error: "Renseigne la date d'encaissement." };
  // Zéro est REFUSÉ, pas toléré : un flux pointé à zéro se lit comme reçu et
  // disparaît du suivi, alors qu'un encaissement nul veut dire qu'il ne s'est
  // rien passé. Si le flux n'est jamais venu, il doit RESTER en retard.
  if (!(saisie.montantRecu > 0))
    return {
      ok: false,
      error:
        "Le montant encaissé doit être strictement positif. Un flux qui n'est " +
        "pas venu ne se pointe pas : il doit rester en retard.",
    };

  const { error } = await supabase.from("fund_security_event_receipts").upsert(
    {
      owner_id: userId,
      fund_id: fundId,
      cle: cle.trim(),
      date_reception: saisie.dateReception,
      montant_recu: saisie.montantRecu,
      compte: saisie.compte.trim(),
      note: saisie.note.trim(),
    },
    { onConflict: "fund_id,cle" },
  );
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { cle } };
}

/**
 * DÉPOINTE un flux : il n'était pas arrivé, ou pas ainsi.
 *
 * La ligne est supprimée plutôt que marquée : son absence vaut « pas encore
 * reçu », qui est l'état par défaut. Garder une ligne vide aurait créé un
 * troisième état dont personne n'a besoin.
 */
export async function depointerEvenementAction(
  fundId: string,
  cle: string,
): Promise<ActionResult<{ cle: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const { error } = await supabase
    .from("fund_security_event_receipts")
    .delete()
    .eq("fund_id", fundId)
    .eq("owner_id", userId)
    .eq("cle", cle);
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { cle } };
}

/**
 * Pointe PLUSIEURS flux d'un coup, au montant attendu.
 *
 * Le geste réel du gérant : il reçoit un avis du dépositaire portant dix
 * coupons du même jour, tous au montant prévu. Les pointer un à un aurait été
 * dix formulaires pour un seul fait.
 *
 * Le montant reste celui que l'écran a calculé et que le gérant a sous les
 * yeux — on ne le recalcule pas ici, faute de quoi un changement d'échéancier
 * entre l'affichage et le clic aurait pointé un autre chiffre que celui
 * approuvé.
 */
export async function pointerEnMasseAction(
  fundId: string,
  dateReception: string,
  compte: string,
  flux: { cle: string; montant: number }[],
): Promise<ActionResult<{ pointes: number; refus: string[] }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  if (!EST_DATE.test(dateReception))
    return { ok: false, error: "Renseigne la date d'encaissement." };
  if (flux.length === 0) return { ok: false, error: "Aucun flux sélectionné." };

  const lignes = flux
    .filter((f) => f.cle.trim() && f.montant > 0)
    .map((f) => ({
      owner_id: userId,
      fund_id: fundId,
      cle: f.cle.trim(),
      date_reception: dateReception,
      montant_recu: f.montant,
      compte: compte.trim(),
      note: "",
    }));

  const refus: string[] = [];
  const ecartes = flux.length - lignes.length;
  if (ecartes > 0) {
    refus.push(`${ecartes} flux à montant nul n'ont pas été pointés.`);
  }
  if (lignes.length === 0) return { ok: true, data: { pointes: 0, refus } };

  const { error } = await supabase
    .from("fund_security_event_receipts")
    .upsert(lignes, { onConflict: "fund_id,cle" });
  if (error) return { ok: false, error: error.message };

  rafraichir(fundId);
  return { ok: true, data: { pointes: lignes.length, refus } };
}

"use server";

// === Allocation validée — écritures ===
//
// Chaque action re-verifie le niveau admin : une action serveur est un point
// d'entree HTTP a part entiere, que la garde du layout ne protege pas.

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadStocks } from "@/lib/dataLoader";
import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import { chargerCibles, construireTableauAllocation } from "./allocation-data";
import {
  controlerGroupes,
  type AxeAllocation,
  type TableauAllocation,
} from "./allocation-types";

type Guard =
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | { ok: false; error: string };

async function garde(): Promise<Guard> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnecte-toi." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };
  return { ok: true, userId: user.id, supabase };
}

/** Le fonds appartient-il bien au compte ? La RLS le garantit deja, mais un
 *  controle explicite rend le message lisible plutot qu'un insert sans effet. */
async function fondsDuCompte(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  fundId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("managed_funds")
    .select("id")
    .eq("id", fundId)
    .eq("owner_id", userId)
    .maybeSingle();
  return !!data;
}

export async function chargerAllocationAction(
  fundId: string,
  axe: AxeAllocation = "classe",
  tresorerieAInvestir = 0,
): Promise<ActionResult<TableauAllocation>> {
  const g = await garde();
  if (!g.ok) return { ok: false, error: g.error };
  if (!(await fondsDuCompte(g.supabase, g.userId, fundId))) {
    return { ok: false, error: "Fonds introuvable." };
  }
  try {
    const tableau = await construireTableauAllocation(fundId, axe, tresorerieAInvestir);
    return { ok: true, data: tableau };
  } catch (err) {
    console.error("[allocation] chargement", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Échec du calcul de l'allocation.",
    };
  }
}

export type SaisieCible = { bucket: string; cible: number };

/**
 * Enregistre les cibles d'un axe, en remplaçant celles qui existent.
 *
 * On REFUSE une somme qui s'écarte de 100 % de plus d'un dixième de point.
 * Une allocation qui ne boucle pas produit des valeurs cibles fausses sur
 * TOUTES les lignes, pas seulement sur celle qui manque — mieux vaut bloquer
 * la saisie que livrer au comité des montants à réaliser incohérents.
 */
export async function enregistrerCiblesAction(
  fundId: string,
  cibles: SaisieCible[],
  options: { dimension?: AxeAllocation; decideLe?: string | null; note?: string | null } = {},
): Promise<ActionResult<null>> {
  // Note : la somme d'un SOUS-AXE vaut 100 % DE SA POCHE, pas de l'actif net.
  // Allouer 100 % de la poche actions entre secteurs est cohérent avec une
  // classe Actions à 35 % de l'actif : les deux niveaux se composent.
  const g = await garde();
  if (!g.ok) return { ok: false, error: g.error };
  if (!(await fondsDuCompte(g.supabase, g.userId, fundId))) {
    return { ok: false, error: "Fonds introuvable." };
  }

  const dimension = options.dimension ?? "classe";
  const retenues = cibles.filter((c) => c.bucket && Number.isFinite(c.cible));
  for (const c of retenues) {
    if (c.cible < 0 || c.cible > 1) {
      return {
        ok: false,
        error: `Cible hors bornes pour « ${c.bucket} » : une allocation se situe entre 0 et 100 %.`,
      };
    }
  }

  const somme = retenues.reduce((s, c) => s + c.cible, 0);
  if (retenues.length > 0 && Math.abs(somme - 1) > 0.001) {
    return {
      ok: false,
      error: `La somme des allocations vaut ${(somme * 100).toFixed(2).replace(".", ",")} % au lieu de 100 %. Corrige avant d'enregistrer : une allocation qui ne boucle pas fausse toutes les valeurs cibles.`,
    };
  }

  // ── Conformité avec l'axe de niveau supérieur ──────────────────────────
  //
  // Une allocation par titre qui ne respecte pas l'allocation sectorielle
  // arrêtée par le comité produit deux décisions contradictoires dans le même
  // classeur. On refuse, en nommant les secteurs en cause : un message
  // générique obligerait le gérant à refaire l'addition lui-même.
  if (dimension === "action_titre" && retenues.length > 0) {
    const ciblesSecteur = await chargerCibles(fundId, "action_secteur");
    if (ciblesSecteur.length > 0) {
      const parSecteur: Record<string, number> = {};
      for (const c of ciblesSecteur) parSecteur[c.bucket] = c.cible;

      // loadStocks() est mémoïsé ; loadAllActions() ne l'est pas et recalcule
      // les ratios des 47 valeurs à chaque appel, pour un secteur qui ne bouge
      // jamais.
      const secteurDuTitre = new Map(
        loadStocks().map((s) => [
          (s.code || "").trim().toUpperCase(),
          (s.sector || "Non classé").trim(),
        ]),
      );
      const ecarts = controlerGroupes(retenues, secteurDuTitre, parSecteur).filter(
        (c) => !c.conforme,
      );

      if (ecarts.length > 0) {
        const detail = ecarts
          .map((e) => {
            const somme = (e.sommeTitres * 100).toFixed(2).replace(".", ",");
            const cible = ((e.cibleGroupe ?? 0) * 100).toFixed(2).replace(".", ",");
            const signe = (e.ecart ?? 0) > 0 ? "dépassement" : "manque";
            const delta = (Math.abs(e.ecart ?? 0) * 100).toFixed(2).replace(".", ",");
            return `${e.groupe} : ${somme} % alloués pour une cible de ${cible} % (${signe} de ${delta} pt)`;
          })
          .join(" ; ");
        return {
          ok: false,
          error: `Les allocations par titre ne respectent pas l'allocation sectorielle — ${detail}. Corrige les titres, ou ajuste d'abord l'axe « Actions — par secteur ».`,
        };
      }
    }
  }

  // Remplacement de l'axe entier : une cible retiree du formulaire doit
  // disparaitre, pas subsister dans l'ombre.
  const { error: errSupp } = await g.supabase
    .from("fund_allocation_targets")
    .delete()
    .eq("fund_id", fundId)
    .eq("dimension", dimension);
  if (errSupp) return { ok: false, error: errSupp.message };

  if (retenues.length > 0) {
    const { error } = await g.supabase.from("fund_allocation_targets").insert(
      retenues.map((c) => ({
        owner_id: g.userId,
        fund_id: fundId,
        dimension,
        bucket: c.bucket,
        cible: c.cible,
        decide_le: options.decideLe || null,
        note: options.note || null,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  return { ok: true, data: null };
}

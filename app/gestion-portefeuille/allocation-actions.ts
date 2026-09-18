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
import { construireTableauAllocation } from "./allocation-data";
import type { AxeAllocation, TableauAllocation } from "./allocation-types";

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

  // ── Propagation vers l'axe sectoriel ───────────────────────────────────
  //
  // Le titre est l'axe le plus fin : une allocation par valeur DÉTERMINE
  // l'allocation sectorielle, qui n'en est que la somme. Refuser
  // l'enregistrement parce que les deux ne coïncidaient pas obligeait à saisir
  // deux fois la même décision, dans le bon ordre, et à refaire l'addition à la
  // main — sept secteurs en écart suffisaient à bloquer toute validation.
  //
  // On recalcule donc le secteur À PARTIR des titres, et on l'enregistre dans
  // la foulée. Les deux axes ne peuvent plus se contredire, parce que l'un
  // découle de l'autre.
  //
  // Le sens inverse reste libre : allouer par secteur n'impose rien aux titres,
  // puisqu'une même enveloppe sectorielle se répartit d'une infinité de façons.
  let ciblesSecteurDeduites: SaisieCible[] | null = null;
  if (dimension === "action_titre" && retenues.length > 0) {
    // loadStocks() est mémoïsé ; loadAllActions() ne l'est pas et recalcule
    // les ratios des 47 valeurs à chaque appel, pour un secteur qui ne bouge
    // jamais.
    const secteurDuTitre = new Map(
      loadStocks().map((s) => [
        (s.code || "").trim().toUpperCase(),
        (s.sector || "Non classé").trim(),
      ]),
    );
    const parSecteur = new Map<string, number>();
    for (const c of retenues) {
      const secteur = secteurDuTitre.get(c.bucket.trim().toUpperCase()) ?? "Non classé";
      parSecteur.set(secteur, (parSecteur.get(secteur) ?? 0) + c.cible);
    }
    ciblesSecteurDeduites = [...parSecteur.entries()]
      .filter(([, cible]) => cible > 0)
      .map(([bucket, cible]) => ({ bucket, cible }));
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

  // L'axe sectoriel est réécrit APRÈS les titres, et de la même façon :
  // remplacement complet, pour qu'un secteur vidé de ses titres disparaisse au
  // lieu de subsister avec son ancienne cible.
  if (ciblesSecteurDeduites) {
    const { error: errSuppSecteur } = await g.supabase
      .from("fund_allocation_targets")
      .delete()
      .eq("fund_id", fundId)
      .eq("dimension", "action_secteur");
    if (errSuppSecteur) return { ok: false, error: errSuppSecteur.message };

    if (ciblesSecteurDeduites.length > 0) {
      const { error } = await g.supabase.from("fund_allocation_targets").insert(
        ciblesSecteurDeduites.map((c) => ({
          owner_id: g.userId,
          fund_id: fundId,
          dimension: "action_secteur",
          bucket: c.bucket,
          cible: c.cible,
          decide_le: options.decideLe || null,
          note: "Déduite de l'allocation par titre.",
        })),
      );
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  return { ok: true, data: null };
}

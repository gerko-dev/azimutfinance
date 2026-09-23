// Loader serveur de l'historique VL / actif net (lecture via RLS).
import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NavPoint } from "./nav-types";

type NavRow = {
  as_of_date: string;
  vl: number | null;
  nombre_parts: number | null;
  actif_net: number | null;
  actif_brut: number | null;
};

/**
 * Historique COMPLET des VL d'un fonds.
 *
 * MÉMOÏSÉ PAR REQUÊTE. Deux mille points se lisent en deux pages de mille,
 * soit deux allers-retours de deux cents millisecondes ; et l'écran des ratios
 * comme celui des souscriptions l'appelaient DEUX FOIS par fonds pendant le
 * même rendu — une fois dans la page, une fois dans le calcul. Le `cache()` de
 * React les ramène à un seul chargement, partagé.
 *
 * Quand seules les dernières valeurs importent, `loadDernieresVl` évite la
 * pagination entière : c'est le cas de tous les usages sauf les graphiques.
 */
export const loadNavHistory = cache(async (fundId: string): Promise<NavPoint[]> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Supabase plafonne le nombre de lignes par requête (1000 par défaut) :
  // on pagine pour récupérer tout l'historique (plusieurs milliers de points).
  const PAGE = 1000;
  const all: NavRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("fund_nav_history")
      .select("as_of_date, vl, nombre_parts, actif_net, actif_brut")
      .eq("fund_id", fundId)
      .order("as_of_date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as NavRow[]));
    if (data.length < PAGE) break;
  }

  return all.map((r) => ({
    date: r.as_of_date,
    vl: r.vl,
    parts: r.nombre_parts,
    actifNet: r.actif_net,
    actifBrut: r.actif_brut,
  }));
});


/**
 * Les VL d'UN SEUL MOIS, dans l'ordre des dates.
 *
 * UN SEUL ALLER-RETOUR, une vingtaine de lignes. Les frais de gestion se
 * calculent sur la moyenne mensuelle de l'actif net : charger pour cela les
 * deux mille points de l'historique complet, sur chaque fonds de l'écran
 * interfonds, faisait passer le point de trésorerie de deux à onze secondes.
 *
 * LE FILTRE EST UN INTERVALLE, PAS UN PRÉFIXE. `as_of_date` est une colonne
 * `date` et non du texte : PostgreSQL y refuse `LIKE` — « operator does not
 * exist: date ~~ unknown » —, et PostgREST rendait donc une erreur que le
 * chargeur traduisait en liste vide. Les frais de gestion sortaient alors
 * « non calculables » sans que rien n'explique pourquoi.
 *
 * On borne donc du premier jour du mois au premier du suivant, exclu. Le
 * premier du mois suivant se calcule sans connaître la longueur du mois
 * courant : pas de février à traiter à part.
 */
export const loadNavMois = cache(
  async (fundId: string, mois: string): Promise<NavPoint[]> => {
    if (!/^\d{4}-\d{2}$/.test(mois)) return [];
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const an = Number(mois.slice(0, 4));
    const m = Number(mois.slice(5, 7));
    const debut = `${mois}-01`;
    const suivant =
      m >= 12 ? `${an + 1}-01-01` : `${an}-${String(m + 1).padStart(2, "0")}-01`;

    const { data, error } = await supabase
      .from("fund_nav_history")
      .select("as_of_date, vl, nombre_parts, actif_net, actif_brut")
      .eq("fund_id", fundId)
      .gte("as_of_date", debut)
      .lt("as_of_date", suivant)
      .order("as_of_date", { ascending: true });

    // Une erreur rendue comme liste vide se lit « aucune VL ce mois-là », ce
    // qui est indiscernable d'un mois sans valorisation. On trace.
    if (error) {
      console.error(`[gestion-portefeuille] loadNavMois(${mois}) :`, error.message);
      return [];
    }
    if (!data) return [];
    return (data as NavRow[]).map((r) => ({
      date: r.as_of_date,
      vl: r.vl,
      parts: r.nombre_parts,
      actifNet: r.actif_net,
      actifBrut: r.actif_brut,
    }));
  },
);

/**
 * Les N DERNIÈRES VL d'un fonds, la plus récente d'abord.
 *
 * UN SEUL ALLER-RETOUR, sans pagination. Trois écrans n'avaient besoin que de
 * cela — l'actif net du jour pour les ratios, les dates proposables à la
 * souscription — et chargeaient pourtant les deux mille points de l'historique
 * complet. Sur un fonds valorisé quotidiennement depuis dix ans, c'est deux
 * pages de mille lignes pour en lire une.
 *
 * `avant` borne la recherche : les ratios se calculent à la date d'un
 * inventaire, pas à celle du jour.
 */
export const loadDernieresVl = cache(
  async (fundId: string, combien = 1, avant?: string): Promise<NavPoint[]> => {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    let requete = supabase
      .from("fund_nav_history")
      .select("as_of_date, vl, nombre_parts, actif_net, actif_brut")
      .eq("fund_id", fundId)
      .order("as_of_date", { ascending: false })
      .limit(combien);
    if (avant) requete = requete.lte("as_of_date", avant);

    const { data, error } = await requete;
    if (error) {
      console.error("[nav] lecture des VL impossible —", error.message);
      return [];
    }
    return ((data ?? []) as NavRow[]).map((r) => ({
      date: r.as_of_date,
      vl: r.vl,
      parts: r.nombre_parts,
      actifNet: r.actif_net,
      actifBrut: r.actif_brut,
    }));
  },
);

import "server-only";

// === Souscriptions et rachats de parts : lecture et agrégation ===
//
// Même forme que les opérations de marché : une lecture mémoïsée par requête,
// et une agrégation par POSTE puis par COMPTE DE RÈGLEMENT, que le point de
// trésorerie déverse dans ses colonnes.

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  fluxPese,
  postePart,
  type Bureau,
  type Certitude,
  type FluxPart,
  type FluxPartAvecFonds,
  type SensPart,
  type TypeClient,
} from "./parts-types";

type Ligne = {
  id: string;
  date_operation: string;
  sens: string;
  bureau: string | null;
  certitude: string;
  type_client: string;
  investisseur: string;
  montant: number | string;
  taux_frais: number | string;
  date_vl: string | null;
  vl: number | string | null;
  performance_cible: number | string | null;
  date_fin: string | null;
  compte_reglement: string;
  date_reglement: string | null;
  note: string;
};

const COLS =
  "id, fund_id, date_operation, sens, bureau, certitude, type_client, investisseur, montant, taux_frais, date_vl, vl, performance_cible, date_fin, compte_reglement, date_reglement, note";

// Supabase renvoie les `numeric` en CHAÎNE pour préserver leur précision.
const nb = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const BUREAUX = new Set(["CI", "SN", "BJ"]);

function versFlux(l: Ligne): FluxPart {
  return {
    id: l.id,
    dateOperation: l.date_operation,
    sens: (l.sens === "rachat" ? "rachat" : "souscription") as SensPart,
    bureau: l.bureau && BUREAUX.has(l.bureau) ? (l.bureau as Bureau) : null,
    certitude: (l.certitude === "probable" ? "probable" : "certain") as Certitude,
    typeClient: (l.type_client === "sensible" ? "sensible" : "autre") as TypeClient,
    investisseur: l.investisseur ?? "",
    montant: nb(l.montant),
    tauxFrais: nb(l.taux_frais),
    dateVl: l.date_vl ?? null,
    vl: l.vl == null ? null : nb(l.vl),
    performanceCible: l.performance_cible == null ? null : nb(l.performance_cible),
    dateFin: l.date_fin ?? null,
    compteReglement: l.compte_reglement ?? "",
    dateReglement: l.date_reglement ?? null,
    note: l.note ?? "",
  };
}

/** Flux d'un fonds. Mémoïsé : l'écran et le point de trésorerie les lisent
 *  tous deux pendant le même rendu. */
export const loadFluxParts = cache(async (fundId: string): Promise<FluxPart[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("fund_unit_flows")
    .select(COLS)
    .eq("fund_id", fundId)
    .order("date_operation", { ascending: false })
    .order("created_at", { ascending: false });
  // UNE LECTURE QUI ÉCHOUE N'EST PAS UNE ABSENCE DE DONNÉES. Sans cette
  // trace, une colonne manquante — un script SQL pas encore joué — se lisait
  // comme « aucun flux », et le point de trésorerie sortait juste faux.
  if (error) console.error("[parts] lecture des flux impossible —", error.message);
  return ((data ?? []) as unknown as Ligne[]).map(versFlux);
});

/**
 * Tous les flux du gérant, tous fonds confondus.
 *
 * L'écran est INTERFONDS comme celui des opérations de marché : une collecte
 * se saisit par bordereau, et un même bureau place sur plusieurs fonds le même
 * jour. La RLS restreint déjà la lecture aux fonds du gérant.
 */
export const loadTousFluxParts = cache(
  async (): Promise<{ lignes: FluxPartAvecFonds[]; erreur: string | null }> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("fund_unit_flows")
      .select(`${COLS}, managed_funds(nom)`)
      .order("date_operation", { ascending: false })
      .order("created_at", { ascending: false });

    // UNE LECTURE QUI ÉCHOUE N'EST PAS UNE ABSENCE DE DONNÉES, et c'est
    // exactement ce qu'un `data ?? []` silencieux faisait croire : une colonne
    // manquante — un script SQL pas encore joué — vidait l'écran sans rien
    // dire, et on cherchait la panne du côté du rafraîchissement.
    if (error) {
      console.error("[parts] lecture des flux impossible —", error.message);
      return { lignes: [], erreur: error.message };
    }

    type LigneJointe = Ligne & {
      fund_id: string;
      managed_funds: { nom: string } | { nom: string }[] | null;
    };

    const lignes = ((data ?? []) as unknown as LigneJointe[]).map((l) => {
      // PostgREST renvoie la jointure tantôt en objet, tantôt en tableau selon
      // qu'il la juge unique : les deux formes se rencontrent, on les couvre.
      const f = Array.isArray(l.managed_funds) ? l.managed_funds[0] : l.managed_funds;
      return { ...versFlux(l), fondsId: l.fund_id, fondsNom: f?.nom ?? "—" };
    });
    return { lignes, erreur: null };
  },
);

/** Montants par POSTE puis par COMPTE DE RÈGLEMENT, à une date d'arrêté. */
export function agregerFluxParts(
  flux: FluxPart[],
  dateArrete: string | null,
): Map<string, Map<string, number>> {
  const parPoste = new Map<string, Map<string, number>>();

  for (const f of flux) {
    if (f.montant === 0) continue;
    if (!fluxPese(f, dateArrete)) continue;

    const poste = postePart(f);
    let parCompte = parPoste.get(poste);
    if (!parCompte) {
      parCompte = new Map<string, number>();
      parPoste.set(poste, parCompte);
    }
    parCompte.set(f.compteReglement, (parCompte.get(f.compteReglement) ?? 0) + f.montant);
  }
  return parPoste;
}

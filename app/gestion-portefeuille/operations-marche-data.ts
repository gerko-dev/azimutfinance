import "server-only";

// === Opérations de marché : lecture et agrégation ===
//
// Le point de trésorerie somme les opérations par (poste, compte de règlement)
// en ne retenant que celles DÉJÀ DÉNOUÉES à la date d'arrêté. C'est la règle du
// classeur (`Tableau4[Date de dénouement] <= $C$2`) et elle a un sens : une
// opération négociée mais pas encore réglée n'a pas bougé la trésorerie.

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  montantOperation,
  posteDe,
  type DescriptionOperation,
  type Instrument,
  type OperationMarche,
  type StatutOperation,
} from "./operations-marche-types";

type Ligne = {
  id: string;
  date_operation: string;
  date_denouement: string;
  description: string;
  instrument: string;
  code: string;
  libelle: string;
  quantite: number | string;
  prix: number | string;
  sgi: string;
  taux_courtage: number | string;
  taux_tps: number | string;
  taux_brvm: number | string;
  taux_dcbr: number | string;
  interets_courus: number | string;
  compte_reglement: string;
  statut: string;
  note: string;
};

// Supabase renvoie les `numeric` en CHAÎNE pour préserver leur précision : les
// convertir ici, une fois, évite d'avoir à s'en souvenir partout ailleurs.
const nb = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function versOperation(l: Ligne): OperationMarche {
  const base = {
    description: l.description as DescriptionOperation,
    quantite: nb(l.quantite),
    prix: nb(l.prix),
    tauxCourtage: nb(l.taux_courtage),
    tauxTps: nb(l.taux_tps),
    tauxBrvm: nb(l.taux_brvm),
    tauxDcbr: nb(l.taux_dcbr),
    interetsCourus: nb(l.interets_courus),
  };
  return {
    id: l.id,
    dateOperation: l.date_operation,
    dateDenouement: l.date_denouement,
    instrument: l.instrument as Instrument,
    code: l.code ?? "",
    libelle: l.libelle ?? "",
    sgi: l.sgi ?? "",
    compteReglement: l.compte_reglement ?? "",
    statut: (l.statut ?? "en_cours") as StatutOperation,
    note: l.note ?? "",
    ...base,
    montant: montantOperation(base),
  };
}

/**
 * Opérations d'un fonds, les plus récentes d'abord.
 *
 * Mémoïsé par requête : l'écran des opérations et le point de trésorerie les
 * lisent tous deux pendant le même rendu.
 */
export const loadOperationsMarche = cache(
  async (fundId: string): Promise<OperationMarche[]> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("fund_market_operations")
      .select(
        "id, date_operation, date_denouement, description, instrument, code, libelle, " +
          "quantite, prix, sgi, taux_courtage, taux_tps, taux_brvm, taux_dcbr, interets_courus, " +
          "compte_reglement, statut, note",
      )
      .eq("fund_id", fundId)
      .order("date_operation", { ascending: false })
      .order("created_at", { ascending: false });
    // Double conversion : la table n'est pas connue du typage genere du
    // client Supabase, qui renvoie alors un type d'erreur plutot que des
    // lignes. Le schema reel est celui de la migration.
    return ((data ?? []) as unknown as Ligne[]).map(versOperation);
  },
);

/** Une opération, augmentée du fonds auquel elle appartient. */
export type OperationAvecFonds = OperationMarche & {
  fondsId: string;
  fondsNom: string;
};

/**
 * Toutes les opérations du gérant, tous fonds confondus.
 *
 * L'écran de saisie est INTERFONDS : le gérant y passe ses opérations de la
 * journée, qui portent souvent sur plusieurs fonds à la fois — une même
 * adjudication se répartit entre les portefeuilles. Les séparer par fonds
 * l'obligerait à changer d'écran entre deux lignes du même bordereau.
 *
 * La RLS restreint déjà la lecture aux fonds du gérant : pas de filtre à
 * ajouter ici, et surtout pas de liste d'identifiants à tenir à jour.
 */
export const loadToutesOperationsMarche = cache(
  async (): Promise<OperationAvecFonds[]> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("fund_market_operations")
      .select(
        "id, fund_id, date_operation, date_denouement, description, instrument, code, libelle, " +
          "quantite, prix, sgi, taux_courtage, taux_tps, taux_brvm, taux_dcbr, interets_courus, " +
          "compte_reglement, statut, note, managed_funds(nom)",
      )
      .order("date_operation", { ascending: false })
      .order("created_at", { ascending: false });

    type LigneJointe = Ligne & {
      fund_id: string;
      managed_funds: { nom: string } | { nom: string }[] | null;
    };
    return ((data ?? []) as unknown as LigneJointe[]).map((l) => {
      // PostgREST renvoie la jointure tantôt en objet, tantôt en tableau selon
      // qu'il la juge unique : les deux formes se rencontrent, on les couvre.
      const f = Array.isArray(l.managed_funds) ? l.managed_funds[0] : l.managed_funds;
      return {
        ...versOperation(l),
        fondsId: l.fund_id,
        fondsNom: f?.nom ?? "—",
      };
    });
  },
);

/**
 * Montants par POSTE puis par COMPTE DE RÈGLEMENT, à une date d'arrêté.
 *
 * Deux filtres, tous deux repris du classeur :
 *  - le dénouement doit être intervenu au plus tard à la date d'arrêté ;
 *  - une opération annulée ne compte pas. Le classeur n'a pas ce cas — il
 *    supprime la ligne — mais garder la trace d'une annulation vaut mieux que
 *    l'effacer, et il faut alors l'écarter du calcul.
 */
export function agregerParPoste(
  operations: OperationMarche[],
  dateArrete: string | null,
): Map<string, Map<string, number>> {
  const parPoste = new Map<string, Map<string, number>>();
  for (const o of operations) {
    if (o.statut === "annule") continue;
    if (dateArrete && o.dateDenouement > dateArrete) continue;
    const poste = posteDe(o.description);
    if (!poste) continue;
    let parCompte = parPoste.get(poste);
    if (!parCompte) {
      parCompte = new Map<string, number>();
      parPoste.set(poste, parCompte);
    }
    parCompte.set(o.compteReglement, (parCompte.get(o.compteReglement) ?? 0) + o.montant);
  }
  return parPoste;
}

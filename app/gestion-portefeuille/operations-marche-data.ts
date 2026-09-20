import "server-only";

// === Opérations de marché : lecture et agrégation ===
//
// Le point de trésorerie distingue deux choses qu'un même ordre porte à la
// fois quand il est partiellement servi :
//
//   la part NON SERVIE  pèse comme ENGAGEMENT, tant que l'ordre est au carnet.
//                       Elle ne se dénoue pas : rien n'est encore à régler.
//   la part SERVIE      pèse comme RÈGLEMENT, à la date de dénouement de son
//                       exécution.
//
// C'est la règle du classeur, étendue à l'exécution partielle : il ne
// connaissait que des lignes entièrement validées ou entièrement réalisées.

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  dateLimiteOrdre,
  montantOperation,
  posteEngage,
  posteRealise,
  quantiteRestante,
  type DescriptionOperation,
  type Execution,
  type Instrument,
  type OperationMarche,
  type Validite,
} from "./operations-marche-types";

type LigneExecution = {
  id: string;
  operation_id: string;
  date_execution: string;
  date_denouement: string;
  quantite: number | string;
  note: string;
};

type Ligne = {
  id: string;
  date_operation: string;
  description: string;
  instrument: string;
  validite: string;
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
  note: string;
};

// Supabase renvoie les `numeric` en CHAÎNE pour préserver leur précision : les
// convertir ici, une fois, évite d'avoir à s'en souvenir partout ailleurs.
const nb = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const COLS_OPERATION =
  "id, fund_id, date_operation, description, instrument, validite, code, libelle, " +
  "quantite, prix, sgi, taux_courtage, taux_tps, taux_brvm, taux_dcbr, " +
  "interets_courus, compte_reglement, note";

const COLS_EXECUTION =
  "id, operation_id, date_execution, date_denouement, quantite, note";

function versExecution(l: LigneExecution): Execution {
  return {
    id: l.id,
    dateExecution: l.date_execution,
    dateDenouement: l.date_denouement,
    quantite: nb(l.quantite),
    note: l.note ?? "",
  };
}

function versOperation(l: Ligne, executions: Execution[]): OperationMarche {
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
    instrument: l.instrument as Instrument,
    validite: (l.validite === "revocation90" ? "revocation90" : "jour") as Validite,
    code: l.code ?? "",
    libelle: l.libelle ?? "",
    sgi: l.sgi ?? "",
    compteReglement: l.compte_reglement ?? "",
    note: l.note ?? "",
    executions,
    ...base,
    montant: montantOperation(base),
  };
}

/** Une opération, augmentée du fonds auquel elle appartient. */
export type OperationAvecFonds = OperationMarche & {
  fondsId: string;
  fondsNom: string;
};

/** Exécutions d'un lot d'ordres, groupées par ordre et triées par date. */
async function chargerExecutions(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  operationIds: string[],
): Promise<Map<string, Execution[]>> {
  const parOperation = new Map<string, Execution[]>();
  if (operationIds.length === 0) return parOperation;

  const { data } = await supabase
    .from("fund_market_executions")
    .select(COLS_EXECUTION)
    .in("operation_id", operationIds)
    .order("date_execution");

  for (const brut of (data ?? []) as unknown as LigneExecution[]) {
    const liste = parOperation.get(brut.operation_id) ?? [];
    liste.push(versExecution(brut));
    parOperation.set(brut.operation_id, liste);
  }
  return parOperation;
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
      .select(COLS_OPERATION)
      .eq("fund_id", fundId)
      .order("date_operation", { ascending: false })
      .order("created_at", { ascending: false });

    const lignes = (data ?? []) as unknown as Ligne[];
    const executions = await chargerExecutions(
      supabase,
      lignes.map((l) => l.id),
    );
    return lignes.map((l) => versOperation(l, executions.get(l.id) ?? []));
  },
);

/**
 * Toutes les opérations du gérant, tous fonds confondus.
 *
 * L'écran de saisie est INTERFONDS : le gérant y passe ses opérations de la
 * journée, qui portent souvent sur plusieurs fonds à la fois — une même
 * adjudication se répartit entre les portefeuilles.
 *
 * La RLS restreint déjà la lecture aux fonds du gérant : pas de filtre à
 * ajouter ici, et surtout pas de liste d'identifiants à tenir à jour.
 */
export const loadToutesOperationsMarche = cache(
  async (): Promise<OperationAvecFonds[]> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("fund_market_operations")
      .select(`${COLS_OPERATION}, managed_funds(nom)`)
      .order("date_operation", { ascending: false })
      .order("created_at", { ascending: false });

    type LigneJointe = Ligne & {
      fund_id: string;
      managed_funds: { nom: string } | { nom: string }[] | null;
    };
    const lignes = (data ?? []) as unknown as LigneJointe[];
    const executions = await chargerExecutions(
      supabase,
      lignes.map((l) => l.id),
    );

    return lignes.map((l) => {
      // PostgREST renvoie la jointure tantôt en objet, tantôt en tableau selon
      // qu'il la juge unique : les deux formes se rencontrent, on les couvre.
      const f = Array.isArray(l.managed_funds) ? l.managed_funds[0] : l.managed_funds;
      return {
        ...versOperation(l, executions.get(l.id) ?? []),
        fondsId: l.fund_id,
        fondsNom: f?.nom ?? "—",
      };
    });
  },
);

/**
 * Montants par POSTE puis par COMPTE DE RÈGLEMENT, à une date d'arrêté.
 *
 * Deux contributions par ordre, et deux règles de date différentes :
 *
 *  - la part NON SERVIE pèse dès la date de l'ordre et jusqu'à sa péremption.
 *    Elle ne se dénoue pas : un ordre non exécuté n'a rien à régler, et lui
 *    inventer une date de règlement l'aurait fait entrer ou sortir du point
 *    pour de mauvaises raisons.
 *  - chaque EXÉCUTION pèse à la date de dénouement qui lui est propre. Un
 *    ordre servi en trois fois se règle en trois fois, à trois dates.
 */
export function agregerParPoste(
  operations: OperationMarche[],
  dateArrete: string | null,
): Map<string, Map<string, number>> {
  const parPoste = new Map<string, Map<string, number>>();

  const ajouter = (poste: string | null, compte: string, montant: number) => {
    if (!poste || montant === 0) return;
    let parCompte = parPoste.get(poste);
    if (!parCompte) {
      parCompte = new Map<string, number>();
      parPoste.set(poste, parCompte);
    }
    parCompte.set(compte, (parCompte.get(compte) ?? 0) + montant);
  };

  for (const o of operations) {
    // Montant unitaire, frais et courus compris au prorata : c'est ce qui
    // permet de répartir un ordre partiellement servi sans recalculer les
    // frais sur chaque morceau.
    const parTitre = o.quantite > 0 ? o.montant / o.quantite : 0;

    // ── La part servie, exécution par exécution ──────────────────────────
    for (const e of o.executions) {
      if (dateArrete && e.dateDenouement > dateArrete) continue;
      ajouter(posteRealise(o.description), o.compteReglement, parTitre * e.quantite);
    }

    // ── La part non servie, tant que l'ordre est au carnet ───────────────
    const restante = quantiteRestante(o);
    if (restante <= 0) continue;

    const poste = posteEngage(o.description);
    if (!poste) continue; // une vente non servie n'annonce rien en caisse

    if (dateArrete) {
      // Un ordre passé APRÈS la date d'arrêté n'existe pas encore pour elle ;
      // un ordre périmé ne sera plus servi.
      if (o.dateOperation > dateArrete) continue;
      if (dateLimiteOrdre(o) < dateArrete) continue;
    }
    ajouter(poste, o.compteReglement, parTitre * restante);
  }

  return parPoste;
}

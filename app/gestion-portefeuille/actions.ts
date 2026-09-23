"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import {
  colonnesFonds,
  sansColonnesAbsentes,
  signalerColonneManquante,
} from "./fonds-colonnes";
import {
  rowToFundRecord,
  rowToSgoProfile,
  type FundInput,
  type FundRecord,
  type ManagedFundRow,
  type RatioRow,
  type SgoProfile,
  type SgoProfileRow,
} from "./types";

const CATEGORIES = ["Obligataire", "Monétaire", "Diversifié", "Actions", "Actifs non cotés"];
const FUND_TYPES = ["FCP", "FCPE", "SICAV", "FCPR"];
const CURRENCIES = ["XOF", "EUR", "USD"];

function parseNum(s: string): number | null {
  const t = (s ?? "").trim().replace(",", ".");
  // UNE CASE VIDE N'EST PAS UN ZÉRO.
  //
  // `Number("")` vaut 0, et `Number.isFinite(0)` est vrai : tout seuil laissé
  // blanc se stockait donc comme un plancher à 0 %. D'où des ratios affichés
  // « 0 – 70 % » là où le catalogue ne prévoit qu'un plafond, et un minimum
  // qui n'a aucun sens — aucune exposition ne peut être négative.
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

// Les colonnes lues dependent de l'etat des migrations : cf. `fonds-colonnes`.

// Normalise les ratios saisis (réglementaires + contractuels) pour le stockage
// JSONB : seuils texte -> nombre|null, on ne conserve que les lignes ayant un
// libellé et au moins un seuil renseigné (calque la logique Aurore).
function normalizeRatios(input: FundInput["ratios"]): RatioRow[] {
  return (input ?? [])
    .map((r): RatioRow | null => {
      const libelle = (r.libelle ?? "").trim();
      const seuilMin = parseNum(r.seuilMin ?? "");
      const seuilMax = parseNum(r.seuilMax ?? "");
      if (!libelle || (seuilMin == null && seuilMax == null)) return null;
      return {
        categorie: r.categorie === "CONTRACTUEL" ? "CONTRACTUEL" : "REGLEMENTAIRE",
        groupe: (r.groupe ?? "").trim() || null,
        libelle,
        metrique: (r.metrique ?? "").trim() || null,
        base: (r.base ?? "").trim() || null,
        seuil_min: seuilMin,
        seuil_max: seuilMax,
        unite: (r.unite ?? "%").trim() || "%",
        article: (r.article ?? "").trim() || null,
      };
    })
    .filter((r): r is RatioRow => r !== null);
}

export async function saveSgoProfileAction(
  input: SgoProfile
): Promise<ActionResult<SgoProfile>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté pour enregistrer la SGO." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "La dénomination de la SGO est obligatoire." };
  const baseCurrency = CURRENCIES.includes(input.baseCurrency) ? input.baseCurrency : "XOF";

  const { data, error } = await supabase
    .from("sgo_profiles")
    .upsert(
      {
        owner_id: user.id,
        name,
        agrement: (input.agrement ?? "").trim(),
        contact_email: (input.contactEmail ?? "").trim(),
        base_currency: baseCurrency,
      },
      { onConflict: "owner_id" }
    )
    .select("name, agrement, contact_email, base_currency")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/gestion-portefeuille/parametres");
  return { ok: true, data: rowToSgoProfile(data as SgoProfileRow) };
}

// Valide un FundInput et construit la ligne à persister (colonnes managed_funds
// hors owner_id). Partagé entre création et modification.
type FundColumns = {
  nom: string;
  abreviation: string;
  categorie: string;
  type: string;
  vl_initiale: number | null;
  devise: string;
  objectif_perf: string;
  droit_entree: number | null;
  droit_sortie: number | null;
  frais_gestion: number | null;
  compte_frais_gestion: string | null;
  benchmark: { weight: number; ref: string }[];
  ratios: ReturnType<typeof normalizeRatios>;
};

function buildFundColumns(input: FundInput): { error: string } | { row: FundColumns } {
  const nom = (input.nom ?? "").trim();
  if (!nom) return { error: "Le nom du fonds est obligatoire." };
  if (!CATEGORIES.includes(input.categorie)) return { error: "Catégorie invalide." };
  if (!FUND_TYPES.includes(input.type)) return { error: "Type d'OPC invalide." };
  const devise = CURRENCIES.includes(input.devise) ? input.devise : "XOF";

  let vlInitiale: number | null = null;
  const vlRaw = (input.vlInitiale ?? "").trim();
  if (vlRaw !== "") {
    const v = parseNum(vlRaw);
    if (v == null || v <= 0) return { error: "La VL initiale doit être un nombre positif." };
    vlInitiale = v;
  }

  // LES FRAIS SONT DES DÉCIMAUX. Un 2 saisi pour 2 % multiplierait le droit
  // d'entrée par cinquante sur toutes les souscriptions qui le reprennent : on
  // refuse plutôt que d'avaler.
  const frais: Record<"droit_entree" | "droit_sortie" | "frais_gestion", number | null> = {
    droit_entree: null,
    droit_sortie: null,
    frais_gestion: null,
  };
  for (const [cle, brut, libelle] of [
    ["droit_entree", input.droitEntree, "droit d'entrée"],
    ["droit_sortie", input.droitSortie, "droit de sortie"],
    ["frais_gestion", input.fraisGestion, "frais de gestion"],
  ] as const) {
    const t = (brut ?? "").trim();
    if (t === "") continue;
    const v = parseNum(t);
    if (v == null || v < 0 || v > 1)
      return { error: `Le ${libelle} se saisit en pourcentage, entre 0 et 100.` };
    frais[cle] = v;
  }

  const benchmark = (input.benchmark ?? [])
    .filter((c) => (c.ref ?? "").trim() !== "")
    .map((c) => ({ weight: parseNum(c.weight) ?? 0, ref: c.ref.trim() }));
  if (benchmark.length > 0) {
    const total = benchmark.reduce((s, c) => s + c.weight, 0);
    if (Math.abs(total - 100) >= 0.1)
      return { error: "Le total des poids du benchmark doit faire 100 %." };
  }

  return {
    row: {
      nom,
      abreviation: (input.abreviation ?? "").trim(),
      categorie: input.categorie,
      type: input.type,
      vl_initiale: vlInitiale,
      devise,
      objectif_perf: (input.objectifPerf ?? "").trim(),
      ...frais,
      // Vide vaut NULL : « aucun compte choisi » et « chaîne vide » diraient
      // la même chose au tableau, autant n'en garder qu'une forme.
      compte_frais_gestion: (input.compteFraisGestion ?? "").trim() || null,
      benchmark,
      ratios: normalizeRatios(input.ratios),
    },
  };
}

export async function createFundAction(input: FundInput): Promise<ActionResult<FundRecord>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté pour créer un fonds." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const built = buildFundColumns(input);
  if ("error" in built) return { ok: false, error: built.error };

  // UNE MIGRATION EN RETARD NE DOIT PAS INTERDIRE DE CREER UN FONDS : on ecrit
  // sans la colonne que la base ne connait pas encore, et l'on reessaie si
  // c'est elle qu'elle refuse. Cf. `fonds-colonnes`.
  const ecrire = () =>
    supabase
      .from("managed_funds")
      .insert({ owner_id: user.id, ...sansColonnesAbsentes(built.row) })
      .select(colonnesFonds())
      .single();

  let { data, error } = await ecrire();
  if (error && signalerColonneManquante(error.message)) {
    ({ data, error } = await ecrire());
  }

  if (error) return { ok: false, error: error.message };

  revalidatePath("/gestion-portefeuille/parametres");
  revalidatePath("/gestion-portefeuille");
  return { ok: true, data: rowToFundRecord(data as unknown as ManagedFundRow) };
}

export async function updateFundAction(
  id: string,
  input: FundInput,
): Promise<ActionResult<FundRecord>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté pour modifier un fonds." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const built = buildFundColumns(input);
  if ("error" in built) return { ok: false, error: built.error };

  const ecrire = () =>
    supabase
      .from("managed_funds")
      .update(sansColonnesAbsentes(built.row))
      .eq("id", id)
      .eq("owner_id", user.id)
      .select(colonnesFonds())
      .single();

  let { data, error } = await ecrire();
  if (error && signalerColonneManquante(error.message)) {
    ({ data, error } = await ecrire());
  }

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Fonds introuvable." };

  revalidatePath("/gestion-portefeuille/parametres");
  revalidatePath("/gestion-portefeuille");
  revalidatePath(`/gestion-portefeuille/fonds/${id}`);
  return { ok: true, data: rowToFundRecord(data as unknown as ManagedFundRow) };
}

export async function deleteFundAction(id: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  // La RLS garantit déjà qu'on ne supprime que ses propres fonds ; on filtre
  // aussi sur owner_id par sécurité défensive.
  const { error } = await supabase
    .from("managed_funds")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/gestion-portefeuille/parametres");
  revalidatePath("/gestion-portefeuille");
  return { ok: true, data: null };
}

"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";
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
  const v = Number((s ?? "").trim().replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

const ROW_COLS =
  "id, nom, abreviation, categorie, type, vl_initiale, devise, objectif_perf, benchmark, ratios";

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

  revalidatePath("/pros/fund-management/parametres");
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

  const built = buildFundColumns(input);
  if ("error" in built) return { ok: false, error: built.error };

  const { data, error } = await supabase
    .from("managed_funds")
    .insert({ owner_id: user.id, ...built.row })
    .select(ROW_COLS)
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/pros/fund-management/parametres");
  revalidatePath("/pros/fund-management");
  return { ok: true, data: rowToFundRecord(data as ManagedFundRow) };
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

  const built = buildFundColumns(input);
  if ("error" in built) return { ok: false, error: built.error };

  const { data, error } = await supabase
    .from("managed_funds")
    .update(built.row)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(ROW_COLS)
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Fonds introuvable." };

  revalidatePath("/pros/fund-management/parametres");
  revalidatePath("/pros/fund-management");
  revalidatePath(`/pros/fund-management/fonds/${id}`);
  return { ok: true, data: rowToFundRecord(data as ManagedFundRow) };
}

export async function deleteFundAction(id: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  // La RLS garantit déjà qu'on ne supprime que ses propres fonds ; on filtre
  // aussi sur owner_id par sécurité défensive.
  const { error } = await supabase
    .from("managed_funds")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/pros/fund-management/parametres");
  revalidatePath("/pros/fund-management");
  return { ok: true, data: null };
}

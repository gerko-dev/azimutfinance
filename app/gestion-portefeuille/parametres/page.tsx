import SettingsForm, {
  type BenchmarkOption,
} from "@/components/gestion-portefeuille/SettingsForm";
import { BRVM_INDEX_CODES, BRVM_INDEX_NAMES } from "@/lib/dataLoader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadMyFunds } from "../data";
import { bondBenchmarkOptions } from "../benchmark-refs";
import { rowToSgoProfile, type SgoProfile, type SgoProfileRow } from "../types";
import {
  versPartenaire,
  type LignePartenaire,
  type Partenaire,
} from "../partenaires-types";

export const metadata = {
  title: "Fund management — Paramètres",
};

// Lecture dynamique : la liste des fonds dépend de l'utilisateur connecté.
export const dynamic = "force-dynamic";

// Benchmarks proposés : indices actions BRVM (cotations live + historique Sika)
// puis taux, rendements souverains (par pays & maturité), taux faciaux et
// obligations cotées — cf. benchmark-refs.
function buildBenchmarkOptions(): BenchmarkOption[] {
  const indices: BenchmarkOption[] = BRVM_INDEX_CODES.map((code) => ({
    value: code,
    label: BRVM_INDEX_NAMES[code] ?? code,
    group: "Indices actions BRVM",
  }));
  return [...indices, ...bondBenchmarkOptions()];
}

async function loadSgoProfile(): Promise<SgoProfile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("sgo_profiles")
    .select("name, agrement, contact_email, base_currency")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return rowToSgoProfile(data as SgoProfileRow);
}

/**
 * Partenaires de marché de la société de gestion.
 *
 * Lus ici plutôt que par une action au montage : le lint du projet interdit
 * un setState dans un effet, et cette liste est petite et stable.
 */
async function loadPartenaires(): Promise<Partenaire[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("market_partners")
    .select(
      "id, kind, nom, agrement, pays, email, telephone, adresse, " +
        "taux_courtage, taux_tps, taux_brvm, referents, actif, note",
    )
    .order("nom");

  // Une erreur rendue comme liste vide se lit « aucun partenaire », ce qui est
  // indiscernable d'un compte qui n'en a pas encore. On la trace.
  if (error) {
    console.error("[gestion-portefeuille] loadPartenaires:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as LignePartenaire[]).map(versPartenaire);
}

export default async function FundManagementSettingsPage() {
  const [initialFunds, initialProfile, initialPartenaires] = await Promise.all([
    loadMyFunds(),
    loadSgoProfile(),
    loadPartenaires(),
  ]);
  return (
    <SettingsForm
      benchmarkOptions={buildBenchmarkOptions()}
      initialFunds={initialFunds}
      initialProfile={initialProfile}
      initialPartenaires={initialPartenaires}
    />
  );
}

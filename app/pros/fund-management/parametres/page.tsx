import SettingsForm, {
  type BenchmarkOption,
} from "@/components/pros/fund-management/SettingsForm";
import { BRVM_INDEX_CODES, BRVM_INDEX_NAMES } from "@/lib/dataLoader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadMyFunds } from "../data";
import { bondBenchmarkOptions } from "../benchmark-refs";
import { rowToSgoProfile, type SgoProfile, type SgoProfileRow } from "../types";

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

export default async function FundManagementSettingsPage() {
  const [initialFunds, initialProfile] = await Promise.all([loadMyFunds(), loadSgoProfile()]);
  return (
    <SettingsForm
      benchmarkOptions={buildBenchmarkOptions()}
      initialFunds={initialFunds}
      initialProfile={initialProfile}
    />
  );
}

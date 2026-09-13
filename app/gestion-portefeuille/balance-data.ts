// Loader serveur de la dernière balance importée d'un fonds.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FundBalance } from "./balance-actions";
import type { PortfolioSection } from "./portfolio-types";

export async function loadLatestBalance(fundId: string): Promise<FundBalance | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("fund_balances")
    .select("as_of_date, allocation, gain, total")
    .eq("fund_id", fundId)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    asOfDate: data.as_of_date,
    allocation: data.allocation as Record<PortfolioSection, number>,
    gain: data.gain as Record<PortfolioSection, number>,
    total: Number(data.total) || 0,
  };
}

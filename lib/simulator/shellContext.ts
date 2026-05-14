import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentSeason,
  getLeaderboard,
  getMyOrders,
  getMyPortfolio,
  getPortfolioSnapshot,
} from "./queries";
import type { PortfolioSnapshot, Season } from "./types";

/**
 * Contexte partagé pour toutes les pages du simulateur (sidebar).
 * Retourne null si l'utilisateur n'est pas authentifié, qu'il n'y a pas
 * de saison active/intro, ou qu'il n'a pas de portefeuille sur cette saison.
 *
 * Les pages doivent gérer ces 3 cas en rendant un message d'erreur OU en
 * redirigeant vers l'inscription / l'accueil.
 */
export type ShellContext = {
  userId: string;
  season: Season;
  snapshot: PortfolioSnapshot;
  myRank: number | null;
  totalPlayers: number;
  openOrdersCount: number;
};

export async function loadShellContext(): Promise<{
  ok: true;
  ctx: ShellContext;
} | {
  ok: false;
  reason: "no_auth" | "no_season" | "intro" | "no_portfolio";
  season?: Season | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no_auth" };

  const season = await getCurrentSeason();
  if (!season) return { ok: false, reason: "no_season" };

  // Pendant la Course à l'introduction, on garde l'UX focalisée (pas de
  // sidebar). Les pages doivent rediriger vers /academie/simulateur dans
  // ce cas — où le branchement vers IntroPhaseView se fait.
  if (season.status === "intro") return { ok: false, reason: "intro", season };

  const portfolio = await getMyPortfolio(season.id);
  if (!portfolio) return { ok: false, reason: "no_portfolio", season };

  const [snapshot, leaderboard, orders] = await Promise.all([
    getPortfolioSnapshot(season.id),
    getLeaderboard(season.id),
    getMyOrders(season.id),
  ]);
  if (!snapshot) return { ok: false, reason: "no_portfolio", season };

  const myRank = leaderboard.find((e) => e.userId === user.id)?.rank ?? null;
  const totalPlayers = leaderboard.length;
  const openOrdersCount = orders.open.length;

  return {
    ok: true,
    ctx: {
      userId: user.id,
      season,
      snapshot,
      myRank,
      totalPlayers,
      openOrdersCount,
    },
  };
}

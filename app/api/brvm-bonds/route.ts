import { NextResponse } from "next/server";
import {
  getBrvmBondsSnapshot,
  getLastBrvmBondsDiag,
  refreshBrvmBondsSnapshot,
} from "@/lib/brvm/liveBonds";

export const dynamic = "force-dynamic";

/**
 * GET /api/brvm-bonds — snapshot des cours obligations BRVM en direct.
 *
 * Query :
 *   ?code=EOM.O10  → renvoie un seul quote (par mnemonique BRVM)
 *   ?refresh=1     → force un refetch (bypass cache)
 *   ?debug=1       → ajoute des stats
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const refresh = url.searchParams.get("refresh") === "1";
  const debug = url.searchParams.get("debug") === "1";

  const snapshot = refresh
    ? await refreshBrvmBondsSnapshot()
    : await getBrvmBondsSnapshot();

  if (code) {
    const q = snapshot.quotes.find((qq) => qq.code === code.toUpperCase());
    return NextResponse.json(
      {
        fetchedAt: snapshot.fetchedAt,
        sessionLabel: snapshot.sessionLabel,
        isClosed: snapshot.isClosed,
        quote: q ?? null,
        ...(debug && {
          debug: {
            totalQuotes: snapshot.quotes.length,
            firstCodes: snapshot.quotes.slice(0, 5).map((x) => x.code),
            askedCode: code.toUpperCase(),
            lastFetchDiag: getLastBrvmBondsDiag(),
          },
        }),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      },
    );
  }

  return NextResponse.json(
    debug
      ? {
          ...snapshot,
          debug: {
            totalQuotes: snapshot.quotes.length,
            firstCodes: snapshot.quotes.slice(0, 5).map((x) => x.code),
            lastFetchDiag: getLastBrvmBondsDiag(),
          },
        }
      : snapshot,
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    },
  );
}

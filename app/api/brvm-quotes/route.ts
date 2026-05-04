import { NextResponse } from "next/server";
import {
  getBrvmSnapshot,
  getLastBrvmDiag,
  refreshBrvmSnapshot,
} from "@/lib/brvm/liveQuotes";

export const dynamic = "force-dynamic";

/**
 * GET /api/brvm-quotes — snapshot des cours actions BRVM en direct.
 *
 * Query :
 *   ?code=SNTS  → renvoie un seul quote
 *   ?refresh=1  → force un refetch (bypass cache)
 *   ?debug=1    → ajoute des stats (nb quotes, premier code, etc.)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const refresh = url.searchParams.get("refresh") === "1";
  const debug = url.searchParams.get("debug") === "1";

  const snapshot = refresh ? await refreshBrvmSnapshot() : await getBrvmSnapshot();

  if (code) {
    const q = snapshot.quotes.find(
      (qq) => qq.code === code.toUpperCase(),
    );
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
            lastFetchDiag: getLastBrvmDiag(),
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
            lastFetchDiag: getLastBrvmDiag(),
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

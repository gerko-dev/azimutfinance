import { NextResponse } from "next/server";
import {
  getBrvmIndicesSnapshot,
  getLastBrvmIndicesDiag,
  refreshBrvmIndicesSnapshot,
} from "@/lib/brvm/liveIndices";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const debug = url.searchParams.get("debug") === "1";

  const snapshot = refresh
    ? await refreshBrvmIndicesSnapshot()
    : await getBrvmIndicesSnapshot();

  return NextResponse.json(
    debug
      ? { ...snapshot, debug: { ...getLastBrvmIndicesDiag() } }
      : snapshot,
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    },
  );
}

import { NextResponse } from "next/server";
import {
  searchProInstruments,
  type ProSearchKind,
} from "@/lib/proSearch";

export const runtime = "nodejs";
// L'index est memoize au niveau module ; on garde un cache HTTP court pour
// permettre au navigateur de profiter du debounce sans hit-replay reseau.
export const revalidate = 60;

const VALID_KINDS: ProSearchKind[] = [
  "stock",
  "listed-bond",
  "sovereign",
  "fund",
  "fx",
  "commodity",
  "country",
];

/**
 * GET /api/pros/search?q=...&limit=20&kinds=stock,fx
 *
 * Recherche unifiee sur tous les instruments du site (actions, obligations
 * cotees/non cotees, OPCVM, FX, matieres premieres, etats UEMOA).
 *
 * Reponse : { results: Array<{ id, kind, label, sublabel, href }> }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limitRaw = url.searchParams.get("limit");
  const kindsRaw = url.searchParams.get("kinds");

  if (q.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
  const kinds = kindsRaw
    ? (kindsRaw
        .split(",")
        .map((k) => k.trim())
        .filter((k) => (VALID_KINDS as string[]).includes(k)) as ProSearchKind[])
    : undefined;

  const results = searchProInstruments(q, {
    limit: Number.isFinite(limit) ? limit : 20,
    kinds,
  });

  return NextResponse.json({ results });
}

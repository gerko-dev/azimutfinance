import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Formation } from "@/lib/formations";
import type {
  FormationRow,
  InscriptionRow,
  InscriptionStatus,
  MyInscriptionRow,
} from "./types";

function rowToFormation(r: FormationRow): Formation {
  const pricing =
    r.pricing_type === "gratuit"
      ? { type: "gratuit" as const }
      : r.pricing_type === "premium"
      ? { type: "premium" as const, priceFcfa: r.price_fcfa }
      : { type: "certifiant" as const, priceFcfa: r.price_fcfa };

  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    shortDescription: r.short_description,
    longDescription: r.long_description,
    level: r.level,
    format: r.format,
    category: r.category,
    modules: Array.isArray(r.modules) ? r.modules : [],
    prerequisites: r.prerequisites ?? [],
    outcomes: r.outcomes ?? [],
    pricing,
    tags: r.tags ?? [],
    accentColor: r.accent_color ?? undefined,
    instructor:
      r.instructor_name && r.instructor_title
        ? { name: r.instructor_name, title: r.instructor_title }
        : undefined,
    featured: r.featured,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
  };
}

/** Public : liste des formations publiées, ordonnée par updated_at desc. */
export async function listPublishedFormations(): Promise<Formation[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("formations")
    .select("*")
    .not("published_at", "is", null)
    .order("featured", { ascending: false })
    .order("updated_at", { ascending: false });
  return ((data as FormationRow[] | null) ?? []).map(rowToFormation);
}

/** Public : recupere une formation par slug (publiée seulement). */
export async function getPublishedFormationBySlug(
  slug: string,
): Promise<Formation | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("formations")
    .select("*")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .maybeSingle();
  return data ? rowToFormation(data as FormationRow) : null;
}

/** Admin : recupere n'importe quelle formation par id (incluant brouillons). */
export async function getFormationById(id: string): Promise<Formation | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("formations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ? rowToFormation(data as FormationRow) : null;
}

/** Admin : liste complete (incluant brouillons), via RPC. */
export async function listAllFormations(opts: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<Formation[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_list_formations", {
    p_search: opts.search ?? null,
    p_limit: opts.limit ?? 100,
    p_offset: opts.offset ?? 0,
  });
  return ((data as FormationRow[] | null) ?? []).map(rowToFormation);
}

/** Admin : liste les inscriptions, optionnellement filtrees par formation/statut. */
export async function listInscriptions(opts: {
  formationId?: string;
  status?: InscriptionStatus;
  limit?: number;
  offset?: number;
}): Promise<InscriptionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_list_inscriptions", {
    p_formation_id: opts.formationId ?? null,
    p_status: opts.status ?? null,
    p_limit: opts.limit ?? 200,
    p_offset: opts.offset ?? 0,
  });
  return (data as InscriptionRow[] | null) ?? [];
}

/** User connecte : ses propres inscriptions. */
export async function getMyInscriptions(): Promise<MyInscriptionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("my_inscriptions");
  return (data as MyInscriptionRow[] | null) ?? [];
}

/** User : verifie s'il est deja inscrit a une formation. */
export async function getMyInscriptionForFormation(
  formationId: string,
): Promise<MyInscriptionRow | null> {
  const all = await getMyInscriptions();
  return all.find((i) => i.formation_id === formationId) ?? null;
}

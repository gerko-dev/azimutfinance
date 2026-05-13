import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DemandesProList from "./DemandesProList";

export const dynamic = "force-dynamic";

const STATUSES = ["new", "contacted", "converted", "rejected"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<Status, string> = {
  new: "Nouvelles",
  contacted: "Contactées",
  converted: "Converties",
  rejected: "Rejetées",
};

export type ProDemoRow = {
  id: string;
  organization: string;
  contact_name: string;
  contact_role: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  team_size: string | null;
  use_cases: string[] | null;
  message: string | null;
  status: Status;
  source: string | null;
  internal_note: string | null;
  resolved_at: string | null;
  created_at: string;
};

export default async function AdminDemandesProPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin(2);
  const sp = await searchParams;
  const filter: Status = (STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as Status)
    : "new";

  const supabase = await createSupabaseServerClient();

  const { data: countsRaw } = await supabase
    .from("pro_demo_requests")
    .select("status");
  const counts: Record<Status, number> = {
    new: 0,
    contacted: 0,
    converted: 0,
    rejected: 0,
  };
  for (const r of (countsRaw ?? []) as { status: Status }[]) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  const { data: rowsRaw } = await supabase
    .from("pro_demo_requests")
    .select(
      "id, organization, contact_name, contact_role, email, phone, country, team_size, use_cases, message, status, source, internal_note, resolved_at, created_at",
    )
    .eq("status", filter)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (rowsRaw ?? []) as ProDemoRow[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Demandes Pro</h1>
        <p className="text-sm text-slate-500 mt-1">
          Demandes de démo soumises depuis{" "}
          <code className="text-xs">/demande-demo-pro</code>. Change le statut
          au fur et à mesure du suivi commercial.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/demandes-pro?status=${s}`}
            className={`bg-white border rounded-lg p-3 transition ${
              s === filter
                ? "border-slate-900"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              {STATUS_LABEL[s]}
            </div>
            <div className="text-xl font-bold tabular-nums mt-1 text-slate-900">
              {counts[s] ?? 0}
            </div>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          Aucune demande {STATUS_LABEL[filter].toLowerCase()}.
        </div>
      ) : (
        <DemandesProList rows={rows} />
      )}
    </div>
  );
}

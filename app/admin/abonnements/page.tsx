import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PLANS, formatFcfa } from "@/lib/premium/plans";
import { PAYMENT_METHOD_LABEL } from "@/lib/premium/payment-methods";
import AdminAbonnementRow from "./AdminAbonnementRow";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "validated", "cancelled", "rejected"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<Status, string> = {
  pending: "En attente",
  validated: "Validés",
  cancelled: "Annulés",
  rejected: "Rejetés",
};
const STATUS_COLOR: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-800",
  validated: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-700",
  rejected: "bg-rose-100 text-rose-700",
};

// status DB de pending_payments : 'pending' | 'validated' | 'rejected'
// (le statut 'cancelled' de l'UI est derive de subscriptions.status)
type PendingPaymentDbStatus = "pending" | "validated" | "rejected";

type PendingPayment = {
  id: string;
  user_id: string;
  plan: string;
  amount_fcfa: number;
  payment_method: string;
  payer_phone: string;
  transaction_ref: string | null;
  proof_path: string | null;
  status: PendingPaymentDbStatus;
  rejection_reason: string | null;
  created_at: string;
  validated_at: string | null;
  subscription_id: string | null;
};

type SubInfo = {
  id: string;
  status: "active" | "expired" | "cancelled";
  current_period_end: string;
};

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
};

export default async function AdminAbonnementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { level } = await requireAdmin(2);
  const isL1 = level === 1;
  const sp = await searchParams;
  const filter: Status = (STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as Status)
    : "pending";

  const supabase = await createSupabaseServerClient();

  // 1. Counts par statut UI (4 chips).
  //    Les pending_payments status='validated' se repartissent en
  //    UI "Validés" (sub active/expiree) vs UI "Annulés" (sub cancelled).
  const { data: countsRaw } = await supabase
    .from("pending_payments")
    .select("status, subscription_id");
  const countRows = (countsRaw ?? []) as {
    status: PendingPaymentDbStatus;
    subscription_id: string | null;
  }[];
  const allSubIds = Array.from(
    new Set(countRows.map((r) => r.subscription_id).filter((s): s is string => !!s)),
  );
  const cancelledSubIds = new Set<string>();
  if (allSubIds.length > 0) {
    const { data: cancelledRaw } = await supabase
      .from("subscriptions")
      .select("id")
      .in("id", allSubIds)
      .eq("status", "cancelled");
    for (const s of (cancelledRaw ?? []) as { id: string }[]) {
      cancelledSubIds.add(s.id);
    }
  }
  const counts: Record<Status, number> = {
    pending: 0,
    validated: 0,
    cancelled: 0,
    rejected: 0,
  };
  for (const r of countRows) {
    if (r.status === "validated") {
      if (r.subscription_id && cancelledSubIds.has(r.subscription_id)) {
        counts.cancelled += 1;
      } else {
        counts.validated += 1;
      }
    } else if (r.status === "pending" || r.status === "rejected") {
      counts[r.status] += 1;
    }
  }

  // 2. Liste filtree.
  //    pending / rejected : filtre direct sur pending_payments.status.
  //    validated / cancelled : on prend tous les status='validated' puis on
  //    partitionne selon que la sub liee est annulee ou non.
  const dbStatusFilter: PendingPaymentDbStatus =
    filter === "cancelled" ? "validated" : filter;

  const { data: rowsRaw } = await supabase
    .from("pending_payments")
    .select(
      "id, user_id, plan, amount_fcfa, payment_method, payer_phone, transaction_ref, proof_path, status, rejection_reason, created_at, validated_at, subscription_id",
    )
    .eq("status", dbStatusFilter)
    .order("created_at", { ascending: filter === "pending" })
    .limit(200);

  let rows = (rowsRaw ?? []) as PendingPayment[];

  // Charge toutes les subs concernees pour cet ecran (statut + echeance)
  const subsById = new Map<string, SubInfo>();
  if (filter === "validated" || filter === "cancelled") {
    const subIds = rows
      .map((r) => r.subscription_id)
      .filter((s): s is string => !!s);
    if (subIds.length > 0) {
      const { data: subsRaw } = await supabase
        .from("subscriptions")
        .select("id, status, current_period_end")
        .in("id", subIds);
      for (const s of (subsRaw ?? []) as SubInfo[]) {
        subsById.set(s.id, s);
      }
    }

    // Partitionne : Annules = sub.status='cancelled' ; Valides = le reste
    rows = rows.filter((r) => {
      const sub = r.subscription_id ? subsById.get(r.subscription_id) : null;
      const isCancelled = sub?.status === "cancelled";
      return filter === "cancelled" ? isCancelled : !isCancelled;
    });
  }

  // 3. Profils des users concernes (1 requete batch)
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const profilesById = new Map<string, Profile>();
  if (userIds.length > 0) {
    const { data: profilesRaw } = await supabase
      .from("profiles")
      .select("id, email, username, full_name")
      .in("id", userIds);
    for (const p of (profilesRaw ?? []) as Profile[]) {
      profilesById.set(p.id, p);
    }
  }

  // 4. Signed URLs pour les justificatifs (TTL 1h)
  const proofUrls = new Map<string, string>();
  const proofPaths = rows.map((r) => r.proof_path).filter((p): p is string => !!p);
  if (proofPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("payment-proofs")
      .createSignedUrls(proofPaths, 3600);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) proofUrls.set(s.path, s.signedUrl);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Abonnements Premium</h1>
        <p className="text-sm text-slate-500 mt-1">
          Paiements mobile money déclarés par les utilisateurs. Vérifie le
          montant sur ton historique Wave / OM / MTN, puis valide ou rejette.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/abonnements?status=${s}`}
            className={`bg-white border rounded-lg p-3 transition ${
              s === filter ? "border-slate-900" : "border-slate-200 hover:border-slate-300"
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

      {/* Liste */}
      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          Aucun paiement {STATUS_LABEL[filter].toLowerCase()}.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const profile = profilesById.get(row.user_id);
            const plan = PLANS[row.plan as keyof typeof PLANS];
            const proofUrl = row.proof_path ? proofUrls.get(row.proof_path) : undefined;
            const sub = row.subscription_id
              ? subsById.get(row.subscription_id)
              : undefined;
            const subActive =
              sub?.status === "active" &&
              new Date(sub.current_period_end).getTime() > Date.now();
            // Statut UI : 'cancelled' si la sub liee est annulee, sinon = status DB
            const uiStatus: Status =
              sub?.status === "cancelled" ? "cancelled" : row.status;
            return (
              <div
                key={row.id}
                className="bg-white border border-slate-200 rounded-lg p-4 md:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {profile?.full_name ||
                          profile?.username ||
                          profile?.email ||
                          row.user_id.slice(0, 8)}
                      </span>
                      <span
                        className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${STATUS_COLOR[uiStatus]}`}
                      >
                        {STATUS_LABEL[uiStatus]}
                      </span>
                    </div>
                    {profile?.email && (
                      <div className="text-xs text-slate-500 mb-2">
                        {profile.email}
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs mb-3">
                      <Field
                        label="Plan"
                        value={`${plan?.label ?? row.plan} — ${formatFcfa(row.amount_fcfa)}`}
                      />
                      <Field
                        label="Moyen"
                        value={
                          PAYMENT_METHOD_LABEL[
                            row.payment_method as keyof typeof PAYMENT_METHOD_LABEL
                          ] ?? row.payment_method
                        }
                      />
                      <Field label="Émetteur" value={row.payer_phone} mono />
                      <Field
                        label="Référence"
                        value={row.transaction_ref || "—"}
                        mono
                      />
                      <Field
                        label="Déclaré le"
                        value={new Date(row.created_at).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      />
                      {row.validated_at && (
                        <Field
                          label="Traité le"
                          value={new Date(row.validated_at).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        />
                      )}
                      {row.status === "validated" && sub && (
                        <Field
                          label={
                            sub.status === "cancelled"
                              ? "Annulé le"
                              : subActive
                                ? "Expire le"
                                : "Expiré le"
                          }
                          value={new Date(sub.current_period_end).toLocaleString(
                            "fr-FR",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        />
                      )}
                      {proofUrl && (
                        <div className="col-span-2 md:col-span-2">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">
                            Justificatif
                          </div>
                          <a
                            href={proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-700 hover:underline break-all"
                          >
                            Voir le justificatif →
                          </a>
                        </div>
                      )}
                    </div>

                    {row.status === "rejected" && row.rejection_reason && (
                      <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-2">
                        <strong>Motif :</strong> {row.rejection_reason}
                      </div>
                    )}
                  </div>

                  {row.status === "pending" && (
                    <div className="shrink-0">
                      <AdminAbonnementRow pendingId={row.id} />
                    </div>
                  )}
                  {row.status === "validated" && row.subscription_id && (
                    <div className="shrink-0">
                      {subActive ? (
                        isL1 ? (
                          <AdminAbonnementRow
                            pendingId={row.id}
                            subscriptionId={row.subscription_id}
                            mode="active-sub"
                          />
                        ) : (
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            Actif
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                          {sub?.status === "cancelled"
                            ? "Annulé"
                            : "Expiré"}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={`text-xs text-slate-900 ${mono ? "font-mono tabular-nums" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

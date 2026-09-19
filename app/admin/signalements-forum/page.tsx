import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ForumReportsList from "./ForumReportsList";

export const dynamic = "force-dynamic";

const STATUSES = ["open", "actioned", "dismissed", "all"] as const;
type StatusFilter = (typeof STATUSES)[number];

const STATUS_LABEL: Record<StatusFilter, string> = {
  open: "Ouverts",
  actioned: "Traités",
  dismissed: "Rejetés",
  all: "Tous",
};

const REPORT_CATEGORY_LABEL: Record<string, string> = {
  spam: "Spam",
  harcelement: "Harcèlement",
  insulte: "Insulte",
  arnaque: "Arnaque",
  autre: "Autre",
};

export type ForumReportRow = {
  id: string;
  target_type: "topic" | "reply";
  topic_id: string | null;
  reply_id: string | null;
  category: string;
  note: string | null;
  status: "open" | "actioned" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  resolution_action: string | null;
  reporter_id: string;
  reporter_username: string | null;
  reporter_full_name: string | null;
  reporter_email: string | null;
  topic_title: string | null;
  topic_slug: string | null;
  topic_category_slug: string | null;
  topic_author_id: string | null;
  reply_author_id: string | null;
  body_preview: string | null;
  reports_total: number;
};

type RawReport = {
  id: string;
  target_type: "topic" | "reply";
  topic_id: string | null;
  reply_id: string | null;
  reporter_id: string;
  category: string;
  note: string | null;
  status: "open" | "actioned" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  resolution_action: string | null;
};

type RawProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  email: string | null;
};

type RawTopic = {
  id: string;
  title: string;
  slug: string;
  body: string;
  author_id: string;
  category_id: string;
};

type RawReply = {
  id: string;
  body: string;
  author_id: string;
  topic_id: string;
};

type RawCategory = { id: string; slug: string };

export default async function AdminForumReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin(3);
  const sp = await searchParams;
  const filter: StatusFilter = (STATUSES as readonly string[]).includes(
    sp.status ?? "",
  )
    ? (sp.status as StatusFilter)
    : "open";

  const supabase = await createSupabaseServerClient();

  // 1. Compteurs par statut (toute la table, pour les chips)
  const { data: countsRaw, error: countsErr } = await supabase
    .from("forum_reports")
    .select("status");
  const counts: Record<StatusFilter, number> = {
    open: 0,
    actioned: 0,
    dismissed: 0,
    all: 0,
  };
  for (const r of (countsRaw ?? []) as { status: StatusFilter }[]) {
    if (r.status in counts) counts[r.status] += 1;
    counts.all += 1;
  }

  // 2. Liste filtree (lecture directe via RLS admin)
  let reportsQuery = supabase
    .from("forum_reports")
    .select(
      "id, target_type, topic_id, reply_id, reporter_id, category, note, status, created_at, resolved_at, resolution_action",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter !== "all") reportsQuery = reportsQuery.eq("status", filter);

  const { data: reportsRaw, error: reportsErr } = await reportsQuery;
  const reports = (reportsRaw as RawReport[] | null) ?? [];

  // 3. Resolution des cibles : topics + replies + categories + reporters
  const topicIds = new Set<string>();
  const replyIds = new Set<string>();
  const reporterIds = new Set<string>();
  for (const r of reports) {
    if (r.topic_id) topicIds.add(r.topic_id);
    if (r.reply_id) replyIds.add(r.reply_id);
    reporterIds.add(r.reporter_id);
  }

  // Replies → besoin du topic parent aussi
  const repliesById = new Map<string, RawReply>();
  if (replyIds.size > 0) {
    const { data } = await supabase
      .from("forum_replies")
      .select("id, body, author_id, topic_id")
      .in("id", Array.from(replyIds));
    for (const r of (data ?? []) as RawReply[]) {
      repliesById.set(r.id, r);
      topicIds.add(r.topic_id);
    }
  }

  // Topics
  const topicsById = new Map<string, RawTopic>();
  if (topicIds.size > 0) {
    const { data } = await supabase
      .from("forum_topics")
      .select("id, title, slug, body, author_id, category_id")
      .in("id", Array.from(topicIds));
    for (const t of (data ?? []) as RawTopic[]) {
      topicsById.set(t.id, t);
    }
  }

  // Categories
  const categoryIds = new Set<string>(
    Array.from(topicsById.values()).map((t) => t.category_id),
  );
  const catsById = new Map<string, RawCategory>();
  if (categoryIds.size > 0) {
    const { data } = await supabase
      .from("forum_categories")
      .select("id, slug")
      .in("id", Array.from(categoryIds));
    for (const c of (data ?? []) as RawCategory[]) {
      catsById.set(c.id, c);
    }
  }

  // Reporters
  const profilesById = new Map<string, RawProfile>();
  if (reporterIds.size > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, full_name, email")
      .in("id", Array.from(reporterIds));
    for (const p of (data ?? []) as RawProfile[]) {
      profilesById.set(p.id, p);
    }
  }

  // Total signalements par cible (pour afficher "X signalements" si > 1)
  // On compte sur l'ensemble de la table (pas seulement le filtre)
  const totalsByTarget = new Map<string, number>();
  const { data: totalsRaw } = await supabase
    .from("forum_reports")
    .select("target_type, topic_id, reply_id");
  for (const t of (totalsRaw ?? []) as {
    target_type: "topic" | "reply";
    topic_id: string | null;
    reply_id: string | null;
  }[]) {
    const key = `${t.target_type}:${t.topic_id ?? t.reply_id ?? ""}`;
    totalsByTarget.set(key, (totalsByTarget.get(key) ?? 0) + 1);
  }

  // 4. Compose les rows enrichies
  const rows: ForumReportRow[] = reports.map((r) => {
    const reporter = profilesById.get(r.reporter_id);
    let topic: RawTopic | undefined;
    let reply: RawReply | undefined;
    let preview: string | null = null;
    let topicAuthorId: string | null = null;
    let replyAuthorId: string | null = null;
    if (r.target_type === "topic" && r.topic_id) {
      topic = topicsById.get(r.topic_id);
      if (topic) {
        preview = topic.body.slice(0, 240);
        topicAuthorId = topic.author_id;
      }
    } else if (r.target_type === "reply" && r.reply_id) {
      reply = repliesById.get(r.reply_id);
      if (reply) {
        topic = topicsById.get(reply.topic_id);
        preview = reply.body.slice(0, 240);
        replyAuthorId = reply.author_id;
        if (topic) topicAuthorId = topic.author_id;
      }
    }
    const cat = topic ? catsById.get(topic.category_id) : null;
    const targetId = r.topic_id ?? r.reply_id ?? "";
    const totalKey = `${r.target_type}:${targetId}`;

    return {
      id: r.id,
      target_type: r.target_type,
      topic_id: r.topic_id ?? topic?.id ?? null,
      reply_id: r.reply_id,
      category: r.category,
      note: r.note,
      status: r.status,
      created_at: r.created_at,
      resolved_at: r.resolved_at,
      resolution_action: r.resolution_action,
      reporter_id: r.reporter_id,
      reporter_username: reporter?.username ?? null,
      reporter_full_name: reporter?.full_name ?? null,
      reporter_email: reporter?.email ?? null,
      topic_title: topic?.title ?? null,
      topic_slug: topic?.slug ?? null,
      topic_category_slug: cat?.slug ?? null,
      topic_author_id: topicAuthorId,
      reply_author_id: replyAuthorId,
      body_preview: preview,
      reports_total: totalsByTarget.get(totalKey) ?? 1,
    };
  });

  // Bandeau d'erreur si une requete a echoue (utile pour debug)
  const errors = [countsErr, reportsErr].filter(Boolean);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Signalements forum
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Signalements de topics et réponses depuis le Forum investisseurs.
          Vous pouvez rejeter le signalement, verrouiller le topic ou
          supprimer le contenu (audit consigné).
        </p>
      </div>

      {errors.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800">
          {errors.map((e, i) => (
            <div key={i}>Erreur Supabase : {e?.message}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/signalements-forum?status=${s}`}
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
          Aucun signalement {STATUS_LABEL[filter].toLowerCase()}.
        </div>
      ) : (
        <ForumReportsList rows={rows} categoryLabels={REPORT_CATEGORY_LABEL} />
      )}
    </div>
  );
}

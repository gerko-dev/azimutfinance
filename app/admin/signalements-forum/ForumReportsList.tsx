"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  resolveForumReportAction,
  type ResolveAction,
} from "./actions";
import type { ForumReportRow } from "./page";

const STATUS_COLOR: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  actioned: "bg-emerald-100 text-emerald-800",
  dismissed: "bg-slate-200 text-slate-700",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Ouvert",
  actioned: "Traité",
  dismissed: "Rejeté",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reporterLabel(r: ForumReportRow): string {
  return (
    r.reporter_full_name ||
    r.reporter_username ||
    r.reporter_email ||
    r.reporter_id.slice(0, 8)
  );
}

export default function ForumReportsList({
  rows,
  categoryLabels,
}: {
  rows: ForumReportRow[];
  categoryLabels: Record<string, string>;
}) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <ReportCard
          key={r.id}
          row={r}
          categoryLabel={categoryLabels[r.category] ?? r.category}
        />
      ))}
    </div>
  );
}

function ReportCard({
  row,
  categoryLabel,
}: {
  row: ForumReportRow;
  categoryLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ResolveAction | null>(null);
  const [note, setNote] = useState("");

  function execute(action: ResolveAction) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("report_id", row.id);
      fd.set("action", action);
      if (note.trim()) fd.set("note", note.trim());
      const res = await resolveForumReportAction(fd);
      if (res.ok) {
        setConfirming(null);
        setNote("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const topicHref = row.topic_id
    ? `/communaute/forum/t/${row.topic_id}`
    : null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-semibold bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
              {categoryLabel}
            </span>
            <span
              className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                STATUS_COLOR[row.status] ?? "bg-slate-200 text-slate-700"
              }`}
            >
              {STATUS_LABEL[row.status] ?? row.status}
            </span>
            <span className="text-[10px] uppercase font-medium text-slate-500">
              {row.target_type === "topic" ? "Topic" : "Réponse"}
            </span>
            {row.reports_total > 1 && (
              <span className="text-[10px] uppercase font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                {row.reports_total} signalements
              </span>
            )}
          </div>
          <div className="text-sm font-semibold text-slate-900">
            {row.topic_title ?? "Discussion introuvable"}
          </div>
          {row.topic_category_slug && (
            <div className="text-[11px] text-slate-500 mt-0.5">
              Catégorie : {row.topic_category_slug}
            </div>
          )}
        </div>
        <div className="text-right shrink-0 text-[11px] text-slate-500">
          Signalé le {fmtDateTime(row.created_at)}
          <div>par {reporterLabel(row)}</div>
        </div>
      </div>

      {row.body_preview && (
        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 whitespace-pre-wrap mb-3">
          {row.body_preview}
          {row.body_preview.length >= 240 && "…"}
        </div>
      )}

      {row.note && (
        <div className="text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded p-3 mb-3">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-rose-700 mb-0.5">
            Motif du reporter
          </div>
          {row.note}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        {topicHref ? (
          <Link
            href={topicHref}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-700 hover:underline"
          >
            Voir la discussion ↗
          </Link>
        ) : (
          <span className="text-xs text-slate-400">Lien indisponible</span>
        )}

        {row.status === "open" && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setConfirming("dismiss")}
              disabled={pending}
              className="px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 disabled:opacity-60"
            >
              Rejeter
            </button>
            {row.target_type === "topic" && (
              <button
                type="button"
                onClick={() => setConfirming("lock_topic")}
                disabled={pending}
                className="px-3 py-1.5 text-xs rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 disabled:opacity-60"
              >
                Verrouiller
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirming("delete_content")}
              disabled={pending}
              className="px-3 py-1.5 text-xs rounded-md bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-60"
            >
              Supprimer le contenu
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
          <div className="text-xs text-slate-700">
            {confirming === "dismiss" && "Rejeter ce signalement ?"}
            {confirming === "lock_topic" &&
              "Verrouiller cette discussion ? Plus aucune réponse ne sera acceptée."}
            {confirming === "delete_content" &&
              `Supprimer définitivement ${row.target_type === "topic" ? "la discussion" : "la réponse"} ?`}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note de résolution (optionnel)…"
            className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {error && <div className="text-xs text-rose-700">{error}</div>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setConfirming(null);
                setNote("");
                setError(null);
              }}
              disabled={pending}
              className="px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-slate-700"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => execute(confirming)}
              disabled={pending}
              className={`px-3 py-1.5 text-xs rounded-md text-white disabled:opacity-60 ${
                confirming === "delete_content"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : confirming === "lock_topic"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-slate-900 hover:bg-slate-800"
              }`}
            >
              {pending ? "…" : "Confirmer"}
            </button>
          </div>
        </div>
      )}

      {row.status !== "open" && row.resolution_action && (
        <div className="mt-3 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
          Résolu le{" "}
          {row.resolved_at ? fmtDateTime(row.resolved_at) : "—"} ·{" "}
          <span className="font-medium">{row.resolution_action}</span>
        </div>
      )}
    </div>
  );
}

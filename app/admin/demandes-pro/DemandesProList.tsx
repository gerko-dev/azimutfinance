"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setProDemoStatusAction,
  type ProDemoStatus,
} from "./actions";
import type { ProDemoRow } from "./page";

const STATUS_OPTIONS: { value: ProDemoStatus; label: string; color: string }[] =
  [
    { value: "new", label: "Nouvelle", color: "bg-blue-100 text-blue-800" },
    {
      value: "contacted",
      label: "Contactée",
      color: "bg-amber-100 text-amber-800",
    },
    {
      value: "converted",
      label: "Convertie",
      color: "bg-emerald-100 text-emerald-800",
    },
    {
      value: "rejected",
      label: "Rejetée",
      color: "bg-rose-100 text-rose-700",
    },
  ];

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DemandesProList({ rows }: { rows: ProDemoRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <DemandeCard key={row.id} row={row} />
      ))}
    </div>
  );
}

function DemandeCard({ row }: { row: ProDemoRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<ProDemoStatus>(row.status);
  const [note, setNote] = useState(row.internal_note ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", row.id);
      fd.set("status", status);
      fd.set("internal_note", note);
      const res = await setProDemoStatusAction(fd);
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-base font-semibold text-slate-900 truncate">
              {row.organization}
            </span>
            <StatusBadge status={row.status} />
            {row.source && (
              <span className="text-[10px] uppercase font-medium text-slate-400">
                source : {row.source}
              </span>
            )}
          </div>
          <div className="text-sm text-slate-700">
            {row.contact_name}
            {row.contact_role && (
              <span className="text-slate-500"> · {row.contact_role}</span>
            )}
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-500 shrink-0">
          Reçue le {fmtDateTime(row.created_at)}
          {row.resolved_at && (
            <div>Traitée le {fmtDateTime(row.resolved_at)}</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs mb-3">
        <Field
          label="Email"
          value={
            <a
              href={`mailto:${row.email}`}
              className="text-blue-700 hover:underline break-all"
            >
              {row.email}
            </a>
          }
        />
        {row.phone && <Field label="Téléphone" value={row.phone} mono />}
        {row.country && <Field label="Pays" value={row.country} />}
        {row.team_size && <Field label="Équipe" value={row.team_size} />}
        {row.use_cases && row.use_cases.length > 0 && (
          <div className="sm:col-span-2 md:col-span-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              Cas d&apos;usage
            </div>
            <div className="flex flex-wrap gap-1.5">
              {row.use_cases.map((u) => (
                <span
                  key={u}
                  className="inline-block text-[11px] bg-slate-100 text-slate-700 rounded-full px-2 py-0.5"
                >
                  {u}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {row.message && (
        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 whitespace-pre-wrap mb-3">
          {row.message}
        </div>
      )}

      {row.internal_note && !editing && (
        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-3 mb-3">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 mb-0.5">
            Note interne
          </div>
          {row.internal_note}
        </div>
      )}

      {editing ? (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`inline-flex items-center gap-2 text-xs border rounded-full px-3 py-1.5 cursor-pointer ${
                  status === opt.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name={`status-${row.id}`}
                  value={opt.value}
                  checked={status === opt.value}
                  onChange={() => setStatus(opt.value)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note interne (optionnelle)…"
            className="w-full text-xs border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {error && <div className="text-xs text-rose-700">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setStatus(row.status);
                setNote(row.internal_note ?? "");
                setError(null);
              }}
              disabled={pending}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-blue-700 hover:underline"
          >
            Changer le statut / ajouter une note →
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ProDemoStatus }) {
  const opt = STATUS_OPTIONS.find((o) => o.value === status);
  return (
    <span
      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${opt?.color ?? "bg-slate-200 text-slate-700"}`}
    >
      {opt?.label ?? status}
    </span>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">
        {label}
      </div>
      <div className={`text-xs text-slate-900 ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { reportForumItemAction } from "@/lib/forum/actions";
import { REPORT_CATEGORIES, type ForumReportCategoryCode } from "@/lib/forum/types";

export default function ReportButton({
  targetType,
  targetId,
}: {
  targetType: "topic" | "reply";
  targetId: string;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ForumReportCategoryCode>("spam");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("target_type", targetType);
      fd.set("target_id", targetId);
      fd.set("category", category);
      if (note.trim()) fd.set("note", note.trim());
      const res = await reportForumItemAction(fd);
      if (res.ok) {
        setDone(true);
      } else {
        setError(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-slate-400 hover:text-rose-700"
      >
        Signaler
      </button>
    );
  }

  if (done) {
    return (
      <span className="text-[11px] text-emerald-700">
        ✓ Signalé. Merci, un modérateur va examiner.
      </span>
    );
  }

  return (
    <div className="w-full bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2">
      <div className="text-xs font-semibold text-slate-700">
        Signaler ce contenu
      </div>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as ForumReportCategoryCode)}
        className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white"
      >
        {REPORT_CATEGORIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Précisez (optionnel, max 500 caractères)…"
        maxLength={500}
        className="w-full text-xs border border-slate-300 rounded px-2 py-1.5"
      />
      {error && <div className="text-xs text-rose-700">{error}</div>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setNote("");
            setError(null);
          }}
          disabled={pending}
          className="px-3 py-1.5 rounded text-xs font-medium bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-3 py-1.5 rounded text-xs font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
        >
          {pending ? "Envoi…" : "Envoyer le signalement"}
        </button>
      </div>
    </div>
  );
}

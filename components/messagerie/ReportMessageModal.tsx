"use client";

import { useEffect, useState, useTransition } from "react";
import { reportMessage } from "@/lib/messagerie/actions";
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABEL,
  type ReportCategory,
} from "@/lib/messagerie/types";

type Props = {
  messageId: string;
  bodyPreview: string;
  onClose: () => void;
  onSuccess: () => void;
};

export default function ReportMessageModal({
  messageId,
  bodyPreview,
  onClose,
  onSuccess,
}: Props) {
  const [category, setCategory] = useState<ReportCategory>("spam");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  function submit() {
    setError(null);
    startSubmit(async () => {
      const res = await reportMessage({ messageId, category, note });
      if (res.ok) {
        onSuccess();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Signaler un message"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Signaler ce message
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Un modérateur examinera ton signalement. L&apos;auteur du message
            n&apos;est pas notifié.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {bodyPreview && (
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2 italic line-clamp-3">
              « {bodyPreview} »
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Motif
            </label>
            <div className="mt-1.5 grid grid-cols-1 gap-1.5">
              {REPORT_CATEGORIES.map((c) => (
                <label
                  key={c}
                  className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm ${
                    category === c
                      ? "border-blue-500 bg-blue-50 text-slate-900"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-category"
                    value={c}
                    checked={category === c}
                    onChange={() => setCategory(c)}
                    className="accent-blue-600"
                  />
                  <span>{REPORT_CATEGORY_LABEL[c]}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="report-note"
              className="text-xs font-semibold text-slate-700 uppercase tracking-wide"
            >
              Précisions (optionnel)
            </label>
            <textarea
              id="report-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              maxLength={500}
              rows={3}
              placeholder="Donne du contexte aux modérateurs si nécessaire."
              className="mt-1.5 w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-slate-500 resize-none"
            />
            <div className="text-[10px] text-slate-400 text-right mt-0.5 tabular-nums">
              {note.length}/500
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm text-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="text-sm bg-rose-600 hover:bg-rose-700 text-white font-medium px-3 py-1.5 rounded disabled:opacity-50"
          >
            {submitting ? "Envoi..." : "Envoyer le signalement"}
          </button>
        </div>
      </div>
    </div>
  );
}

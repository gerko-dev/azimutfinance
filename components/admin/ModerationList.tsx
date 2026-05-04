"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMessage, deleteConversation } from "@/lib/admin/actions";
import type { AdminMessage } from "@/lib/admin/types";
import { fmtDateTime } from "./format";

export default function ModerationList({
  messages,
  myLevel,
}: {
  messages: AdminMessage[];
  myLevel: 1 | 2 | 3;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<
    | { type: "message"; id: string }
    | { type: "conversation"; id: string; messageId: string }
    | null
  >(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const canDeleteConv = myLevel <= 2;

  function execute() {
    if (!confirm) return;
    if (!reason.trim()) {
      setFeedback({ ok: false, msg: "La raison est obligatoire." });
      return;
    }
    startTransition(async () => {
      const res =
        confirm.type === "message"
          ? await deleteMessage({ messageId: confirm.id, reason: reason.trim() })
          : await deleteConversation({
              conversationId: confirm.id,
              reason: reason.trim(),
            });
      if (res.ok) {
        setFeedback({
          ok: true,
          msg: confirm.type === "message" ? "Message supprimé." : "Conversation supprimée.",
        });
        setConfirm(null);
        setReason("");
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div>
      {feedback && (
        <div
          className={`mb-3 text-xs px-3 py-2 rounded border ${
            feedback.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {messages.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-12">
            Aucun message dans la base.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {messages.map((m) => (
              <li key={m.id} className="px-4 py-3 hover:bg-slate-50 group">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {m.sender_username
                        ? `@${m.sender_username}`
                        : m.sender_email ?? `User ${m.sender_id.slice(0, 6)}`}
                    </span>
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {fmtDateTime(m.created_at)}
                    </span>
                  </div>
                  <div className="flex gap-2 opacity-60 group-hover:opacity-100 shrink-0">
                    <button
                      onClick={() => {
                        setConfirm({ type: "message", id: m.id });
                        setReason("");
                      }}
                      className="text-[11px] text-rose-700 hover:underline"
                    >
                      Supprimer message
                    </button>
                    {canDeleteConv && (
                      <button
                        onClick={() => {
                          setConfirm({
                            type: "conversation",
                            id: m.conversation_id,
                            messageId: m.id,
                          });
                          setReason("");
                        }}
                        className="text-[11px] text-rose-900 hover:underline"
                      >
                        Suppr. conversation
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                  {m.body}
                </p>
                <div className="text-[10px] text-slate-400 mt-1.5 font-mono">
                  conv: {m.conversation_id.slice(0, 8)}…
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal de confirmation */}
      {confirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5">
            <h3 className="text-base font-semibold text-slate-900">
              Supprimer{" "}
              {confirm.type === "message" ? "ce message" : "toute cette conversation"} ?
            </h3>
            <p className="text-xs text-slate-600 mt-2">
              {confirm.type === "message"
                ? "Le message sera définitivement supprimé. L'auteur ne sera pas notifié automatiquement."
                : "Tous les messages de la conversation seront supprimés en cascade. Les deux participants perdront l'accès."}
            </p>
            <label className="block mt-3 text-[11px] font-medium text-slate-700 uppercase tracking-wide">
              Raison (obligatoire)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex : contenu inapproprié, spam, signalement utilisateur…"
              className="w-full mt-1 text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:border-slate-500"
              rows={3}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setConfirm(null)}
                className="text-sm px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={execute}
                disabled={isPending}
                className="text-sm px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded disabled:opacity-50"
              >
                {isPending ? "Suppression…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

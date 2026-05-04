"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  banUser,
  suspendUser,
  unsuspendUser,
  warnUser,
} from "@/lib/admin/actions";
import type { AdminLevel } from "@/lib/admin/types";

type Sanctions = {
  is_suspended: boolean;
  is_banned: boolean;
  suspended_until: string | null;
  suspension_reason: string | null;
  warning_count: number;
  history: Array<{
    action: string;
    reason: string | null;
    metadata: Record<string, unknown> | null;
    actor_role: string | null;
    created_at: string;
  }>;
};

const ACTION_LABEL: Record<string, string> = {
  warn_user: "⚠️ Avertissement",
  suspend_user: "⏸️ Suspension",
  unsuspend_user: "▶️ Réactivation",
  ban_user: "🚫 Ban permanent",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  if (iso === "infinity") return "Permanent";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hh}:${mm}`;
}

function fmtRelativeFuture(iso: string | null): string {
  if (!iso) return "—";
  if (iso === "infinity" || new Date(iso).getFullYear() > 3000) return "Permanent (ban)";
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `dans ${days} j ${hours} h`;
  return `dans ${hours} h`;
}

export default function SanctionsPanel({
  userId,
  isMe,
  targetIsAdmin,
  myLevel,
  sanctions,
}: {
  userId: string;
  isMe: boolean;
  targetIsAdmin: boolean;
  myLevel: AdminLevel;
  sanctions: Sanctions;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const [openModal, setOpenModal] = useState<"warn" | "suspend" | "ban" | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(7);

  const canWarn = myLevel <= 2 && !isMe && !targetIsAdmin;
  const canSuspend = myLevel <= 2 && !isMe && !targetIsAdmin;
  const canUnsuspend = myLevel <= 2 && sanctions.is_suspended;
  const canBan = myLevel === 1 && !isMe;

  function closeModal() {
    setOpenModal(null);
    setReason("");
    setMessage("");
  }

  function executeWarn() {
    if (!reason.trim()) {
      setFeedback({ ok: false, msg: "Une raison est obligatoire." });
      return;
    }
    start(async () => {
      const res = await warnUser({
        userId,
        reason: reason.trim(),
        message: message.trim() || undefined,
      });
      if (res.ok) {
        setFeedback({ ok: true, msg: "Avertissement enregistré." });
        closeModal();
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function executeSuspend() {
    if (!reason.trim()) {
      setFeedback({ ok: false, msg: "Une raison est obligatoire." });
      return;
    }
    if (days < 1) {
      setFeedback({ ok: false, msg: "Durée minimum 1 jour." });
      return;
    }
    if (myLevel === 2 && days > 30) {
      setFeedback({ ok: false, msg: "Le niveau 2 ne peut pas dépasser 30 jours." });
      return;
    }
    const until = new Date();
    until.setDate(until.getDate() + days);
    start(async () => {
      const res = await suspendUser({
        userId,
        until: until.toISOString(),
        reason: reason.trim(),
      });
      if (res.ok) {
        setFeedback({ ok: true, msg: `Compte suspendu jusqu'au ${until.toLocaleDateString("fr-FR")}.` });
        closeModal();
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function executeBan() {
    if (!reason.trim()) {
      setFeedback({ ok: false, msg: "Une raison est obligatoire." });
      return;
    }
    start(async () => {
      const res = await banUser({ userId, reason: reason.trim() });
      if (res.ok) {
        setFeedback({ ok: true, msg: "Compte banni définitivement." });
        closeModal();
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function executeUnsuspend() {
    start(async () => {
      const res = await unsuspendUser({ userId });
      if (res.ok) {
        setFeedback({ ok: true, msg: "Suspension levée." });
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base font-semibold text-slate-900">Sanctions</h2>
      </div>
      <div className="p-4 space-y-4">
        {feedback && (
          <div
            className={`text-xs px-3 py-2 rounded border ${
              feedback.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {feedback.msg}
          </div>
        )}

        {/* Statut courant */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatusCard
            label="Avertissements"
            value={String(sanctions.warning_count)}
            tone={sanctions.warning_count > 0 ? "warn" : "neutral"}
          />
          <StatusCard
            label="Suspension"
            value={
              sanctions.is_banned
                ? "Bannissement permanent"
                : sanctions.is_suspended
                ? `Suspendu (${fmtRelativeFuture(sanctions.suspended_until)})`
                : "Compte actif"
            }
            tone={
              sanctions.is_banned ? "danger" : sanctions.is_suspended ? "warn" : "ok"
            }
            sub={
              sanctions.is_suspended && sanctions.suspended_until
                ? `jusqu'au ${fmtDateTime(sanctions.suspended_until)}`
                : undefined
            }
          />
          <StatusCard
            label="Raison actuelle"
            value={sanctions.suspension_reason || "—"}
            tone="neutral"
          />
        </div>

        {/* Boutons d'action */}
        {!isMe && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            {canWarn && (
              <button
                onClick={() => setOpenModal("warn")}
                className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 font-medium px-3 py-1.5 rounded"
              >
                ⚠️ Avertir
              </button>
            )}
            {canSuspend && !sanctions.is_banned && (
              <button
                onClick={() => setOpenModal("suspend")}
                className="text-xs bg-orange-100 hover:bg-orange-200 text-orange-900 font-medium px-3 py-1.5 rounded"
              >
                ⏸️ Suspendre
              </button>
            )}
            {canUnsuspend && (
              <button
                onClick={executeUnsuspend}
                disabled={pending}
                className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-medium px-3 py-1.5 rounded disabled:opacity-50"
              >
                ▶️ Lever la suspension
              </button>
            )}
            {canBan && !sanctions.is_banned && (
              <button
                onClick={() => setOpenModal("ban")}
                className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-900 font-medium px-3 py-1.5 rounded"
              >
                🚫 Bannir définitivement
              </button>
            )}
            {targetIsAdmin && (
              <span className="text-[11px] text-slate-500 italic self-center">
                Sanctions désactivées sur les comptes admin (sauf via niveau 1).
              </span>
            )}
          </div>
        )}

        {/* Historique */}
        {sanctions.history.length > 0 && (
          <div className="pt-3 border-t border-slate-100">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
              Historique des sanctions ({sanctions.history.length})
            </div>
            <ul className="space-y-1.5">
              {sanctions.history.map((h, i) => (
                <li key={i} className="text-xs text-slate-700 flex items-center gap-3">
                  <span className="text-[10px] text-slate-400 w-32 shrink-0 tabular-nums">
                    {fmtDateTime(h.created_at)}
                  </span>
                  <span className="font-medium">
                    {ACTION_LABEL[h.action] ?? h.action}
                  </span>
                  {h.reason && (
                    <span className="text-slate-500 italic truncate">
                      « {h.reason} »
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* MODAL : avertir */}
      {openModal === "warn" && (
        <Modal title="Émettre un avertissement" onClose={closeModal}>
          <Field label="Raison (obligatoire)">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Ex : ton inapproprié dans la messagerie le 02/05"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </Field>
          <Field label="Message au membre (optionnel)">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Sera affiché côté membre."
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </Field>
          <ModalActions
            onCancel={closeModal}
            onConfirm={executeWarn}
            confirmLabel="Envoyer l'avertissement"
            confirmClass="bg-amber-600 hover:bg-amber-700"
            pending={pending}
          />
        </Modal>
      )}

      {/* MODAL : suspendre */}
      {openModal === "suspend" && (
        <Modal title="Suspendre temporairement" onClose={closeModal}>
          <Field label="Durée">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={myLevel === 2 ? 30 : 365}
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
              />
              <span className="text-sm text-slate-700">
                jour{days > 1 ? "s" : ""}
              </span>
              <span className="text-[11px] text-slate-500 ml-2">
                {myLevel === 2 ? "(L2 max 30 j)" : "(L1 illimité)"}
              </span>
            </div>
          </Field>
          <Field label="Raison (obligatoire)">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ex : violation répétée des CGU, harcèlement..."
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </Field>
          <p className="text-[11px] text-slate-500">
            Le membre sera redirigé vers une page de suspension dès sa prochaine
            requête. La suspension lèvera automatiquement à la date d&apos;échéance.
          </p>
          <ModalActions
            onCancel={closeModal}
            onConfirm={executeSuspend}
            confirmLabel={`Suspendre ${days} jour${days > 1 ? "s" : ""}`}
            confirmClass="bg-orange-600 hover:bg-orange-700"
            pending={pending}
          />
        </Modal>
      )}

      {/* MODAL : bannir */}
      {openModal === "ban" && (
        <Modal title="Bannissement permanent" onClose={closeModal}>
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            Le bannissement est permanent. Le compte n&apos;est PAS supprimé (les
            données restent), mais le membre ne peut plus accéder au site. Pour une
            suppression définitive, utilise le bouton &laquo; Supprimer &raquo; en
            haut.
          </p>
          <Field label="Raison (obligatoire)">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ex : récidive après suspension, fraude avérée..."
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </Field>
          <ModalActions
            onCancel={closeModal}
            onConfirm={executeBan}
            confirmLabel="Bannir définitivement"
            confirmClass="bg-rose-600 hover:bg-rose-700"
            pending={pending}
          />
        </Modal>
      )}
    </section>
  );
}

function StatusCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "ok" | "warn" | "danger" | "neutral";
}) {
  const colors = {
    ok: "bg-emerald-50 border-emerald-200 text-emerald-800",
    warn: "bg-amber-50 border-amber-200 text-amber-800",
    danger: "bg-rose-50 border-rose-200 text-rose-800",
    neutral: "bg-slate-50 border-slate-200 text-slate-800",
  };
  return (
    <div className={`border rounded p-2.5 ${colors[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide font-semibold opacity-80">
        {label}
      </div>
      <div className="text-sm font-semibold mt-1 break-words">{value}</div>
      {sub && <div className="text-[10px] opacity-70 mt-0.5">{sub}</div>}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-700 uppercase tracking-wide mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function ModalActions({
  onCancel,
  onConfirm,
  confirmLabel,
  confirmClass,
  pending,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmClass: string;
  pending: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
      <button
        onClick={onCancel}
        disabled={pending}
        className="text-sm px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
      >
        Annuler
      </button>
      <button
        onClick={onConfirm}
        disabled={pending}
        className={`text-sm px-3 py-1.5 text-white rounded font-medium disabled:opacity-50 ${confirmClass}`}
      >
        {pending ? "..." : confirmLabel}
      </button>
    </div>
  );
}

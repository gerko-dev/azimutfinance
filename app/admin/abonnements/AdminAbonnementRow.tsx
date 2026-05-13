"use client";

import { useState, useTransition } from "react";
import {
  validatePendingPaymentAction,
  rejectPendingPaymentAction,
  adminCancelSubscriptionAction,
} from "./actions";

type Props =
  | {
      pendingId: string;
      mode?: "pending";
      subscriptionId?: undefined;
    }
  | {
      pendingId: string;
      mode: "active-sub";
      subscriptionId: string;
    };

export default function AdminAbonnementRow(props: Props) {
  const { pendingId } = props;
  const isActiveSub = props.mode === "active-sub";
  const [pending, startTransition] = useTransition();
  const [uiMode, setUiMode] = useState<"idle" | "rejecting" | "cancelling">(
    "idle",
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleValidate() {
    setError(null);
    if (!confirm("Valider ce paiement et activer l'abonnement Premium ?")) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("pending_id", pendingId);
      const res = await validatePendingPaymentAction(fd);
      if (!res.ok) setError(res.error);
    });
  }

  function handleReject() {
    setError(null);
    if (!reason.trim()) {
      setError("Saisis un motif.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("pending_id", pendingId);
      fd.set("reason", reason.trim());
      const res = await rejectPendingPaymentAction(fd);
      if (!res.ok) {
        setError(res.error);
      } else {
        setUiMode("idle");
        setReason("");
      }
    });
  }

  function handleCancelSub() {
    setError(null);
    if (!isActiveSub) return;
    if (!reason.trim()) {
      setError("Saisis un motif.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("subscription_id", props.subscriptionId);
      fd.set("reason", reason.trim());
      const res = await adminCancelSubscriptionAction(fd);
      if (!res.ok) {
        setError(res.error);
      } else {
        setUiMode("idle");
        setReason("");
      }
    });
  }

  if (isActiveSub) {
    return (
      <div className="flex flex-col gap-2">
        {uiMode === "idle" ? (
          <button
            type="button"
            onClick={() => setUiMode("cancelling")}
            disabled={pending}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-white text-rose-700 border border-rose-300 hover:bg-rose-50 disabled:opacity-60"
          >
            Annuler l&apos;abonnement
          </button>
        ) : (
          <div className="flex flex-col gap-2 w-64">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Motif (consigné dans l'audit log)…"
              className="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancelSub}
                disabled={pending}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {pending ? "…" : "Confirmer l'annulation"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUiMode("idle");
                  setReason("");
                  setError(null);
                }}
                disabled={pending}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Retour
              </button>
            </div>
          </div>
        )}
        {error && <div className="text-xs text-rose-700">{error}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {uiMode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleValidate}
            disabled={pending}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? "…" : "✓ Valider"}
          </button>
          <button
            type="button"
            onClick={() => setUiMode("rejecting")}
            disabled={pending}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-white text-rose-700 border border-rose-300 hover:bg-rose-50 disabled:opacity-60"
          >
            ✗ Rejeter
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Motif (visible par l'utilisateur)…"
            className="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReject}
              disabled={pending}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {pending ? "…" : "Confirmer le rejet"}
            </button>
            <button
              type="button"
              onClick={() => {
                setUiMode("idle");
                setReason("");
                setError(null);
              }}
              disabled={pending}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      {error && <div className="text-xs text-rose-700">{error}</div>}
    </div>
  );
}

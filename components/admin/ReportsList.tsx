"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resolveReport, resolveReportWithSanction } from "@/lib/admin/actions";
import {
  REPORT_CATEGORY_LABEL,
  REPORT_STATUS_LABEL,
  type AdminLevel,
  type AdminReport,
  type ReportStatus,
} from "@/lib/admin/types";
import { fmtDateTime } from "./format";

const CATEGORY_COLOR: Record<keyof typeof REPORT_CATEGORY_LABEL, string> = {
  spam: "bg-slate-100 text-slate-700",
  harcelement: "bg-rose-100 text-rose-800",
  insulte: "bg-orange-100 text-orange-800",
  arnaque: "bg-purple-100 text-purple-800",
  autre: "bg-slate-100 text-slate-600",
};

const STATUS_COLOR: Record<ReportStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  actioned: "bg-emerald-100 text-emerald-800",
  dismissed: "bg-slate-100 text-slate-600",
};

const RESOLUTION_LABEL: Record<string, string> = {
  message_deleted: "Message supprimé",
  user_warned: "Utilisateur averti",
  user_suspended: "Utilisateur suspendu",
  user_banned: "Utilisateur banni",
  no_action: "Aucune action nécessaire",
};

type SanctionKind = "delete_message" | "warn" | "suspend" | "ban" | "none";

export default function ReportsList({
  reports,
  myLevel,
  currentStatus,
}: {
  reports: AdminReport[];
  myLevel: AdminLevel;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [resolveModal, setResolveModal] = useState<
    | { report: AdminReport; mode: "dismiss" | "action" }
    | null
  >(null);
  const [sanctionKind, setSanctionKind] = useState<SanctionKind>("delete_message");
  const [sanctionReason, setSanctionReason] = useState("");
  const [suspendDays, setSuspendDays] = useState(7);
  const [resolutionNote, setResolutionNote] = useState("");

  const canAction = myLevel <= 2;
  const canBan = myLevel === 1;

  function openResolve(report: AdminReport, mode: "dismiss" | "action") {
    setResolveModal({ report, mode });
    // Default to the most common useful sanction available, falling back to "none".
    const initialKind: SanctionKind =
      mode === "action"
        ? report.body_preview
          ? "delete_message"
          : report.sender_id
            ? "warn"
            : "none"
        : "none";
    setSanctionKind(initialKind);
    setSanctionReason("");
    setSuspendDays(7);
    setResolutionNote("");
    setFeedback(null);
  }

  function executeDismiss() {
    if (!resolveModal) return;
    startTransition(async () => {
      const res = await resolveReport({
        reportId: resolveModal.report.id,
        action: "dismiss",
        resolutionNote: resolutionNote.trim() || undefined,
      });
      if (res.ok) {
        setFeedback({ ok: true, msg: "Signalement rejeté." });
        setResolveModal(null);
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function executeAction() {
    if (!resolveModal) return;
    const report = resolveModal.report;
    const reason = sanctionReason.trim();

    if (sanctionKind !== "none" && !reason) {
      setFeedback({ ok: false, msg: "Une raison est obligatoire pour cette sanction." });
      return;
    }
    if (sanctionKind === "suspend") {
      if (suspendDays < 1) {
        setFeedback({ ok: false, msg: "Durée minimum 1 jour." });
        return;
      }
      if (myLevel === 2 && suspendDays > 30) {
        setFeedback({ ok: false, msg: "Le niveau 2 ne peut pas dépasser 30 jours." });
        return;
      }
    }

    let sanction;
    switch (sanctionKind) {
      case "delete_message":
        sanction = {
          kind: "delete_message" as const,
          messageId: report.message_id,
          reason,
        };
        break;
      case "warn":
        if (!report.sender_id) {
          setFeedback({ ok: false, msg: "Auteur du message introuvable." });
          return;
        }
        sanction = { kind: "warn" as const, userId: report.sender_id, reason };
        break;
      case "suspend":
        if (!report.sender_id) {
          setFeedback({ ok: false, msg: "Auteur du message introuvable." });
          return;
        }
        sanction = {
          kind: "suspend" as const,
          userId: report.sender_id,
          reason,
          days: suspendDays,
        };
        break;
      case "ban":
        if (!report.sender_id) {
          setFeedback({ ok: false, msg: "Auteur du message introuvable." });
          return;
        }
        sanction = { kind: "ban" as const, userId: report.sender_id, reason };
        break;
      case "none":
        sanction = { kind: "none" as const };
        break;
    }

    startTransition(async () => {
      const res = await resolveReportWithSanction({
        reportId: report.id,
        sanction,
        resolutionNote: resolutionNote.trim() || undefined,
      });
      if (res.ok) {
        setFeedback({
          ok: true,
          msg:
            sanctionKind === "none"
              ? "Signalement marqué comme traité (aucune sanction)."
              : "Sanction appliquée et signalement marqué comme traité.",
        });
        setResolveModal(null);
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  // Quels choix de sanction proposer dans la modal "action" ?
  const sanctionChoices = resolveModal
    ? buildSanctionChoices(resolveModal.report, myLevel, canBan)
    : [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-xs">
        <span className="text-slate-500">Filtrer :</span>
        {(["open", "actioned", "dismissed", "all"] as const).map((s) => (
          <Link
            key={s}
            href={`/admin/signalements?status=${s}`}
            className={`px-2.5 py-1 rounded ${
              currentStatus === s
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
            }`}
            scroll={false}
          >
            {s === "all" ? "Tous" : REPORT_STATUS_LABEL[s as ReportStatus]}
          </Link>
        ))}
      </div>

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
        {reports.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-12">
            Aucun signalement{currentStatus !== "all" ? ` ${currentStatus === "open" ? "ouvert" : currentStatus === "actioned" ? "traité" : "rejeté"}` : ""}.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {reports.map((r) => (
              <li key={r.id} className="px-4 py-3 hover:bg-slate-50 group">
                <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${CATEGORY_COLOR[r.category]}`}
                    >
                      {REPORT_CATEGORY_LABEL[r.category]}
                    </span>
                    <span
                      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${STATUS_COLOR[r.status]}`}
                    >
                      {REPORT_STATUS_LABEL[r.status]}
                    </span>
                    {r.reports_total > 1 && (
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-rose-200 text-rose-900">
                        {r.reports_total} signalements sur ce message
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {fmtDateTime(r.created_at)}
                    </span>
                  </div>
                  {r.status === "open" && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => openResolve(r, "dismiss")}
                        className="text-[11px] text-slate-700 hover:underline"
                      >
                        Rejeter
                      </button>
                      {canAction && (
                        <button
                          onClick={() => openResolve(r, "action")}
                          className="text-[11px] text-emerald-700 hover:underline"
                        >
                          Marquer traité
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Preview message */}
                <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap break-words italic">
                  « {r.body_preview ?? "(message supprimé)"} »
                </div>

                {/* Méta : reporter / sender */}
                <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-600 flex-wrap">
                  <span>
                    <span className="text-slate-400">Signalé par </span>
                    {r.reporter_id ? (
                      <Link
                        href={`/admin/membres/${r.reporter_id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {r.reporter_username
                          ? `@${r.reporter_username}`
                          : r.reporter_email ?? "?"}
                      </Link>
                    ) : (
                      "?"
                    )}
                  </span>
                  <span>
                    <span className="text-slate-400">Auteur du message </span>
                    {r.sender_id ? (
                      <Link
                        href={`/admin/membres/${r.sender_id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {r.sender_username
                          ? `@${r.sender_username}`
                          : r.sender_email ?? "?"}
                      </Link>
                    ) : (
                      "compte supprimé"
                    )}
                  </span>
                  {r.message_created_at && (
                    <span className="text-slate-400 tabular-nums">
                      Message du {fmtDateTime(r.message_created_at)}
                    </span>
                  )}
                </div>

                {r.note && (
                  <div className="text-[11px] text-slate-700 mt-1.5">
                    <span className="text-slate-400">Précision : </span>
                    {r.note}
                  </div>
                )}

                {r.status !== "open" && (
                  <div className="text-[11px] text-slate-500 mt-2 border-t border-slate-100 pt-1.5">
                    Résolu{" "}
                    {r.resolved_at && (
                      <span className="tabular-nums">
                        le {fmtDateTime(r.resolved_at)}
                      </span>
                    )}
                    {r.resolver_username && (
                      <>
                        {" "}par <span className="font-medium">@{r.resolver_username}</span>
                      </>
                    )}
                    {r.resolution_action && (
                      <>
                        {" · "}
                        <span className="font-medium">
                          {RESOLUTION_LABEL[r.resolution_action] ?? r.resolution_action}
                        </span>
                      </>
                    )}
                    {r.resolution_note && (
                      <>
                        {" · "}
                        <span className="italic">« {r.resolution_note} »</span>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal de résolution */}
      {resolveModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => {
            if (!pending) setResolveModal(null);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">
              {resolveModal.mode === "action"
                ? "Traiter ce signalement"
                : "Rejeter ce signalement"}
            </h3>
            <p className="text-xs text-slate-600 mt-2">
              {resolveModal.mode === "action"
                ? "Choisis la sanction à appliquer. Elle sera exécutée et le signalement sera marqué comme traité en une seule étape."
                : "Le signalement sera classé sans suite. Tu peux ajouter une note interne pour expliquer pourquoi."}
            </p>

            {resolveModal.mode === "action" && (
              <>
                <label className="block mt-3 text-[11px] font-medium text-slate-700 uppercase tracking-wide">
                  Sanction
                </label>
                <div className="mt-1.5 space-y-1">
                  {sanctionChoices.map((c) => {
                    const selected = sanctionKind === c.kind;
                    const disabled = c.disabled !== undefined;
                    return (
                      <label
                        key={c.kind}
                        className={`flex items-start gap-2 px-2.5 py-1.5 rounded border text-sm ${
                          disabled
                            ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                            : selected
                              ? "border-blue-500 bg-blue-50 cursor-pointer"
                              : "border-slate-200 hover:bg-slate-50 cursor-pointer"
                        }`}
                      >
                        <input
                          type="radio"
                          name="sanction-kind"
                          value={c.kind}
                          checked={selected}
                          disabled={disabled}
                          onChange={() => setSanctionKind(c.kind)}
                          className="accent-blue-600 mt-0.5"
                        />
                        <span className="flex-1">
                          <span className="font-medium">{c.label}</span>
                          {(c.hint || c.disabled) && (
                            <span className="block text-[11px] text-slate-500 mt-0.5">
                              {c.disabled ?? c.hint}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {sanctionKind === "suspend" && (
                  <div className="mt-3">
                    <label className="block text-[11px] font-medium text-slate-700 uppercase tracking-wide mb-1">
                      Durée
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={myLevel === 2 ? 30 : 365}
                        value={suspendDays}
                        onChange={(e) =>
                          setSuspendDays(Math.max(1, Number(e.target.value) || 1))
                        }
                        className="w-24 text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
                      />
                      <span className="text-sm text-slate-700">
                        jour{suspendDays > 1 ? "s" : ""}
                      </span>
                      <span className="text-[11px] text-slate-500 ml-2">
                        {myLevel === 2 ? "(L2 max 30 j)" : "(L1 illimité)"}
                      </span>
                    </div>
                  </div>
                )}

                {sanctionKind !== "none" && (
                  <div className="mt-3">
                    <label className="block text-[11px] font-medium text-slate-700 uppercase tracking-wide mb-1">
                      Raison de la sanction (obligatoire, journalisée)
                    </label>
                    <textarea
                      value={sanctionReason}
                      onChange={(e) => setSanctionReason(e.target.value)}
                      rows={2}
                      placeholder={
                        sanctionKind === "delete_message"
                          ? "Ex : insultes répétées en messagerie"
                          : sanctionKind === "warn"
                            ? "Ex : ton inapproprié signalé par 2 membres"
                            : sanctionKind === "suspend"
                              ? "Ex : harcèlement, suspension de 7 jours"
                              : "Ex : récidive après suspension"
                      }
                      className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:border-slate-500"
                    />
                  </div>
                )}
              </>
            )}

            <label className="block mt-3 text-[11px] font-medium text-slate-700 uppercase tracking-wide">
              Note interne (optionnelle, vue par les autres modérateurs)
            </label>
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value.slice(0, 500))}
              placeholder="Contexte additionnel…"
              className="w-full mt-1 text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:border-slate-500"
              rows={2}
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setResolveModal(null)}
                disabled={pending}
                className="text-sm px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={
                  resolveModal.mode === "action" ? executeAction : executeDismiss
                }
                disabled={pending}
                className={`text-sm px-3 py-1.5 text-white rounded font-medium disabled:opacity-50 ${
                  resolveModal.mode === "action"
                    ? sanctionKind === "ban"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-slate-700 hover:bg-slate-800"
                }`}
              >
                {pending
                  ? "Envoi…"
                  : resolveModal.mode === "action"
                    ? confirmLabelForKind(sanctionKind, suspendDays)
                    : "Rejeter le signalement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type SanctionChoice = {
  kind: SanctionKind;
  label: string;
  hint?: string;
  /** Si renseigné, l'option est désactivée et la chaîne est affichée comme raison. */
  disabled?: string;
};

function buildSanctionChoices(
  report: AdminReport,
  myLevel: AdminLevel,
  canBan: boolean,
): SanctionChoice[] {
  const hasMessage = report.body_preview != null;
  const hasSender = report.sender_id != null;
  const noSender = "Auteur du compte introuvable (compte supprimé).";
  const noMessage = "Le message a déjà été supprimé.";

  return [
    {
      kind: "delete_message",
      label: "Supprimer le message",
      hint: "Le message disparaît pour tous les participants.",
      disabled: hasMessage ? undefined : noMessage,
    },
    {
      kind: "warn",
      label: "Avertir l'auteur",
      hint: "Incrémente le compteur d'avertissements, visible côté membre.",
      disabled: hasSender ? undefined : noSender,
    },
    {
      kind: "suspend",
      label: "Suspendre l'auteur",
      hint:
        myLevel === 2
          ? "Empêche l'accès au site jusqu'à la date choisie (max 30 jours)."
          : "Empêche l'accès au site jusqu'à la date choisie.",
      disabled: hasSender ? undefined : noSender,
    },
    ...(canBan
      ? [
          {
            kind: "ban" as const,
            label: "Bannir l'auteur",
            hint: "Bannissement permanent. Le compte n'est pas supprimé.",
            disabled: hasSender ? undefined : noSender,
          },
        ]
      : []),
    {
      kind: "none",
      label: "Aucune sanction",
      hint: "Marque le signalement comme traité sans appliquer de sanction.",
    },
  ];
}

function confirmLabelForKind(kind: SanctionKind, days: number): string {
  switch (kind) {
    case "delete_message":
      return "Supprimer le message et clore";
    case "warn":
      return "Avertir et clore";
    case "suspend":
      return `Suspendre ${days} j et clore`;
    case "ban":
      return "Bannir et clore";
    case "none":
      return "Marquer traité";
  }
}
